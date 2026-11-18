// Draws ClipDeck's app + tray icons as PNGs with zero image dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build');
mkdirSync(outDir, { recursive: true });

/* ---------- tiny PNG encoder ---------- */
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- drawing helpers ---------- */
function canvas(w, h) {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) };
}
function blend(c, x, y, r, g, b, a) {
  if (a <= 0) return;
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const sa = Math.min(1, a);
  const da = c.data[i + 3] / 255;
  const oa = sa + da * (1 - sa);
  if (oa <= 0) return;
  c.data[i] = (r * sa + c.data[i] * da * (1 - sa)) / oa;
  c.data[i + 1] = (g * sa + c.data[i + 1] * da * (1 - sa)) / oa;
  c.data[i + 2] = (b * sa + c.data[i + 2] * da * (1 - sa)) / oa;
  c.data[i + 3] = oa * 255;
}
function sdRoundRect(x, y, w, h, r, px, py) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const qx = Math.abs(px - cx) - (w / 2 - r);
  const qy = Math.abs(py - cy) - (h / 2 - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}
function fillRound(c, x, y, w, h, r, colorFn) {
  for (let py = Math.floor(y - 1); py <= Math.ceil(y + h + 1); py++) {
    for (let px = Math.floor(x - 1); px <= Math.ceil(x + w + 1); px++) {
      const d = sdRoundRect(x, y, w, h, r, px + 0.5, py + 0.5);
      const a = Math.max(0, Math.min(1, 0.5 - d));
      if (a <= 0) continue;
      const col = colorFn((px - x) / w, (py - y) / h, px, py);
      blend(c, px, py, col[0], col[1], col[2], a * (col[3] ?? 1));
    }
  }
}
function strokeRound(c, x, y, w, h, r, width, colorFn) {
  for (let py = Math.floor(y - 2); py <= Math.ceil(y + h + 2); py++) {
    for (let px = Math.floor(x - 2); px <= Math.ceil(x + w + 2); px++) {
      const d = Math.abs(sdRoundRect(x, y, w, h, r, px + 0.5, py + 0.5)) - width / 2;
      const a = Math.max(0, Math.min(1, 0.5 - d));
      if (a <= 0) continue;
      const col = colorFn((px - x) / w, (py - y) / h, px, py);
      blend(c, px, py, col[0], col[1], col[2], a * (col[3] ?? 1));
    }
  }
}
function fillCircle(c, cx, cy, radius, colorFn) {
  for (let py = Math.floor(cy - radius - 1); py <= Math.ceil(cy + radius + 1); py++) {
    for (let px = Math.floor(cx - radius - 1); px <= Math.ceil(cx + radius + 1); px++) {
      const d = Math.hypot(px + 0.5 - cx, py + 0.5 - cy) - radius;
      const a = Math.max(0, Math.min(1, 0.5 - d));
      if (a <= 0) continue;
      const col = colorFn(px, py);
      blend(c, px, py, col[0], col[1], col[2], a * (col[3] ?? 1));
    }
  }
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function mix(c1, c2, t) {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}
function downsample(src, factor) {
  const w = src.w / factor;
  const h = src.h / factor;
  const out = canvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * src.w + (x * factor + sx)) * 4;
          const sa = src.data[i + 3] / 255;
          r += src.data[i] * sa;
          g += src.data[i + 1] * sa;
          b += src.data[i + 2] * sa;
          a += sa;
        }
      }
      const n = factor * factor;
      const i = (y * w + x) * 4;
      if (a > 0) {
        out.data[i] = r / a;
        out.data[i + 1] = g / a;
        out.data[i + 2] = b / a;
        out.data[i + 3] = (a / n) * 255;
      }
    }
  }
  return out;
}

/* ---------- the mark ---------- */
const PAPER = [241, 231, 214];
const ORANGE = [255, 90, 43];

function drawGlyph(c, scale, ox, oy, opts = {}) {
  const { tile = false, outline = false } = opts;
  const gx = (x) => ox + x * scale;
  const gy = (y) => oy + y * scale;
  const s = (v) => v * scale;

  if (tile) {
    fillRound(c, gx(0), gy(0), s(256), s(256), s(64), (u, v) => {
      const col = mix([24, 19, 14], [9, 7, 5], Math.min(1, v * 1.2));
      return [...col, 1];
    });
    strokeRound(c, gx(0.5), gy(0.5), s(255), s(255), s(63.5), s(1.4), () => [241, 231, 214, 0.12]);
    // soft top glow
    fillCircle(c, gx(150), gy(20), s(110), () => [255, 90, 43, 0.09]);
  }

  // clipboard body
  if (outline) {
    strokeRound(c, gx(64), gy(58), s(128), s(150), s(26), s(7), (u, v) => [...mix(PAPER, ORANGE, v), 1]);
    strokeRound(c, gx(64), gy(58), s(128), s(150), s(26), s(2.2), () => [7, 8, 14, 1]);
  } else {
    fillRound(c, gx(64), gy(58), s(128), s(150), s(26), (u, v) => [241, 231, 214, 0.06 + v * 0.02]);
    strokeRound(c, gx(64), gy(58), s(128), s(150), s(26), s(2), () => [241, 231, 214, 0.22]);
  }

  // top clip
  fillRound(c, gx(100), gy(40), s(56), s(34), s(13), (u, v) => [
    ...mix(PAPER, ORANGE, Math.min(1, u * 0.85 + v * 0.25)),
    1,
  ]);
  if (!outline) {
    fillRound(c, gx(120), gy(53), s(16), s(8), s(4), () => [9, 7, 5, 0.8]);
  }

  // content lines
  const line = (x, y, w, tint) => {
    fillRound(c, gx(x), gy(y), s(w), s(12), s(6), () => [...tint, outline ? 1 : 0.92]);
  };
  line(88, 96, 80, PAPER);
  if (outline) {
    line(88, 126, 62, PAPER);
    line(88, 156, 74, ORANGE);
  } else {
    fillRound(c, gx(88), gy(124), s(60), s(12), s(6), () => [241, 231, 214, 0.6]);
    line(88, 152, 72, ORANGE);
  }

  // spark
  fillCircle(c, gx(196), gy(196), s(9), () => [...ORANGE, 1]);
}

function build(size, kind) {
  const S = 4;
  const big = canvas(size * S, size * S);
  const scale = (size * S) / 256;
  if (kind === 'tray') {
    // Tile-backed glyph stays readable on both light and dark Windows taskbars.
    drawGlyph(big, scale * 0.94, 6 * scale, 6 * scale, { tile: true });
  } else {
    drawGlyph(big, scale, 0, 0, { tile: true });
  }
  return downsample(big, S);
}

for (const [file, size, kind] of [
  ['icon.png', 256, 'app'],
  ['icon@2x.png', 512, 'app'],
  ['tray.png', 32, 'tray'],
  ['tray@2x.png', 64, 'tray'],
]) {
  const c = build(size, kind);
  writeFileSync(join(outDir, file), encodePng(c.w, c.h, c.data));
  console.log(`wrote build/${file} (${c.w}x${c.h})`);
}

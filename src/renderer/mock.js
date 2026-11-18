/* Browser-only fallback so the deck can be previewed outside Electron. */
(function () {
  'use strict';
  if (window.clipdeck) return;

  function mockImage() {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#f1e7d6';
    ctx.fillRect(0, 0, 960, 600);

    ctx.fillStyle = '#17130f';
    ctx.fillRect(54, 54, 432, 492);

    ctx.fillStyle = '#ff5a2b';
    ctx.beginPath();
    ctx.arc(702, 234, 126, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(27,22,16,.16)';
    ctx.lineWidth = 1;
    for (let y = 104; y < 560; y += 42) {
      ctx.beginPath();
      ctx.moveTo(540, y);
      ctx.lineTo(906, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#f1e7d6';
    ctx.font = '600 78px "Bahnschrift", "Segoe UI", sans-serif';
    ctx.fillText('CLIP', 88, 196);
    ctx.fillText('DECK', 88, 278);

    ctx.fillStyle = '#ff5a2b';
    ctx.font = '500 16px "Cascadia Mono", Consolas, monospace';
    ctx.fillText('FIELD NOTES / 04', 92, 340);

    ctx.fillStyle = 'rgba(241,231,214,.6)';
    ctx.font = '400 14px "Cascadia Mono", Consolas, monospace';
    ctx.fillText('A DRAWER THAT KNOWS', 92, 474);
    ctx.fillText('WHAT YOU NEED.', 92, 496);

    ctx.fillStyle = '#17130f';
    ctx.font = '400 13px "Cascadia Mono", Consolas, monospace';
    ctx.fillText('CLIPDECK / MEMORY', 556, 420);
    ctx.fillText('960 × 600 / 2.4 MB', 556, 442);

    ctx.fillStyle = '#ff5a2b';
    ctx.fillRect(556, 468, 350, 3);

    ctx.fillStyle = '#17130f';
    for (let i = 0; i < 18; i++) {
      const width = i % 4 === 0 ? 3 : i % 3 === 0 ? 1 : 2;
      ctx.fillRect(556 + i * 11, 492, width, 34);
    }

    return canvas.toDataURL('image/png');
  }

  const now = Date.now();
  const image = mockImage();

  const items = [
    {
      id: 'mock-1',
      kind: 'text',
      text: 'Make the next thing feel inevitable.',
      createdAt: now - 42 * 1000,
      lastUsedAt: now - 42 * 1000,
      pinned: true,
      chars: 38,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-2',
      kind: 'text',
      text: 'https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter',
      createdAt: now - 4 * 60 * 1000,
      lastUsedAt: now - 4 * 60 * 1000,
      pinned: false,
      chars: 66,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-3',
      kind: 'text',
      text: 'const deck = new ClipDeck({\n  edge: "top-centre",\n  motion: "spring",\n  alwaysOnTop: true\n});\n\ndeck.summon();',
      createdAt: now - 11 * 60 * 1000,
      lastUsedAt: now - 11 * 60 * 1000,
      pinned: false,
      chars: 107,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-4',
      kind: 'image',
      text: '',
      thumb: image,
      full: image,
      createdAt: now - 26 * 60 * 1000,
      lastUsedAt: now - 26 * 60 * 1000,
      pinned: false,
      chars: 0,
      bytes: 2480000,
      width: 960,
      height: 600,
    },
    {
      id: 'mock-5',
      kind: 'text',
      text: 'Launch plan — Thursday\n\n• 09:00  final pass on the drop animation\n• 10:30  record the 20s loop\n• 13:00  ship to the deck\n• 16:00  watch people use it without instructions',
      createdAt: now - 48 * 60 * 1000,
      lastUsedAt: now - 48 * 60 * 1000,
      pinned: false,
      chars: 190,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-6',
      kind: 'text',
      text: '#14110D  ·  #F1E7D6  ·  #FF5A2B  ·  #6E6252',
      createdAt: now - 2 * 60 * 60 * 1000,
      lastUsedAt: now - 2 * 60 * 60 * 1000,
      pinned: false,
      chars: 43,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-7',
      kind: 'text',
      text: 'hello@clipdeck.studio',
      createdAt: now - 5 * 60 * 60 * 1000,
      lastUsedAt: now - 5 * 60 * 60 * 1000,
      pinned: false,
      chars: 21,
      bytes: 0,
      width: 0,
      height: 0,
    },
    {
      id: 'mock-8',
      kind: 'text',
      text: 'A clipboard should feel less like a spreadsheet and more like a drawer that knows what you need.',
      createdAt: now - 26 * 60 * 60 * 1000,
      lastUsedAt: now - 26 * 60 * 60 * 1000,
      pinned: false,
      chars: 101,
      bytes: 0,
      width: 0,
      height: 0,
    },
  ];

  let paused = false;
  let launchAtLogin = true;

  const clone = () => JSON.parse(JSON.stringify(items));
  const state = () => ({
    items: clone(),
    paused,
    launchAtLogin,
    shortcut: 'Ctrl+Alt+V',
    version: '1.0.0',
    platform: 'win32',
    electron: false,
  });

  window.clipdeck = {
    isElectron: false,
    getState: async () => state(),
    list: async () => clone(),
    copy: async (id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return { ok: false, items: clone() };
      item.lastUsedAt = Date.now();
      if (item.kind === 'text' && navigator.clipboard) {
        navigator.clipboard.writeText(item.text).catch(() => {});
      }
      return { ok: true, kind: item.kind, items: clone() };
    },
    pin: async (id) => {
      const item = items.find((entry) => entry.id === id);
      if (!item) return { ok: false, items: clone() };
      item.pinned = !item.pinned;
      return { ok: true, pinned: item.pinned, items: clone() };
    },
    remove: async (id) => {
      const index = items.findIndex((entry) => entry.id === id);
      if (index >= 0) items.splice(index, 1);
      return { ok: index >= 0, items: clone() };
    },
    clear: async () => {
      items.length = 0;
      return { ok: true, items: [] };
    },
    setPaused: async (value) => {
      paused = Boolean(value);
      return state();
    },
    setLaunchAtLogin: async (value) => {
      launchAtLogin = Boolean(value);
      return state();
    },
    hide: () => window.dispatchEvent(new CustomEvent('clipdeck:mock-hide')),
    concealed: () => {},
    pointer: () => {},
    onReveal: () => () => {},
    onConceal: () => () => {},
    onUpdate: () => () => {},
    onState: () => () => {},
  };

  window.__clipdeckMock = true;
})();

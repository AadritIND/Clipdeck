'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  protocol,
  screen,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const { JsonFile } = require('./store');

const APP_ID = 'com.clipdeck.app';
const ROOT = path.join(__dirname, '..');
const PRELOAD = path.join(__dirname, 'preload.js');
const RENDERER = path.join(__dirname, 'renderer', 'index.html');
const APP_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.join(ROOT, 'build', 'icon.png');
const TRAY_ICON = app.isPackaged
  ? path.join(process.resourcesPath, 'tray.png')
  : path.join(ROOT, 'build', 'tray.png');

const MAX_CLIPS = 120;
const MAX_TEXT = 1_000_000;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const POLL_MS = 850;
const EDGE_POLL_MS = 55;
const EDGE_PX = 10;
// The deck only drops after the cursor rests on the top-centre edge this long.
// The user can adjust the delay between these limits from the deck settings.
const DEFAULT_EDGE_DWELL_MS = 1600;
const MIN_EDGE_DWELL_MS = 500;
const MAX_EDGE_DWELL_MS = 5000;
const LEAVE_GRACE_MS = 180;
const UPDATE_CHECK_DELAY_MS = 12_000;
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const UPDATE_REVEAL_INTERVAL_MS = 30 * 60 * 1000;

// The renderer loads local files and image thumbnails through this scheme.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipdeck',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

app.setAppUserModelId(APP_ID);
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
if (process.argv.includes('--inspect-ui')) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222');
}

let panel = null;
let tray = null;
let clipStore = null;
let settingsStore = null;
let mediaDir = '';
let clips = [];
let settings = {
  launchAtLogin: true,
  paused: false,
  seenWelcome: false,
  edgeDwellMs: DEFAULT_EDGE_DWELL_MS,
  historyLimit: MAX_CLIPS,
};

let isReady = false;
let isOpen = false;
let isQuitting = false;
let revealQueued = false;
let pointerEntered = false;
let lastInsideAt = 0;
let hideTimer = null;
let edgeTimer = null;
let pollTimer = null;
let blurArmAt = 0;
let edgeArmedAt = 0;
let edgeMustLeave = false;
let activeShortcut = '';
let pollBusy = false;
let lastTextHash = '';
let lastImageHash = '';
let watcherArmed = false;
let readyWarned = false;
let updateTimer = null;
let updateBusy = false;
let manualUpdateCheck = false;
let updateState = {
  enabled: false,
  status: 'idle',
  version: null,
  percent: 0,
  message: '',
  checkedAt: 0,
};

const launchedHidden = process.argv.includes('--hidden') || process.argv.includes('--silent');
const idPattern = /^[a-zA-Z0-9-]{6,64}$/;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function hashOf(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function newId() {
  return crypto.randomUUID();
}

function clampEdgeDwell(value) {
  const ms = Math.round(Number(value));
  if (!Number.isFinite(ms)) return DEFAULT_EDGE_DWELL_MS;
  return Math.max(MIN_EDGE_DWELL_MS, Math.min(MAX_EDGE_DWELL_MS, ms));
}

function edgeDwellSeconds() {
  return (clampEdgeDwell(settings.edgeDwellMs) / 1000).toFixed(1);
}

function humanCount(n) {
  return n === 1 ? '1 clip' : `${n} clips`;
}

function clipPath(id, suffix = '') {
  return path.join(mediaDir, `${id}${suffix}.png`);
}

function removeMedia(id) {
  for (const file of [clipPath(id), clipPath(id, '.thumb')]) {
    try {
      fs.unlinkSync(file);
    } catch {
      /* already gone */
    }
  }
}

function publicClip(clip) {
  const image = clip.kind === 'image';
  return {
    id: clip.id,
    kind: clip.kind,
    text: clip.text || '',
    thumb: image ? `clipdeck://thumb/${clip.id}.png?v=${clip.createdAt}` : null,
    full: image ? `clipdeck://media/${clip.id}.png?v=${clip.createdAt}` : null,
    createdAt: clip.createdAt,
    lastUsedAt: clip.lastUsedAt,
    pinned: Boolean(clip.pinned),
    chars: clip.chars || 0,
    bytes: clip.bytes || 0,
    width: clip.width || 0,
    height: clip.height || 0,
  };
}

function allItems() {
  return clips.map(publicClip);
}

function saveClips() {
  clipStore.data.clips = clips;
  clipStore.save();
}

function saveSettings() {
  settingsStore.data = { ...settingsStore.data, ...settings };
  settingsStore.save();
}

function sendToPanel(channel, payload) {
  if (panel && !panel.isDestroyed() && !panel.webContents.isDestroyed()) {
    panel.webContents.send(channel, payload);
  }
}

function broadcastClips() {
  sendToPanel('clips:updated', allItems());
  updateTrayMenu();
}

function statePayload() {
  return {
    paused: Boolean(settings.paused),
    launchAtLogin: isLaunchAtLogin(),
    edgeDwellMs: clampEdgeDwell(settings.edgeDwellMs),
    shortcut: activeShortcut,
    version: app.getVersion(),
    platform: process.platform,
    electron: true,
    update: { ...updateState },
  };
}

function broadcastState() {
  sendToPanel('state:changed', statePayload());
  updateTrayMenu();
}

/* ------------------------------------------------------------------ */
/* storage                                                             */
/* ------------------------------------------------------------------ */

function isStoredClip(value) {
  if (!value || typeof value !== 'object') return false;
  if (!idPattern.test(String(value.id || ''))) return false;
  if (value.kind !== 'text' && value.kind !== 'image') return false;
  if (value.kind === 'text' && typeof value.text !== 'string') return false;
  if (value.kind === 'image' && !fs.existsSync(clipPath(value.id))) return false;
  return true;
}

function normalizeStored(value) {
  return {
    id: value.id,
    kind: value.kind,
    text: value.kind === 'text' ? value.text : '',
    hash: typeof value.hash === 'string' ? value.hash : '',
    createdAt: Number(value.createdAt) || Date.now(),
    lastUsedAt: Number(value.lastUsedAt) || Number(value.createdAt) || Date.now(),
    pinned: Boolean(value.pinned),
    chars: Number(value.chars) || 0,
    bytes: Number(value.bytes) || 0,
    width: Number(value.width) || 0,
    height: Number(value.height) || 0,
  };
}

function initStorage() {
  const base = app.getPath('userData');
  mediaDir = path.join(base, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });

  clipStore = new JsonFile(path.join(base, 'clips.json'), { clips: [] });
  settingsStore = new JsonFile(path.join(base, 'settings.json'), settings);
  settings = { ...settings, ...settingsStore.data };
  settings.edgeDwellMs = clampEdgeDwell(settings.edgeDwellMs);

  // One-time repair: v1's dev-mode login item could vanish across restarts.
  // Re-arm startup once, then respect whatever the user chooses afterwards.
  if (!settings.autostartFixed) {
    settings.launchAtLogin = true;
    settings.autostartFixed = true;
    saveSettings();
  }

  const stored = Array.isArray(clipStore.data.clips) ? clipStore.data.clips : [];
  clips = stored.filter(isStoredClip).map(normalizeStored);

  // Repair any missing hashes so dedupe keeps working after upgrades.
  for (const clip of clips) {
    if (!clip.hash) {
      clip.hash =
        clip.kind === 'text'
          ? hashOf(`text:${clip.text}`)
          : hashOf(fs.readFileSync(clipPath(clip.id)));
    }
  }
  saveClips();
}

function pruneClips() {
  const limit = Math.max(20, Number(settings.historyLimit) || MAX_CLIPS);
  if (clips.length <= limit) return;
  const kept = [];
  const dropped = [];
  for (const clip of clips) {
    if (clip.pinned || kept.length < limit) kept.push(clip);
    else dropped.push(clip);
  }
  clips = kept;
  for (const clip of dropped) removeMedia(clip.id);
}

/* ------------------------------------------------------------------ */
/* clipboard capture                                                   */
/* ------------------------------------------------------------------ */

function bumpExisting(clip, now) {
  clip.createdAt = now;
  clip.lastUsedAt = now;
  clips = [clip, ...clips.filter((entry) => entry !== clip)];
  saveClips();
  broadcastClips();
}

function captureText(text, hash) {
  if (text.length > MAX_TEXT) return;
  const now = Date.now();
  console.log(`[clipboard] text captured (${text.length} chars)`);
  const existing = clips.find((clip) => clip.hash === hash);
  if (existing) {
    bumpExisting(existing, now);
    return;
  }
  clips.unshift({
    id: newId(),
    kind: 'text',
    text,
    hash,
    createdAt: now,
    lastUsedAt: now,
    pinned: false,
    chars: text.length,
  });
  pruneClips();
  saveClips();
  broadcastClips();
}

function captureImage(image, hash) {
  const now = Date.now();
  const existing = clips.find((clip) => clip.hash === hash);
  if (existing) {
    bumpExisting(existing, now);
    return;
  }

    const png = image.toPNG();
  if (!png || png.length > MAX_IMAGE_BYTES) return;
  const id = newId();
  const size = image.getSize();
  console.log(`[clipboard] image captured (${size.width}x${size.height}, ${Math.round(png.length / 1024)} KB)`);
  try {
    fs.writeFileSync(clipPath(id), png);
    const thumbWidth = Math.min(640, size.width);
    const thumb = size.width > thumbWidth ? image.resize({ width: thumbWidth, quality: 'good' }) : image;
    fs.writeFileSync(clipPath(id, '.thumb'), thumb.toPNG());
  } catch (error) {
    console.error('[clipboard] could not persist image', error);
    removeMedia(id);
    return;
  }

  clips.unshift({
    id,
    kind: 'image',
    text: '',
    hash,
    createdAt: now,
    lastUsedAt: now,
    pinned: false,
    bytes: png.length,
    width: size.width,
    height: size.height,
  });
  pruneClips();
  saveClips();
  broadcastClips();
}

function pollClipboard() {
  if (pollBusy || settings.paused) return;
  if (!isReady) {
    if (!readyWarned) {
      readyWarned = true;
      console.log('[clipboard] waiting for the panel to load');
    }
    return;
  }
  if (!watcherArmed) {
    watcherArmed = true;
    console.log('[clipboard] watcher armed');
  }
  pollBusy = true;
  try {
    const text = clipboard.readText();
    if (text && text.trim()) {
      const hash = hashOf(`text:${text}`);
      if (hash !== lastTextHash) {
        lastTextHash = hash;
        lastImageHash = '';
        captureText(text, hash);
      }
      return;
    }

    const image = clipboard.readImage();
    if (image.isEmpty()) return;
    const size = image.getSize();
    if (size.width < 8 || size.height < 8) return;

    // Hash a tiny probe so a 4K screenshot isn't reserialized every tick.
    const probe = image.resize({ width: 48, height: 48, quality: 'good' });
    const hash = hashOf(probe.toBitmap());
    if (hash !== lastImageHash) {
      lastImageHash = hash;
      lastTextHash = '';
      captureImage(image, hash);
    }
  } catch (error) {
    console.error('[clipboard] poll failed', error);
  } finally {
    pollBusy = false;
  }
}

/* ------------------------------------------------------------------ */
/* startup shortcut                                                    */
/* ------------------------------------------------------------------ */

function startupLinkPath() {
  return path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    'ClipDeck.lnk',
  );
}

/**
 * A real Startup shortcut is far more dependable than app.setLoginItemSettings
 * when the app runs from electron.exe in development: it points at the project
 * by absolute path, survives restarts, and shows up in Task Manager > Startup.
 */
function updateWindowsShortcut(enabled) {
  const link = startupLinkPath();
  try {
    if (!enabled) {
      fs.rmSync(link, { force: true });
    } else {
      fs.mkdirSync(path.dirname(link), { recursive: true });
      const script = [
        '$ErrorActionPreference = "Stop"',
        '$ws = New-Object -ComObject WScript.Shell',
        '$sc = $ws.CreateShortcut($env:CLIPDECK_LINK)',
        '$sc.TargetPath = $env:CLIPDECK_TARGET',
        '$sc.Arguments = $env:CLIPDECK_ARGS',
        '$sc.WorkingDirectory = $env:CLIPDECK_CWD',
        '$sc.IconLocation = "$($env:CLIPDECK_TARGET),0"',
        '$sc.Description = "ClipDeck clipboard deck"',
        '$sc.Save()',
      ].join('; ');
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
        {
          windowsHide: true,
          timeout: 20000,
          env: {
            ...process.env,
            CLIPDECK_LINK: link,
            CLIPDECK_TARGET: process.execPath,
            CLIPDECK_ARGS: app.isPackaged ? '--hidden' : `"${ROOT}" --hidden`,
            CLIPDECK_CWD: app.isPackaged ? path.dirname(process.execPath) : ROOT,
          },
        },
      );
      console.log(`[login] startup shortcut written: ${fs.existsSync(link)}`);
    }
  } catch (error) {
    console.error('[login] could not update the startup shortcut:', error.message);
  }
  return fs.existsSync(link);
}

function isLaunchAtLogin() {
  try {
    if (process.platform === 'win32') return fs.existsSync(startupLinkPath());
    if (process.platform === 'darwin') return Boolean(app.getLoginItemSettings().openAtLogin);
  } catch {
    /* unreadable */
  }
  return false;
}

function setLaunchAtLogin(enabled) {
  try {
    if (process.platform === 'win32') return updateWindowsShortcut(Boolean(enabled));
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
      return isLaunchAtLogin();
    }
  } catch (error) {
    console.error('[login] could not update the startup item', error);
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

function boundsFor(display) {
  const area = display.workArea;
  // A wide, low shelf: broad enough to scan several clips side by side,
  // but shallow so it never swallows the window you are working in.
  const width = Math.round(
    Math.min(1180, Math.max(860, area.width * 0.72), area.width - 32),
  );
  const height = Math.round(
    Math.min(360, Math.max(300, area.height * 0.35), area.height - 16),
  );
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y),
    width,
    height,
  };
}

function insideBounds(point, bounds) {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

function createPanel() {
  panel = new BrowserWindow({
    ...boundsFor(screen.getPrimaryDisplay()),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    title: 'ClipDeck',
    icon: APP_ICON,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: true,
    },
  });

  panel.setMenu(null);
  panel.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  panel.loadFile(RENDERER);

  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', (event) => event.preventDefault());
  panel.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[panel] failed to load', code, description);
  });
  panel.webContents.on('render-process-gone', (_event, details) => {
    console.error('[panel] renderer gone', details);
  });
  panel.webContents.on('console-message', (...args) => {
    const first = args[0];
    if (first && typeof first === 'object' && typeof first.message === 'string') {
      console.log('[renderer]', first.message);
    } else if (typeof args[2] === 'string') {
      console.log('[renderer]', args[2]);
    }
  });

  panel.on('blur', () => {
    if (!isOpen || isQuitting) return;
    if (Date.now() < blurArmAt) return;
    if (panel.webContents.isDevToolsOpened()) return;
    hidePanel('blur');
  });

  panel.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hidePanel('close');
  });

  panel.on('closed', () => {
    panel = null;
  });

  panel.webContents.on('did-finish-load', () => {
    isReady = true;
    console.log('[panel] renderer loaded');
    panel.webContents.send('updates:state', { ...updateState });
    if (revealQueued) {
      revealQueued = false;
      revealPanel('queued');
    }
  });
}

function revealPanel(reason = 'manual') {
  if (!panel || panel.isDestroyed()) return;
  if (!isReady) {
    revealQueued = true;
    return;
  }

  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = boundsFor(display);
  panel.setBounds(bounds);
  panel.setAlwaysOnTop(true, 'screen-saver');

  if (!isOpen) {
    clearTimeout(hideTimer);
    console.log('[panel] reveal ←', reason);
    isOpen = true;
    pointerEntered = reason === 'edge' || insideBounds(cursor, bounds);
    lastInsideAt = Date.now();
    blurArmAt = Date.now() + 320;
    saveSettings();
    updateTrayMenu();
  }

  if (panel.isMinimized()) panel.restore();

  // Hovering the screen edge must never steal keystrokes from the app you are
  // typing in. Hotkey/tray openings do take focus so the keyboard works there.
  if (reason === 'edge') {
    panel.showInactive();
  } else {
    panel.show();
    panel.focus();
    panel.webContents.focus();
  }
  panel.webContents.send('panel:reveal', { reason, focused: reason !== 'edge' });
  maybeCheckForUpdates();
}

function hidePanel(reason = 'manual') {
  if (!panel || panel.isDestroyed() || !isOpen) return;
  isOpen = false;
  pointerEntered = false;
  console.log('[panel] hide ←', reason);
  edgeMustLeave = true;
  updateTrayMenu();
  panel.webContents.send('panel:conceal', { reason });
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!isOpen && panel && !panel.isDestroyed()) panel.hide();
  }, 430);
}

function finishHide() {
  clearTimeout(hideTimer);
  if (!isOpen && panel && !panel.isDestroyed()) panel.hide();
}

function togglePanel(reason) {
  if (isOpen) hidePanel(reason);
  else revealPanel(reason);
}

/* ------------------------------------------------------------------ */
/* edge detection                                                      */
/* ------------------------------------------------------------------ */

function watchEdge() {
  if (!isReady || !panel) return;
  const point = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(point);
  const area = display.workArea;
  const half = Math.min(480, area.width * 0.25);
  const inEdge =
    point.y >= area.y - 1 &&
    point.y <= area.y + EDGE_PX &&
    Math.abs(point.x - (area.x + area.width / 2)) <= half;

  if (!inEdge) {
    edgeArmedAt = 0;
    edgeMustLeave = false;
    return;
  }

  if (isOpen) return;
  if (edgeMustLeave) return;

  if (!edgeArmedAt) {
    edgeArmedAt = Date.now();
    return;
  }
  if (Date.now() - edgeArmedAt < clampEdgeDwell(settings.edgeDwellMs)) return;

  edgeArmedAt = 0;
  revealPanel('edge');
}

function watchDismissal(point) {
  if (!isOpen || !panel) return;
  const bounds = panel.getBounds();
  if (insideBounds(point, bounds)) {
    pointerEntered = true;
    lastInsideAt = Date.now();
    return;
  }
  // Only close after the pointer has actually been inside once: a keyboard-open
  // panel with the cursor parked elsewhere should not vanish immediately.
  if (pointerEntered && Date.now() - lastInsideAt > LEAVE_GRACE_MS) {
    hidePanel('leave');
  }
}

function startMonitors() {
  pollTimer = setInterval(pollClipboard, POLL_MS);
  edgeTimer = setInterval(() => {
    if (!panel || !isReady) return;
    const point = screen.getCursorScreenPoint();
    watchEdge();
    watchDismissal(point);
  }, EDGE_POLL_MS);
}

/* ------------------------------------------------------------------ */
/* tray                                                                */
/* ------------------------------------------------------------------ */

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const launchAtLogin = isLaunchAtLogin();
  const menu = Menu.buildFromTemplate([
    {
      label: isOpen ? 'Hide ClipDeck' : 'Open ClipDeck',
      accelerator: activeShortcut || undefined,
      click: () => togglePanel('tray'),
    },
    { type: 'separator' },
    {
      label: settings.paused ? 'Resume watching clipboard' : 'Pause watching clipboard',
      click: () => setPaused(!settings.paused),
    },
    {
      label: 'Launch at login',
      type: 'checkbox',
      checked: launchAtLogin,
      click: (item) => {
        const actual = setLaunchAtLogin(item.checked);
        settings.launchAtLogin = actual;
        saveSettings();
        broadcastState();
      },
    },
    { type: 'separator' },
    updateTrayItem(),
    { type: 'separator' },
    { label: humanCount(clips.length), enabled: false },
    {
      label: 'Clear history…',
      enabled: clips.length > 0,
      click: () => clearHistory(true),
    },
    { type: 'separator' },
    { label: 'Quit ClipDeck', click: quitApp },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(
    `ClipDeck — ${humanCount(clips.length)}${settings.paused ? ' · paused' : ''} · hold top edge ${edgeDwellSeconds()}s`,
  );
}

function createTray() {
  let icon = nativeImage.createFromPath(TRAY_ICON);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(APP_ICON);
  tray = new Tray(icon);
  tray.setToolTip('ClipDeck');
  tray.on('click', () => togglePanel('tray'));
  tray.on('double-click', () => revealPanel('tray'));
  updateTrayMenu();
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

function setPaused(paused) {
  settings.paused = Boolean(paused);
  saveSettings();
  broadcastState();
  if (!settings.paused) {
    pollClipboard();
  }
}

function clearHistory(confirmFirst) {
  if (confirmFirst && clips.length > 0) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      buttons: ['Cancel', 'Clear everything'],
      defaultId: 0,
      cancelId: 0,
      title: 'Clear ClipDeck history?',
      message: 'Clear all clipboard history?',
      detail: 'Pinned clips and saved images will be deleted. This cannot be undone.',
      noLink: true,
    });
    if (choice !== 1) return { ok: false, cancelled: true, items: allItems() };
  }
  for (const clip of clips) removeMedia(clip.id);
  clips = [];
  saveClips();
  broadcastClips();
  return { ok: true, items: [] };
}

function quitApp() {
  isQuitting = true;
  clearInterval(pollTimer);
  clearInterval(edgeTimer);
  clearTimeout(hideTimer);
  globalShortcut.unregisterAll();
  if (tray && !tray.isDestroyed()) tray.destroy();
  app.quit();
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function registerIpc() {
  ipcMain.handle('state:get', () => ({
    ...statePayload(),
    items: allItems(),
  }));

  ipcMain.handle('clips:list', () => allItems());

  ipcMain.handle('clips:copy', (_event, id) => {
    if (!idPattern.test(String(id || ''))) return { ok: false, items: allItems() };
    const clip = clips.find((entry) => entry.id === id);
    if (!clip) return { ok: false, items: allItems() };

    try {
      if (clip.kind === 'image') {
        const image = nativeImage.createFromPath(clipPath(clip.id));
        if (image.isEmpty()) {
          removeMedia(clip.id);
          clips = clips.filter((entry) => entry !== clip);
          saveClips();
          broadcastClips();
          return { ok: false, items: allItems() };
        }
        clipboard.writeImage(image);
        lastImageHash = clip.hash;
        lastTextHash = '';
      } else {
        clipboard.writeText(clip.text);
        lastTextHash = clip.hash;
        lastImageHash = '';
      }
      clip.lastUsedAt = Date.now();
      saveClips();
      return { ok: true, kind: clip.kind, items: allItems() };
    } catch (error) {
      console.error('[clipboard] copy failed', error);
      return { ok: false, items: allItems() };
    }
  });

  ipcMain.handle('clips:pin', (_event, id) => {
    const clip = clips.find((entry) => entry.id === id);
    if (!clip) return { ok: false, items: allItems() };
    clip.pinned = !clip.pinned;
    saveClips();
    updateTrayMenu();
    return { ok: true, pinned: clip.pinned, items: allItems() };
  });

  ipcMain.handle('clips:remove', (_event, id) => {
    const clip = clips.find((entry) => entry.id === id);
    if (!clip) return { ok: false, items: allItems() };
    clips = clips.filter((entry) => entry !== clip);
    removeMedia(clip.id);
    saveClips();
    updateTrayMenu();
    return { ok: true, items: allItems() };
  });

  ipcMain.handle('clips:clear', () => clearHistory(false));

  ipcMain.handle('watch:set', (_event, paused) => {
    setPaused(paused);
    return statePayload();
  });

  ipcMain.handle('settings:launchAtLogin', (_event, enabled) => {
    const actual = setLaunchAtLogin(enabled);
    settings.launchAtLogin = actual;
    saveSettings();
    broadcastState();
    return { ...statePayload(), launchAtLogin: actual };
  });

  ipcMain.handle('settings:edgeDwell', (_event, seconds) => {
    settings.edgeDwellMs = clampEdgeDwell(Number(seconds) * 1000);
    saveSettings();
    broadcastState();
    return statePayload();
  });

  ipcMain.handle('updates:get', () => ({ ...updateState }));
  ipcMain.handle('updates:check', () => checkForUpdates(true));
  ipcMain.handle('updates:download', () => downloadUpdate());
  ipcMain.handle('updates:install', () => installUpdate());

  ipcMain.on('panel:hide', () => hidePanel('renderer'));
  ipcMain.on('panel:concealed', () => finishHide());
  ipcMain.on('panel:pointer', (_event, inside) => {
    if (!isOpen) return;
    if (inside) {
      pointerEntered = true;
      lastInsideAt = Date.now();
    } else if (pointerEntered) {
      lastInsideAt = Math.min(lastInsideAt, Date.now() - LEAVE_GRACE_MS - 1);
    }
  });
}

/* ------------------------------------------------------------------ */
/* shortcuts                                                           */
/* ------------------------------------------------------------------ */

function registerShortcuts() {
  const candidates = ['Control+Alt+V', 'Control+Shift+Space', 'Control+Alt+C'];
  for (const accelerator of candidates) {
    try {
      if (globalShortcut.register(accelerator, () => togglePanel('hotkey'))) {
        activeShortcut = accelerator;
        break;
      }
    } catch {
      /* try the next one */
    }
  }
  if (!activeShortcut) console.warn('[shortcut] no global shortcut could be registered');
}

/* ------------------------------------------------------------------ */
/* updates                                                             */
/* ------------------------------------------------------------------ */

function updateTrayItem() {
  if (!app.isPackaged) {
    return { label: 'Check for updates…', enabled: false };
  }
  if (updateState.status === 'available') {
    return {
      label: `Download update v${updateState.version || ''}`.trim(),
      click: () => downloadUpdate(),
    };
  }
  if (updateState.status === 'downloading') {
    return {
      label: `Downloading update… ${Math.round(updateState.percent || 0)}%`,
      enabled: false,
    };
  }
  if (updateState.status === 'downloaded') {
    return { label: 'Restart to install the update', click: () => installUpdate() };
  }
  if (updateState.status === 'checking') {
    return { label: 'Checking for updates…', enabled: false };
  }
  return { label: 'Check for updates…', click: () => checkForUpdates(true) };
}

function setUpdateState(patch) {
  updateState = { ...updateState, ...patch };
  sendToPanel('updates:state', { ...updateState });
  updateTrayMenu();
}

function showUpdateBalloon(title, content) {
  if (!tray || tray.isDestroyed()) return;
  try {
    tray.displayBalloon({
      title,
      content,
      icon: nativeImage.createFromPath(APP_ICON),
      noSound: true,
    });
  } catch {
    /* Notifications are optional. */
  }
}

function initUpdater() {
  updateState.enabled = app.isPackaged;
  if (!app.isPackaged) {
    updateState.message = 'Update checks are available in the installed Windows app.';
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'available',
      version: info && info.version ? info.version : null,
      percent: 0,
      message: '',
      checkedAt: Date.now(),
    });
    if (manualUpdateCheck) {
      showUpdateBalloon(
        'ClipDeck update available',
        `Version ${updateState.version} is ready to download.`,
      );
      manualUpdateCheck = false;
    }
  });

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'idle',
      version: null,
      percent: 0,
      message: '',
      checkedAt: Date.now(),
    });
    if (manualUpdateCheck) {
      showUpdateBalloon(
        'ClipDeck is up to date',
        `You are running the latest version (${app.getVersion()}).`,
      );
      manualUpdateCheck = false;
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(Number(progress && progress.percent) || 0))),
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      version: info && info.version ? info.version : updateState.version,
      percent: 100,
      message: '',
      checkedAt: Date.now(),
    });
    showUpdateBalloon('ClipDeck update ready', 'Open the deck and choose Restart to update.');
  });

  autoUpdater.on('error', (error) => {
    const message = error && error.message ? error.message : String(error || 'Unknown update error');
    console.error('[updater]', message);
    const wasDownloading = updateState.status === 'downloading';
    const wasManual = manualUpdateCheck;
    manualUpdateCheck = false;
    setUpdateState({
      status: wasManual || wasDownloading ? 'error' : 'idle',
      percent: wasDownloading ? updateState.percent : 0,
      message,
      checkedAt: Date.now(),
    });
    if (wasManual) {
      showUpdateBalloon('ClipDeck update check failed', 'Open the tray menu to try again.');
    }
  });

  updateTimer = setInterval(() => checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS);
  setTimeout(maybeCheckForUpdates, UPDATE_CHECK_DELAY_MS);
  updateTrayMenu();
}

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    return { ...updateState, message: 'Update checks are available in the installed app.' };
  }
  if (updateBusy || updateState.status === 'downloaded') return { ...updateState };

  updateBusy = true;
  manualUpdateCheck = Boolean(manual);
  if (manual) {
    setUpdateState({ status: 'checking', message: 'Checking for updates…', percent: 0 });
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    const message = error && error.message ? error.message : String(error || 'Unknown update error');
    console.error('[updater] check failed', message);
    const wasManual = manualUpdateCheck;
    manualUpdateCheck = false;
    setUpdateState({
      status: wasManual
        ? 'error'
        : updateState.status === 'available' || updateState.status === 'downloaded'
          ? updateState.status
          : 'idle',
      message,
      checkedAt: Date.now(),
    });
    if (wasManual) {
      showUpdateBalloon('ClipDeck update check failed', 'Open the tray menu to try again.');
    }
  } finally {
    updateBusy = false;
  }

  return { ...updateState };
}

async function downloadUpdate() {
  if (!app.isPackaged) return { ...updateState };
  if (updateBusy) return { ...updateState };
  if (updateState.status !== 'available' && updateState.status !== 'error') {
    return { ...updateState };
  }

  updateBusy = true;
  manualUpdateCheck = false;
  setUpdateState({ status: 'downloading', percent: 0, message: '' });

  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    const message = error && error.message ? error.message : String(error || 'Unknown update error');
    console.error('[updater] download failed', message);
    setUpdateState({ status: 'error', message, checkedAt: Date.now() });
  } finally {
    updateBusy = false;
  }

  return { ...updateState };
}

function installUpdate() {
  if (updateState.status !== 'downloaded') return { ok: false, ...updateState };
  setImmediate(() => {
    try {
      isQuitting = true;
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      isQuitting = false;
      console.error('[updater] could not start the installer', error);
    }
  });
  return { ok: true, ...updateState };
}

function maybeCheckForUpdates() {
  if (!app.isPackaged || updateBusy || updateState.status === 'downloaded') return;
  if (Date.now() - updateState.checkedAt < UPDATE_REVEAL_INTERVAL_MS) return;
  checkForUpdates(false);
}

/* ------------------------------------------------------------------ */
/* app lifecycle                                                       */
/* ------------------------------------------------------------------ */

app.on('second-instance', () => revealPanel('second-instance'));

app.on('before-quit', () => {
  isQuitting = true;
  clearInterval(pollTimer);
  clearInterval(edgeTimer);
  clearInterval(updateTimer);
  globalShortcut.unregisterAll();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Tray app: stay alive until Quit is chosen.
});

app.on('activate', () => {
  if (!isQuitting) revealPanel('activate');
});

app.whenReady().then(() => {
  initStorage();

  protocol.handle('clipdeck', (request) => {
    try {
      const url = new URL(request.url);
      const route = url.hostname;
      const raw = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!/^[a-zA-Z0-9-]+\.png$/.test(raw)) {
        return new Response('Not found', { status: 404 });
      }
      const name = route === 'thumb' ? raw.replace(/\.png$/, '.thumb.png') : raw;
      if (route !== 'thumb' && route !== 'media') {
        return new Response('Not found', { status: 404 });
      }
      const file = path.join(mediaDir, name);
      if (!file.startsWith(mediaDir + path.sep) || !fs.existsSync(file)) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(fs.readFileSync(file), {
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
      });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });

  const firstRun = !settings.seenWelcome;
  if (firstRun) {
    settings.seenWelcome = true;
    saveSettings();
  }

  // Keep an existing login shortcut pointed at this executable. This matters
  // when moving from the dev build to the installed app: the shortcut should
  // follow the executable that is actually running.
  if (settings.launchAtLogin || isLaunchAtLogin()) {
    const actual = setLaunchAtLogin(true);
    settings.launchAtLogin = actual;
    saveSettings();
  }
  console.log(
    `[login] start at login: ${isLaunchAtLogin() ? 'on' : 'off'}${process.platform === 'win32' ? ` · ${startupLinkPath()}` : ''}`,
  );

  initUpdater();
  createPanel();
  createTray();
  registerIpc();
  registerShortcuts();
  updateTrayMenu();
  startMonitors();

  // Capture the already-loaded clipboard shortly after boot.
  setTimeout(pollClipboard, 700);

  panel.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (firstRun && !launchedHidden) {
        revealPanel('welcome');
        setTimeout(() => {
          try {
            tray.displayBalloon({
              title: 'ClipDeck is live',
              content: `Rest the cursor on the top-centre edge for ${edgeDwellSeconds()} seconds, or press ${activeShortcut}. Closing the panel leaves ClipDeck in the tray.`,
              icon: nativeImage.createFromPath(APP_ICON),
              noSound: true,
            });
          } catch {
            /* balloons are a nice-to-have */
          }
        }, 1800);
      }
    }, 500);
  });

  console.log(
    `[clipdeck] ready · ${clips.length} clips · shortcut ${activeShortcut || 'none'} · paused ${settings.paused ? 'yes' : 'no'}`,
  );
});

process.on('uncaughtException', (error) => {
  console.error('[clipdeck] uncaught exception', error);
});

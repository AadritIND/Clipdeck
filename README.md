# ClipDeck

**A clipboard index that lives at the top edge of your screen.**

ClipDeck keeps a private, local history of the text and images you copy, then drops a compact ink-and-paper ledger when you need it. It stays out of the taskbar, waits quietly in the tray, and can start with Windows.

[**Download the latest Windows installer**](https://github.com/Aadrit1234/Clipdeck/releases/latest)

---

## Contents

- [What it does](#what-it-does)
- [Design](#design)
- [Install on Windows](#install-on-windows)
- [Using ClipDeck](#using-clipdeck)
- [Start with Windows](#start-with-windows)
- [Your data and privacy](#your-data-and-privacy)
- [Development](#development)
- [Build the Windows installer](#build-the-windows-installer)
- [Project layout](#project-layout)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What it does

ClipDeck is a clipboard manager for people who copy all day and don't want a spreadsheet in their face.

- **Text and images** are captured automatically from the Windows clipboard.
- **De-duplicates** repeated copies and brings the latest copy back to the top.
- **Search and filters** for text, links, images, and pinned clips.
- **One-click copy** — click any row or press <kbd>Enter</kbd> to put it back on the clipboard.
- **Pins** keep the clips you use constantly.
- **Images** are stored as PNGs with fast thumbnails.
- **Tray resident** — no taskbar window, no dock icon clutter.
- **Global summon shortcut** — <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> by default.
- **Auto-dismiss** — the deck closes shortly after your pointer leaves it.
- **Local only** — history never leaves your computer.

ClipDeck copies to the clipboard; it does not auto-paste. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> in the app you are working in.

## Design

The deck is a wide, low shelf — up to **1180 × 360 px** on a 1920×1080 display — anchored to the top center of the active display. It scales to the available work area on smaller screens. The body pairs a ledger column on the left with a tall paper receipt on the right:

- a masthead with the clip count and search;
- text tabs with a sliding orange ink underline;
- a bordered ledger with `NO. / CLIP / TYPE / AGE` columns;
- a cream paper receipt for the selected clip, with copy, pin, and delete actions;
- a mono footer with keyboard hints and the Windows autostart toggle.

The palette is warm graphite, paper cream, and safety orange. The display face is Bahnschrift, metadata is set in Cascadia Mono, and receipt text is Georgia. There are no bundled fonts or remote assets.

## Install on Windows

### Requirements

- Windows 10 or 11, 64-bit
- No administrator rights required for the default per-user install

### Installer

1. Download **`ClipDeck-Setup-1.0.0.exe`** from the [latest release](https://github.com/Aadrit1234/Clipdeck/releases/latest).
2. Run the installer and choose an install location if you want one.
3. The installer creates a Start Menu shortcut, a desktop shortcut, and an uninstaller.
4. ClipDeck starts in the system tray. Look for the clipboard icon in the notification area.

The installer and executable are currently **unsigned**. Windows SmartScreen may show a warning the first time; choose **More info → Run anyway** if you trust the build. The source is in this repository and the installer is built from the same tagged commit.

If you are upgrading from a development copy, quit the development instance from its tray menu first. Both builds share the same ClipDeck data directory and single-instance lock.

### Build from source

```bash
git clone https://github.com/Aadrit1234/Clipdeck.git
cd Clipdeck
npm install
npm start
```

`npm install` installs Electron and electron-builder, then generates the app and tray icons into `build/`.

## Using ClipDeck

### Open the deck

- **Hover the top-center edge** of the screen for about **2.3 seconds**, or
- press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>, or
- click the ClipDeck tray icon.

Hover and edge openings do not steal focus from the app you are typing in. Hotkey and tray openings focus the deck so the keyboard works immediately.

### Close the deck

- Move the pointer outside the panel; it hides after about **180 ms**.
- Press <kbd>Esc</kbd>.
- Click the close button in the masthead.

The panel only arms pointer-dismissal after the pointer has entered it, so a hotkey-opened deck will not vanish before you have had a chance to move the mouse in.

### Keyboard

| Key | Action |
| --- | --- |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move through the visible clips |
| <kbd>Enter</kbd> | Copy the selected clip and close the deck |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selected clip |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Pin or unpin the selected clip |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> … <kbd>9</kbd> | Copy the nth visible clip |
| <kbd>/</kbd> | Focus search |
| <kbd>Esc</kbd> | Clear search, then close the deck |

Click a ledger row to copy it. Hover a row to preview it in the paper receipt. Use the small pin and trash buttons on a row, or the receipt actions, to pin or delete.

The filter tabs update their counts as you search. **Everything** shows the full deck, **Text** and **Links** filter by inferred type, **Images** shows image captures, and **Pinned** shows only kept clips.

## Start with Windows

The footer contains a visible **START WITH WINDOWS** toggle. When enabled, ClipDeck writes a shortcut to your Startup folder that launches the current executable with `--hidden`, so the deck stays in the tray instead of opening a window at login.

- The toggle is on by default for a new install.
- Turning it off removes the Startup shortcut.
- When you move from a development build to the installed app, the shortcut is repaired to point at the executable that is actually running.

The app also has a **Launch at login** checkbox in the tray menu.

## Your data and privacy

ClipDeck is local-first. It does not use an account, a server, analytics, or telemetry.

| Data | Location |
| --- | --- |
| Text clips and metadata | `%APPDATA%\ClipDeck\clips.json` |
| Image clips and thumbnails | `%APPDATA%\ClipDeck\media\` |
| Preferences | `%APPDATA%\ClipDeck\settings.json` |

Images are displayed through a private `clipdeck://` protocol. The renderer has a restrictive Content Security Policy and no network access. Clipboard contents are only written back to the Windows clipboard when you choose a clip.

History is capped at 120 clips by default; pinned clips are kept when older clips are pruned. Use **Clear history…** in the tray menu to remove everything, or delete individual clips from the deck. Uninstalling leaves your history in place unless you remove the data directory yourself.

## Development

### Stack

- Electron 33
- Vanilla HTML, CSS, and JavaScript — no build step for the renderer
- A small atomic JSON store (`src/store.js`)
- Windows Startup shortcut via WScript.Shell for reliable login launch
- electron-builder + NSIS for the installer

### Run

```bash
npm install
npm start
```

The app starts hidden. Hover the top-center edge or press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd> to reveal the deck. There is no separate browser dev server for the app; `src/renderer/mock.js` supplies demo data if you open `src/renderer/index.html` in a browser for design work.

If the global shortcut is already taken, ClipDeck tries <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> and <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>. The active shortcut is shown in the deck footer.

### Regenerate icons

```bash
npm run icons
```

This writes `build/icon.png`, `build/icon@2x.png`, `build/tray.png`, and `build/tray@2x.png` using a dependency-free PNG generator. The artwork is a warm graphite tile with a cream clipboard and orange details.

## Build the Windows installer

```bash
npm run clean
npm run dist
```

The installer is written to:

```text
dist/ClipDeck-Setup-1.0.0.exe
```

`npm run pack` produces an unpacked build in `dist/win-unpacked/` for smoke testing without installing.

The NSIS installer is per-user by default, allows changing the install directory, creates Start Menu and desktop shortcuts, and preserves clip data on uninstall.

## Project layout

```text
ClipDeck/
├─ src/
│  ├─ main.js              Electron lifecycle, tray, clipboard capture, edge reveal,
│  │                       pointer dismissal, Windows Startup shortcut
│  ├─ preload.js           contextBridge API
│  ├─ store.js             atomic JSON store
│  └─ renderer/
│     ├─ index.html        deck markup
│     ├─ styles.css        ink/paper visual system
│     ├─ app.js            ledger, search, filters, receipt, copy/pin/delete
│     ├─ icons.js          inline stroke icon set
│     └─ mock.js           browser-only demo data
├─ scripts/
│  ├─ make-icon.mjs        dependency-free PNG icon generator
│  └─ clean.mjs            removes dist/
├─ build/                  generated runtime + installer icons
├─ package.json            metadata, scripts, electron-builder config
└─ README.md
```

## Troubleshooting

**The panel does not appear at the top edge.**
Move the pointer to the exact top-center edge and hold it there for about 2.3 seconds. The edge target is a narrow strip at the top of the screen. If the panel still does not appear, try the global shortcut or the tray icon; another app may own the shortcut.

**The deck disappears while I am reading it.**
It closes about 180 ms after the pointer leaves the panel. Keep the pointer inside the deck, or use the hotkey to open it with keyboard focus.

**The hotkey does not work.**
Another application may have registered it. ClipDeck falls back to <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd>, then <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>; the footer shows the active one. You can also use the tray icon.

**Images show as broken thumbnails.**
Image files live in `%APPDATA%\ClipDeck\media`. Clearing that folder while ClipDeck is running will break existing image clips. Delete the affected clips from the deck, or quit ClipDeck, remove the folder, and restart.

**I need a clean slate.**
Quit ClipDeck from the tray, then remove `%APPDATA%\ClipDeck` (or just `clips.json` and `media`). The app recreates the store on the next launch.

**SmartScreen warning on install.**
The installer is unsigned. Choose **More info → Run anyway** if you trust this build. A code-signing certificate can be added to the electron-builder configuration later.

## Status

Version **1.0.0** — first public release. Windows is the primary target. The renderer and clipboard logic are cross-platform, but the installer and Startup shortcut flow are Windows-specific. macOS login-item support exists in the main process; Linux autostart is not implemented.

There is no automated test suite yet. The app is smoke-tested manually: clipboard text/image capture, image restore, list/search/filter rendering, pin/delete, hover reveal, pointer-leave dismissal, and the packaged executable.

## License

[MIT](LICENSE) © 2026 Aadrit

Built with [Electron](https://www.electronjs.org/). System fonts only; no third-party UI framework.

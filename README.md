# ClipDeck

**A clipboard index that lives at the top edge of your screen.**

ClipDeck keeps a private, local history of the text and images you copy, then drops a compact ink-and-paper ledger when you need it. It stays out of the taskbar, waits quietly in the tray, and can start with Windows.

[**Download the latest Windows installer**](https://github.com/AadritIND/Clipdeck/releases/latest)

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
- **Adjustable top-edge delay** — choose anywhere from 0.5 to 5.0 seconds in the deck settings.
- **Auto-dismiss** — the deck closes shortly after your pointer leaves it.
- **In-app updates** — the footer offers new GitHub releases, with download progress and restart-to-install.
- **Local only** — clipboard history never leaves your computer; only update checks and downloads contact GitHub.

ClipDeck copies to the clipboard; it does not auto-paste. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> in the app you are working in.

## Design

The deck is a wide, low shelf — up to **1180 × 360 px** on a 1920×1080 display — anchored to the top center of the active display. It scales to the available work area on smaller screens. The body pairs a ledger column on the left with a tall paper receipt on the right:

- a masthead with the clip count, search, and a compact deck-settings control;
- text tabs with a sliding orange ink underline;
- a bordered ledger with `NO. / CLIP / TYPE / AGE` columns;
- a cream paper receipt for the selected clip, with copy, pin, and delete actions;
- a mono footer with keyboard hints, the update action, and the Windows autostart toggle.

The palette is warm graphite, paper cream, and safety orange. The display face is Bahnschrift, metadata is set in Cascadia Mono, and receipt text is Georgia. There are no bundled fonts or remote assets.

## Install on Windows

### Requirements

- Windows 10 or 11, 64-bit
- No administrator rights required for the default per-user install

### Installer

1. Download **`ClipDeck-Setup-1.1.1.exe`** from the [latest release](https://github.com/AadritIND/Clipdeck/releases/latest).
2. Run the installer and choose an install location if you want one.
3. The installer creates a Start Menu shortcut, a desktop shortcut, and an uninstaller.
4. ClipDeck starts in the system tray. Look for the clipboard icon in the notification area.

The installer and executable are currently **unsigned**. Windows SmartScreen may show a warning the first time; choose **More info → Run anyway** if you trust the build. The source is in this repository and the installer is built from the same tagged commit.

If you are upgrading from a development copy, quit the development instance from its tray menu first. Both builds share the same ClipDeck data directory and single-instance lock.

### Build from source

```bash
git clone https://github.com/AadritIND/Clipdeck.git
cd Clipdeck
npm install
npm start
```

`npm install` installs Electron and electron-builder, then generates the app and tray icons into `build/`.

## Updates

ClipDeck 1.1.0 and newer check the latest stable GitHub release shortly after launch, when the deck is opened if the last check is stale, and every four hours.

- When a newer version exists, the footer shows **UPDATE TO vX.Y.Z**.
- Click it to download; the button shows **DOWNLOADING n%**.
- When the download completes, it changes to **RESTART TO UPDATE**; click it to install and relaunch.
- The tray menu mirrors the same action and includes **Check for updates…**.
- Downloads are verified against the SHA-512 in the release's `latest.yml`; the updater only reads from this repository's GitHub Releases.

Update checks are disabled in development builds. The installer is unsigned, so Windows SmartScreen may warn when the downloaded update installer runs. Updates are offered from version 1.1.0 onward; users on 1.0.0 need to install 1.1.1 once manually.

## Using ClipDeck

### Open the deck

- **Hover the top-center edge** of the screen for about **1.6 seconds** (the default; adjustable in settings), or
- press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>V</kbd>, or
- click the ClipDeck tray icon.

Hover and edge openings do not steal focus from the app you are typing in. Hotkey and tray openings focus the deck so the keyboard works immediately.

### Adjust the reveal delay

Click the small sliders button in the masthead (next to the close button) to open **DECK SETTINGS**. Drag **TOP-EDGE DELAY** between **0.5s and 5.0s**; the value saves as soon as you release the slider. The setting only changes how long the pointer must rest on the top edge before the deck drops. The global shortcut and tray icon still open it instantly.

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

ClipDeck has no account, analytics, or telemetry. Clipboard history never leaves your computer. The only outbound request is the update check and, if you accept an update, the installer download from GitHub Releases. The renderer has no network access.

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
- electron-updater + GitHub Releases for in-app updates and SHA-512 download verification

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
dist/ClipDeck-Setup-1.1.1.exe
```

`npm run pack` produces an unpacked build in `dist/win-unpacked/` for smoke testing without installing.

### Publishing an update

The updater reads the latest stable GitHub release. For every new version, bump `package.json`, build, push the source, and create a release that includes all three generated update files:

```bash
npm version patch --no-git-tag-version
npm run clean && npm run dist
git add package.json package-lock.json
# commit and push the version bump
git commit -m "Release vX.Y.Z"
git push
gh release create vX.Y.Z \
  dist/ClipDeck-Setup-X.Y.Z.exe \
  dist/latest.yml \
  dist/ClipDeck-Setup-X.Y.Z.exe.blockmap \
  --title "ClipDeck X.Y.Z" --notes "What changed..."
```

Do not mark the release as a draft or pre-release, and always attach `latest.yml`; installed apps use it to discover the installer. After the release becomes the latest stable release, the next scheduled check (or tray **Check for updates…**) shows the footer button.

The NSIS installer is per-user by default, allows changing the install directory, creates Start Menu and desktop shortcuts, and preserves clip data on uninstall.

## Project layout

```text
ClipDeck/
├─ src/
│  ├─ main.js              Electron lifecycle, tray, clipboard capture, edge reveal,
│  │                       pointer dismissal, Windows Startup shortcut, auto-updates
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
Move the pointer to the exact top-center edge and hold it there for the configured delay (1.6 seconds by default). The edge target is a narrow strip at the top of the screen. If the panel still does not appear, try the global shortcut or the tray icon; another app may own the shortcut.

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

**The update button does not appear.**
The footer only shows it when a newer stable GitHub release exists. Use **Check for updates…** in the tray menu to force a check. Update checks require the installed build (not `npm start`) and an internet connection to GitHub. If a release was just published, it may take a moment for the next check; opening the deck after the cache interval or using the tray menu is the quickest way to refresh it.

## Status

Version **1.1.1** — adds a masthead settings control for personalizing the top-edge delay from 0.5 to 5.0 seconds, alongside the 1.6-second default and the in-app updater with a footer update button, download progress, and restart-to-install. Windows is the primary target. The renderer and clipboard logic are cross-platform, but the installer, updater, and Startup shortcut flow are Windows-specific. macOS login-item support exists in the main process; Linux autostart is not implemented.

There is no automated test suite yet. The app is smoke-tested manually: clipboard text/image capture, image restore, list/search/filter rendering, pin/delete, hover reveal, pointer-leave dismissal, and the packaged executable.

## License

[MIT](LICENSE) © 2026 Aadrit

Built with [Electron](https://www.electronjs.org/). System fonts only; no third-party UI framework.

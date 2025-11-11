# YT Smart Skip: Sponsor & Highlights

A Chrome/Edge extension that visualizes SponsorBlock segments on YouTube’s timeline and lets you skip them manually or automatically.

Manifest V3, works on desktop YouTube and m.youtube.com loaded in desktop browsers.

## Features

- Fetch SponsorBlock segments for the current video
- Draw colored segment markers on the YouTube progress bar (per‑category colors)
- Floating “Skip sponsor” button when inside a segment
- Auto‑skip toggle inside the YouTube settings gear menu (On/Off)
- Popup controls:
  - Visible categories (toggle which categories appear on the timeline)
  - Timeline colors (per‑category color pickers)
- Immediate application of changes (no page refresh needed)
- Caches segments per video ID + category selection

## Project structure

```
GonBMMI-web/
├── manifest.json          # MV3 manifest, permissions, content scripts + icons
├── shared.js              # Shared constants: categories, storage keys, labels, defaults
├── content.js             # Content script for fetching, rendering, and auto‑skip
├── content.css            # Timeline overlay, floating button, menu sizing tweaks
├── popup.html             # Popup UI (auto‑skip, category visibility, colors)
├── popup.css              # Popup styles
├── popup.js               # Popup logic, storage sync + messaging
├── icons/                 # Toolbar/extension icons (PNG: 16/24/32/64/128)
└── README.md              # This document
```

## Icons

Icons are included and referenced in `manifest.json` and the browser action. You can customize them:
- Replace any of the PNGs in `icons/` with your own artwork (keep the same filenames or update the manifest `icons` and `action.default_icon` paths accordingly).
- Sizes provided: 16, 24, 32, 64, 128 px.

## How it works

1) Video detection and preferences
- Detect video ID via `ytInitialPlayerResponse` or URL (`v` or `/shorts/<id>`)
- Load `chrome.storage.sync` keys: `categories` (object map) and `autoSkipEnabled`
  - `categories` shape: `{ [category]: { visible: boolean, color: string } }`

2) Fetch segments
- GET `https://sponsor.ajay.app/api/skipSegments?videoID=<id>&categories=[...]`
- Normalize to `{ start, end, category }`, sort by start, cache per video+categories

3) Render timeline
- Build `.sb-timeline` overlay inside `.ytp-progress-bar`
- Draw each segment as `.sb-segment` positioned by percentage with color from the `categories[cat].color` (fallbacks in `CATEGORY_COLORS`)

4) Skip controls
- Floating button appears in‑segment when auto‑skip is off; clicking jumps to segment end
- Auto‑skip: when entering a segment, jump to end automatically; toggle via settings gear menu item

5) SPA navigation and live UI
- Listen for `yt-navigate-finish` to clean up and reinitialize for new videos
- MutationObserver ensures overlay mounts if player DOM changes
- `chrome.storage.onChanged` + message handling applies popup changes immediately (`categories` visibility/colors, `autoSkipEnabled`)

## Permissions

- `host_permissions`: YouTube and SponsorBlock API domains
- `permissions`: `storage` for user preferences

## Install (Chrome/Edge)

1. Open `chrome://extensions` or `edge://extensions`
2. Enable Developer mode
3. Click “Load unpacked” and pick the `GonBMMI-web` folder
4. Open a YouTube video to see the timeline markers and try auto‑skip (settings gear → Auto skip)

## Development notes

- Popup changes write to storage immediately; content script listens and updates without reload
- Colors are parsed robustly; invalid hex falls back to gold
- The legacy control‑bar pill has been removed to avoid UI clutter; auto‑skip lives in the settings gear menu

## Troubleshooting

- No markers: video may have no submissions; try another video or verify categories are enabled in the popup
- Colors look wrong: adjust in popup; changes apply instantly via storage change listeners
- Still black bar: verify segments exist and overlay `z-index` isn’t overridden by themes

## License

MIT © 2025 GonBMMI

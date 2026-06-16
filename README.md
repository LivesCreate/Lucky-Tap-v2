# Lucky Tap

A fast, casual coin-tap gambling game built as an installable Progressive Web App (PWA). Tap the button, wager coins, and chase multipliers up to 10x — plus daily bonuses, a lucky wheel, idle income, and a randomly-triggered "Lucky Hour" that doubles every win.

## Play it

Open `index.html` directly in any modern mobile or desktop browser — no build step, no server required. On mobile, your browser will offer to install it as a standalone app via the included manifest and service worker.

## Features

- Tap-to-gamble core loop with weighted multipliers (0x up to 10x)
- Tiered progression (Bronze → Silver → Gold → Platinum → Diamond) with idle income that scales by tier
- Daily bonus, a spin-the-wheel bonus, and a randomly-occurring Lucky Hour (2x wins for 2 minutes)
- Win/loss streak tracking, peak-balance chase and celebration, and a recovery-mode assist after a loss
- Local-only persistence (coins, stats, history) gated behind a cookie-consent prompt — nothing leaves the device
- Installable offline-capable PWA via `manifest.json` + `sw.js`

## Project structure

```
index.html       Markup + all styling
game.js          Game state, mechanics, audio/haptics, persistence
manifest.json    PWA manifest (icons, theme, display mode)
sw.js            Service worker (offline caching, versioned cache busting)
icon-192.png, icon-512.png, apple-touch-icon.png   App icons
```

## Notes

- All game state lives in `localStorage` on the player's device; declining the cookie prompt disables saving entirely.
- The service worker cache name is versioned (`CACHE_NAME` in `sw.js`); bump it whenever `index.html` or `game.js` changes so installed/offline copies pick up the update.

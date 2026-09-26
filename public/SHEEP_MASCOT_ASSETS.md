# Sheep mascot assets (not live)

Prepared 2026-09-27 KST. **Live site remains horse.** This branch adds public PNGs only — no `binding.js` change, no default mascot swap.

## Files
| Slot | Path | Notes |
|------|------|-------|
| canon | `/mascot-sheep-512.png` | ChatGPT front → rembg RGBA → 512 |
| away | `/mascot-sheep-away-512.png` | ChatGPT back → rembg RGBA → 512 |
| blink / react / sleepy | `mascot-sheep-{blink,react,sleepy}-512.png` | **byte copies of front** (no zombie eyes) |

## Enable later (parent / Eddie decision)
Prefer a trivial query switch in `pages.js` only, e.g. `?mascot=sheep`, without touching `binding.js`. Or admin switch. Do **not** merge a hard horse→sheep swap until that is ready.

## QA
Source pack + pink/blue/gray composites live on Eddie laptop:
`C:\Users\mredw\Desktop\pokkey\out\characters\sheep\` (see DEMO.md).
Corners alpha=0 self-tested before ship.

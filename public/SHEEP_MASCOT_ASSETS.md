# Sheep mascot + dad demo toggle

Prepared 2026-09-27 KST. **Default remains horse.** `binding.js` untouched.

## Assets (-v2 cache-bust)
| Slot | Path | Notes |
|------|------|-------|
| canon | `/mascot-sheep-512-v2.png` | transparent front |
| away | `/mascot-sheep-away-512-v2.png` | transparent back |
| blink / react / sleepy | copies of front | **no zombie eyes** |

## Corner toggle (every page)
- Tiny fixed control (horse / sheep icons) bottom-right
- Persists via `localStorage` key `pokkey-mascot` + cookie `mascot`
- Also accepts `?mascot=sheep|horse` (writes preference)
- On press: **one motion** — swap art + start squash in the same tick (front↔front, away↔away)
- Sync `mascot-boot.js` applies saved mascot before paint

## QA
Corners alpha=0. blink/react/sleepy MD5 == front.

# P3-05 — Calculator UI QA pass (desktop + mobile), swap sides, polish

Status: TODO
Depends on: P3-04, P2-08
Phase: 3 (calculator UX parity)

## Files to read
- `src/ui/battle-page.js`, `battle.html`, `src/styles.css`

## Files to change
- Same three, plus small fixes anywhere in `src/ui/`

## Goal
Close the gap between "features exist" and "feels like NCP".

## Steps
1. Add a "⇄ swap sides" button that swaps the two sides' entire team state (and side
   conditions).
2. Ensure all 8 move rows (4 per side) show live damage summaries simultaneously, with the
   selected move expanded to full detail (result line, notes, KO text) — NCP behavior.
3. Keyboard: search inputs respond to Enter/ArrowDown; number inputs to ArrowUp/Down.
4. Mobile (~380px): panels stack vertically — field card between them; controls remain
   ≥40px tap targets; no horizontal scroll. Fix styles as needed.
5. Cross-check every field/side/assumption toggle updates results immediately (no stale
   renders). Fix any missed re-render hooks.
6. Run through a 10-minute manual script (write it in this file's PR description): pick two
   meta Pokémon, import a paste, tera one side, set weather+screen, save a set, swap sides,
   reload.

## Acceptance criteria
- Manual script passes at 1280px and 380px widths via `npm start`.
- No console errors during the script.
- `npm test` green.

## Tests
```sh
npm test
```

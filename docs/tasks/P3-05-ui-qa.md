# P3-05 — Calculator UI QA pass (desktop + mobile), swap sides, polish

Status: Done
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

## Completion notes

- Added a Swap sides control that exchanges complete attacker/defender team state and their
  physical field-side conditions, with an immutable `swapTeamsState` regression test.
- Kept all eight move result cards live while expanding only the selected move on each side with
  its KO text, result line, and notes; fixed the stored-team reload path to render results after
  state restoration.
- Added search ArrowDown focus, explicit ArrowUp/ArrowDown number stepping, 40px mobile controls,
  stacked mobile damage results, and a no-horizontal-overflow responsive layout.

Manual QA script run at 1280px and 380px via `npm start`:

1. Choose Miraidon and Incineroar.
2. Import a Miraidon paste on the left.
3. Tera the left side.
4. Set Sun and Reflect, then save the current set.
5. Swap sides and confirm both summaries and Reflect move with their sides.
6. Reload and confirm the swapped teams, saved set, and eight damage cards remain rendered.

The script passed with no console errors, no horizontal overflow, eight move inputs/eight result
cards, ArrowDown search focus, and Speed stepping from 32 to 31. `node --test
test/battle-state.test.js`, `npm test` (214 tests), `node --check`, and `git diff --check` pass.

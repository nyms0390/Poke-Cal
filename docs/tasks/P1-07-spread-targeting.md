# P1-07 — Spread targeting toggle

Status: TODO
Depends on: P1-01
Phase: 1 (calculator foundations)

## Files to read
- `src/engine/damage.js` — spread ×0.75 (keyed on `move.target` + doubles, ~394–396)
- `src/ui/battle-page.js` damage cards

## Files to change
- `src/engine/damage.js`, `src/ui/battle-page.js`, `battle.html`

## Goal
The 0.75 spread modifier applies automatically from move target data, but real games have
single-target situations (the other slot is empty/fainted). NCP exposes this implicitly; we add
an explicit toggle.

## Steps
1. Add `singleTarget: false` to the per-move UI row (small checkbox "1 target", visible only
   in doubles for moves whose `move.target` is multi-target — `allAdjacentFoes`,
   `allAdjacent`).
2. Thread through state → `calculateDamage` (e.g. `moveOptions: { singleTarget }` argument or
   a field on the move object copy — pick one, document it in the function JSDoc).
3. When set, skip the ×0.75 and drop the "spread" note.

## Acceptance criteria
- Heat Wave in doubles: toggling "1 target" changes damage by exactly /0.75 (flooring aside);
  golden-check one case vs NCP (NCP: switching format to singles).
- Checkbox hidden for single-target moves and in singles format.

## Tests
```sh
npm run test:damage
npm test
```

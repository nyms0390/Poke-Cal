# P1-03 — Full status model (replace burned/paralyzed booleans)

Status: TODO
Depends on: P0-07
Phase: 1 (calculator foundations)

## Files to read
- `src/ui/battle-state.js` (side-state shape), `src/engine/damage.js` (burn handling),
  `src/engine/speed.js` (`paralyzed` handling), `src/ui/battle-page.js` (status checkboxes)

## Files to change
- `src/engine/damage.js`, `src/engine/speed.js`, `src/ui/battle-state.js`,
  `src/ui/battle-page.js`, `battle.html`

## Goal
The state has two booleans (`burned`, `paralyzed`). Move to a single
`status: "" | "burn" | "poison" | "toxic" | "paralysis" | "sleep" | "freeze"` so Hex/Facade/
Barb Barrage (P2-02) and Guts/Flare Boost/Toxic Boost (P2-06) have a real input, matching
NCP's status dropdown.

## Steps
1. Change the side-state shape: delete `burned`/`paralyzed`, use `status`.
2. `damage.js`: burn ×0.5 physical reads `attackerState.status === "burn"`
   (Guts exception already implemented — keep it working).
3. `speed.js`: paralysis speed halving reads `state.status === "paralysis"`.
4. UI: replace the two checkboxes with one status `<select>` per side
   (Healthy/Burned/Poisoned/Badly Poisoned/Paralyzed/Asleep/Frozen).
5. Update `test/damage.test.js` and `test/speed.test.js` call sites mechanically
   (`burned: true` → `attackerState.status = "burn"` etc.). Expected values unchanged.
6. Update `test/battle-state.test.js` for the new shape.

## Acceptance criteria
- `grep -rn "burned\|paralyzed" src/` returns nothing (only `status` comparisons).
- All previous burn/paralysis expected values unchanged.

## Tests
```sh
npm run test:battle
npm test
```

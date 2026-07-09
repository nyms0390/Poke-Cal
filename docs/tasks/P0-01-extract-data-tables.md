# P0-01 — Extract data tables from damage.js into engine modules

Status: Done
Depends on: —
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` (target structure + constraints)
- `src/damage.js` (whole file)
- `test/damage.test.js` (imports section only)

## Files to create
- `src/engine/constants.js`
- `src/engine/natures.js`
- `src/engine/type-chart.js`

## Files to change
- `src/damage.js`

## Goal
`damage.js` currently hard-codes big data tables at the top of the file: `NATURES` (~lines
95–121), `TYPE_EFFECTIVENESS` (the full 18×18 chart, ~lines 131–184), plus `WEATHER_BALL_TYPES`
and `TERRAIN_PULSE_TYPES`. Move pure data into dedicated modules so later tasks can import them
without importing the whole damage engine.

## Steps
1. Create `src/engine/constants.js` exporting `export const LEVEL = 50;` and
   `export const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];`.
2. Create `src/engine/natures.js`: move the `NATURES` table plus `natureMultiplier()` and
   `natureOptionLabel()` there verbatim. Export all three.
3. Create `src/engine/type-chart.js`: move `TYPE_EFFECTIVENESS` there. Keep
   `typeEffectiveness()` in `damage.js` for now (it reads move/defender state; it moves later).
4. In `damage.js`, delete the moved code and import from the new modules. Re-export
   `natureMultiplier` and `natureOptionLabel` from `damage.js` (`export { ... } from ...`) so
   existing imports in `src/battle-page.js`, `src/speed.js`, and tests keep working unchanged.
5. Do not change any logic, values, or function signatures.

## Acceptance criteria
- `git diff` shows only moves/imports — no value or formula changes.
- No file outside `src/damage.js` needed edits (re-exports preserve the API).
- New modules contain no functions with side effects, no DOM, no fetch.

## Tests
```sh
npm run test:damage
npm test
```
Both must pass with zero test-file edits.

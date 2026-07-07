# P0-02 — Move stat math into src/engine/stats.js

Status: TODO
Depends on: P0-01
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` (SP stat model definition)
- `src/damage.js` — `calculateStat()` (~lines 206–218), `applyStage()` (~lines 773–776)
- `src/stats.js` (5 lines: only `totalBaseStats`)
- `src/speed.js` (imports `calculateStat` from damage.js)
- `test/stats.test.js`, `test/speed.test.js`

## Files to create
- `src/engine/stats.js`

## Files to change
- `src/damage.js`, `src/speed.js`, `src/stats.js`, `test/stats.test.js`

## Goal
The real stat engine lives inside `damage.js`; `stats.js` only has a display helper. Create a
proper stats module so speed, builder, and snapshot code can compute stats without touching the
damage engine.

## Steps
1. Create `src/engine/stats.js`. Move `calculateStat({base, stat, sp, nature, stage})` and
   `applyStage(value, stage)` from `damage.js` verbatim. Import `natureMultiplier` from
   `./natures.js`. Also move `totalBaseStats` here from `src/stats.js`.
2. `damage.js`: import `calculateStat`/`applyStage` from `./engine/stats.js`
   (path is `./engine/…` until P0-07 moves damage.js itself); keep re-exporting both so
   `battle-page.js` and tests are untouched.
3. `speed.js`: import `calculateStat` from the new module instead of from `damage.js`.
4. Replace the body of `src/stats.js` with re-exports from `src/engine/stats.js`
   (it is deleted for good in P0-07).
5. Extend `test/stats.test.js` with direct unit tests of the SP model:
   HP = base + sp + 75; others = floor((base + sp + 20) × nature); sp is validated 0–32;
   stage multipliers (+1 → ×1.5, −1 → ×2/3, etc.).

## Acceptance criteria
- No numeric behavior change (damage tests pass unedited).
- `src/engine/stats.js` has no imports other than `./natures.js` / `./constants.js`.

## Tests
```sh
npm run test:catalog
npm run test:battle
npm test
```

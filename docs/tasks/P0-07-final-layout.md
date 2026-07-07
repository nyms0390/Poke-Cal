# P0-07 — Final directory layout, battle-state extraction, docs update

Status: TODO
Depends on: P0-01, P0-02, P0-03, P0-04, P0-05, P0-06
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` — "Target code structure" (the authoritative layout)
- `src/battle-page.js` — `damageState` global (~73–79), `seedDamageSide` (~259–287),
  `handleDamageControl` (~334), `renderDamage` (~414), `finalStat`/`sideSummary` (~466–475,
  575–583)
- `index.html`, `battle.html` (script/style paths)
- All `test/*.js` import paths

## Files to create
- `src/ui/battle-state.js`

## Files to change / move
- Move `src/damage.js`, `src/speed.js`, `src/battle-order.js` → `src/engine/`
- Move `src/data.js`, `src/catalog.js`, `src/pokemon.js`, `src/showdown-data.js`,
  `src/limitless-data.js`, `src/usage-defaults.js` → `src/data/`
- Rename `src/app.js` → `src/ui/lookup-page.js`; move `src/battle-page.js` → `src/ui/`
- Delete `src/stats.js` and any compatibility re-exports added in P0-01…P0-03
- Update `index.html`, `battle.html`, `scripts/sync-*.mjs`, all tests, `README.md`, `AGENTS.md`

## Goal
Land the canonical layout from ROADMAP.md and pull the battle page's pure logic out of the DOM
controller so it is unit-testable.

## Steps
1. Create `src/ui/battle-state.js` with pure functions (no DOM):
   - `createSideState(pokemon, usageDefaults)` — replaces the object literal in
     `seedDamageSide`; emits the canonical side-state shape from ROADMAP.md (add the new keys
     `status: ""`, `teraType: ""`, `currentHpFraction: 1` with defaults now; UI wiring comes in
     Phase 1).
   - `applyControl(state, {kind, side, stat, index, value})` — the state-mutation logic
     currently inside `handleDamageControl`, returned as a new state object (immutable).
   - `buildCalcInput(damageState, fieldInputs)` — assembles `{attacker, defender, ...state,
     field}` ready for `calculateDamage`.
   Then slim `battle-page.js` down to: DOM reads → battle-state functions → DOM writes.
2. Do the file moves with `git mv`. Fix all import paths (engine files import siblings
   relatively; data files must not import from `ui/`; ui may import engine+data).
3. Update the two HTML files' `<script type="module">` and stylesheet paths.
4. Add a unit test `test/battle-state.test.js` covering `createSideState` defaults and
   `applyControl` for sp/stage/item/ability/move changes.
5. Update `README.md` "Project Structure" and `AGENTS.md` key-file paths; update
   `package.json` test group scripts if any file names changed.

## Acceptance criteria
- Layout matches ROADMAP.md exactly; `src/` root contains only `engine/`, `data/`, `ui/`,
  `styles.css`.
- `grep -rn "document\." src/engine src/data` returns nothing.
- Full suite green; both pages verified manually via `npm start` (desktop + mobile widths).
- README.md and AGENTS.md describe the new layout (no stale paths anywhere:
  `grep -rn "src/app.js\|src/ui.js\|src/stats.js" README.md AGENTS.md docs/` is empty).

## Tests
```sh
npm test
```

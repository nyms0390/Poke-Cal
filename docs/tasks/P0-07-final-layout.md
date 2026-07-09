# P0-07 — Final directory layout, battle-state extraction, docs update

Status: Done
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

## Completion notes
- Moved via `git mv`: `damage.js`/`speed.js`/`battle-order.js` → `src/engine/`;
  `data.js`/`catalog.js`/`pokemon.js`/`showdown-data.js`/`limitless-data.js`/`usage-defaults.js`
  → `src/data/`; `app.js` → `src/ui/lookup-page.js`; `battle-page.js` → `src/ui/battle-page.js`.
  Also moved `champions-data.js` and `smogon-data.js` into `src/data/` — not named in this
  task's file list, but required by the acceptance criterion that `src/` root contain only
  `engine/`, `data/`, `ui/`, `styles.css`. Deleted `src/stats.js` (the P0-02 compat re-export);
  its one export (`totalBaseStats`) now comes directly from `src/engine/stats.js`.
- Created `src/ui/battle-state.js`: `createSideState(pokemon, usageDefaults)` (pure, canonical
  side-state shape incl. the new `status`/`teraType`/`currentHpFraction` keys — battle-page.js
  still overlays the existing tailwind/paralyzed/burned/speedMultiplier control values after
  calling it, so switching a side's Pokémon doesn't reset that side's battle conditions),
  `applyControl(state, {kind, stat, index, value})` (replaces the id-string/dataset-kind
  ladder in `handleDamageControl` with one switch over an explicit `kind`; for "ability"/"item"
  the caller resolves the `<select>`'s chosen entry against the lookup Map *before* calling in,
  since that resolution needs the DOM element itself), and `buildCalcInput(damageState,
  fieldInputs)` (assembles both sides' Pokémon/state plus a `Field` from the raw battle-condition
  control values, shared by every damage card in one render pass; `renderDamageCard` swaps
  attacker/defender for the defender-as-source cards). `battle-page.js`'s `handleDamageControl`
  now translates a raw DOM event into `{kind, side, stat, index, value}` via
  `controlFromTarget`/`controlValue`, then calls `applyControl` and writes back only the
  DOM-visible side effects (SP/stage clamped-value echo, spread re-sync).
- Added `test/battle-state.test.js` (12 cases: `createSideState` defaults/shape/non-mutation;
  `applyControl` for sp/stage clamping, ability/item passthrough, move-index replacement, valid
  vs. invalid spread, nature/speedMultiplier/booleans, unknown kind; `buildCalcInput` assembly
  and Field defaults). Caught a real bug while writing it: `buildCalcInput` was passing
  `format: undefined`/`trickRoom: undefined` through to `createField` when omitted, which
  clobbers `createField`'s own defaults because it spreads its overrides object — fixed by only
  forwarding keys the caller actually supplied. Not reachable from the live app (the DOM reads
  that feed `fieldInputs` are never undefined), so no behavior change to the shipped pages.
- Updated every import in `src/`, `test/`, and `scripts/*.mjs` to the new paths; updated
  `index.html`/`battle.html` `<script type="module">` src to `src/ui/lookup-page.js` /
  `src/ui/battle-page.js` (stylesheet path unchanged — `styles.css` stays at `src/` root).
  Added `test/battle-state.test.js` to the `test:catalog` npm script group (alongside
  `ui.test.js`, the other UI-layer pure-logic suite).
- Verified: `ls src/` → exactly `engine data ui styles.css`. `grep -rn "document\." src/engine
  src/data` → empty. `grep -rn "src/app.js|src/ui.js|src/stats.js" README.md AGENTS.md docs/`
  → empty (docs/tasks/*.md intentionally still describe prior tasks' *historical* paths at the
  time they ran — e.g. P0-01's task file correctly says `src/damage.js` because that's where it
  was when P0-01 executed — so those are out of scope for this check, matching how P0-04/05/06's
  own "Steps" sections were left untouched by later tasks too). Started `scripts/serve.mjs` and
  curled every moved module path plus the two HTML entry points (all 200) and every pre-move
  path (all 404, confirming nothing still resolves the old locations).
- `npm test` 132/132; also ran `test:battle` (52), `test:catalog` (57), `test:data` (23),
  `test:damage` (41), `test:pokemon` (24) individually — all green. Did not drive a real browser
  against the dev server (no GUI browser reachable from this sandbox) — a manual `npm start`
  check at desktop/mobile widths is still worth doing, per this task's own acceptance criteria.
- **Manual browser check completed** (2026-07-09): ran `npm start` on the user's machine and
  drove their real Chrome via the browser tools. Battle Calculator page verified at 1440px and
  ~500px widths (site's only breakpoint is `max-width: 720px`): all controls render (SP/stage
  inputs, spread/nature selects, battle-condition checkboxes), move-damage cards compute and
  display % ranges live. Edited an ATK stage input directly in the browser — `applyControl`
  clamped it to +6, ATK recalculated 67→268 (67×4, correct for +6 stage), and Fake Out's damage
  range updated live from 11%–13.6% to 44.1%–51.9%, confirming `buildCalcInput`/`applyControl`
  wiring from `battle-state.js` works end-to-end in a real browser. No horizontal overflow at
  narrow width, zero console errors throughout.

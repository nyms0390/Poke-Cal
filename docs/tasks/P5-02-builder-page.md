# P5-02 — builder.html page skeleton with live stats

Status: TODO
Depends on: P5-01
Phase: 5 (builder utility)

## Files to read
- `battle.html` + `src/ui/battle-page.js` (reuse patterns: search, SP inputs, bootstrap)
- `src/ui/components.js`, `src/ui/bootstrap.js`, `src/ui/battle-state.js`

## Files to create
- `builder.html`, `src/ui/builder-page.js`, `src/ui/builder-state.js`,
  `test/builder-state.test.js`

## Files to change
- `index.html`, `battle.html` (nav links), `README.md`, `AGENTS.md`,
  `.github/workflows/pages.yml` only if it lists files explicitly (it deploys repo root —
  probably no change)

## Goal
Third page: configure ONE Pokémon (yours) and see builder analyses against the threat list.
This task ships only the skeleton: page, your-Pokémon editor, live final stats, and an empty
results area that P5-03/04/05 fill in.

## Steps
1. `builder.html`: same shell/styles as battle.html; loads `src/ui/builder-page.js`.
   Nav header links between the three pages (add to all three HTML files).
2. `src/ui/builder-state.js` (pure): `createBuilderState()` — one side-state (reuse
   `createSideState`) + `threatCount` setting (default 20); `finalStats(state)` — all six
   final stats via `calculateStat`.
3. `src/ui/builder-page.js`: bootstrap catalogs; Pokémon search (shared component); editors
   for nature, item, ability, tera, SP per stat with a live "remaining SP" indicator if
   Champions has a total-SP budget — check the format rule: if unclear, show plain per-stat
   totals and no budget (leave a `TODO(P5-03)` comment referencing the rule source).
4. Live final-stats table updates on every input. Empty tabs/sections labeled
   "Speed line", "Bulk points", "Break points" with placeholder text.
5. Seed from champions defaults on Pokémon select; accept `?pokemon=<id>` query param.

## Acceptance criteria
- `npm start` → `/builder.html` works: search, configure, live stats, no console errors,
  desktop + mobile.
- `builder-state.js` fully unit-tested without DOM.
- Nav links present on all three pages.

## Tests
```sh
node --test test/builder-state.test.js && npm test
```

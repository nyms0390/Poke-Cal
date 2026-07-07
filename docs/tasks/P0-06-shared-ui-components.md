# P0-06 — Deduplicate UI helpers into components.js and bootstrap.js

Status: TODO
Depends on: —  (independent of P0-01…P0-05; touches only UI files)
Phase: 0 (restructure, no behavior change)

## Files to read
- `src/ui.js` (all 88 lines — the existing shared factories and `STAT_LABELS`)
- `src/app.js` — search-result buttons (~100–116), `labels` object (~135–142),
  `initialize()`/data-loading boilerplate, usage ranking calls (~200–206)
- `src/battle-page.js` — search-result buttons (~161–189), `SP_STATS`/`STAGE_STATS` (~68–69),
  init boilerplate, usage ranking calls (~294–298, 564–573)

## Files to create
- `src/ui/components.js` (grows out of `src/ui.js`)
- `src/ui/bootstrap.js`

## Files to change
- `src/app.js`, `src/battle-page.js`; delete `src/ui.js` at the end (move, don't copy)

## Goal
Both page controllers hand-roll identical DOM: the Pokémon search-result button template is
byte-identical in both files, stat-label maps exist in three places, and the
initialize/load-catalog/error-message boilerplate is duplicated. One source for each.

## Steps
1. Create `src/ui/components.js` containing everything from `src/ui.js` **plus**:
   - `searchResultButton(pokemon, onSelect)` — the shared result-row factory
   - `spInput({stat, value, onChange})` and `stageInput({stat, value, onChange})` factories
   - a single exported `STAT_LABELS`; delete `labels` in app.js and `SP_STATS`/`STAGE_STATS`
     label duplication in battle-page.js (keep their key arrays if used for iteration —
     import `STAT_KEYS` from `src/engine/constants.js` if P0-01 is done, else define locally).
2. Create `src/ui/bootstrap.js` with `loadCatalogs({onStatus})` wrapping the shared
   fetch-pokemon/abilities/moves/items + "Run npm run sync-data…" error copy, and
   `rankByUsage(entries, scope)` wrapping the repeated
   `sortByChampionsUsage(applyScopedUsage(...))` composition.
3. Update both page controllers to import from the new modules. Update `index.html` /
   `battle.html` script paths if needed (they load `src/app.js` / `src/battle-page.js` as
   modules — inner imports don't affect the HTML).
4. Visual output must be pixel-identical: same class names, same innerHTML structure.

## Acceptance criteria
- The search-result template exists in exactly one file
  (`grep -rn "search-result" src/` to confirm usage points import it).
- One `STAT_LABELS` definition in the whole repo.
- `test/ui.test.js` updated to point at `src/ui/components.js` and passes.
- Manual check via `npm start`: lookup and battle pages render and search as before, desktop
  and mobile widths.

## Tests
```sh
npm run test:catalog
npm test
```

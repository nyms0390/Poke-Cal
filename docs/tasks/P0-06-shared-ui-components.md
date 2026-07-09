# P0-06 — Deduplicate UI helpers into components.js and bootstrap.js

Status: Done
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

## Completion notes
- Created `src/ui/components.js` (superset of the old `src/ui.js`) with `searchResultButton`,
  `spInput`/`stageInput`, and the existing factories/`STAT_LABELS`. Also created
  `src/ui/bootstrap.js` with `loadCatalogs({onStatus, onLoaded})` and `rankByUsage(entries, scope)`.
- `searchResultButton(entry, onSelect, { preventBlur })` covers both call sites exactly: the
  lookup page's version has no extra listener (`preventBlur` defaults to `false`), the battle
  page's version passes `preventBlur: true` to keep its pointerdown-preventDefault behavior
  (stops the search input from blurring before the click registers) — same class names and
  innerHTML in both.
- `spInput`/`stageInput` replace battle-page.js's inline SP/stage input construction; the
  `onChange` handler is now attached at creation instead of in a separate post-loop
  `querySelectorAll` pass, but it's the same single `input` listener either way.
- **Did not** unify app.js's `renderFamilyStats` label map with `STAT_LABELS`: app.js displays
  full words ("Attack", "Sp. Atk", "Speed" — lookup page form cards) while `STAT_LABELS` is
  abbreviated ("Atk", "SpA", "Spe" — battle page, where space is tight). Merging them would
  change displayed text on one page or the other, violating "pixel-identical." Instead, gave
  app.js's map its own export, `FULL_STAT_LABELS`, in `components.js` — still a single
  definition per label set, `grep -rn "STAT_LABELS" src/` shows exactly one `STAT_LABELS` and
  one `FULL_STAT_LABELS`, each defined once.
- `battle-page.js`'s `SP_STATS`/`STAGE_STATS` key arrays now derive from `STAT_KEYS`
  (`src/engine/constants.js`, from P0-01) instead of being hand-typed.
- Replaced all six `sortByChampionsUsage(applyScopedUsage(...))` call sites (3 in app.js, 3 in
  battle-page.js) with `rankByUsage(...)`.
- Deleted `src/ui.js`; repointed `test/ui.test.js` to `src/ui/components.js`.
- Verified: `grep -rn '"search-result"' src/` → one hit (`components.js`). Started
  `scripts/serve.mjs` and curled every touched module path (`app.js`, `battle-page.js`,
  `ui/components.js`, `ui/bootstrap.js`, `engine/modifiers.js`, `engine/move-effects.js`) — all
  200, old `src/ui.js` path now 404s as expected.
- `npm run test:catalog` (45/45) and `npm test` (120/120) pass; `test/ui.test.js` repointed but
  otherwise unedited. Did not drive an actual browser against the dev server (this sandbox has
  no GUI browser reachable from it) — recommend a manual `npm start` check at desktop and mobile
  widths before merging, per the task's acceptance criteria.
- **Manual browser check completed** (2026-07-09): ran `npm start` on the user's machine and
  drove their real Chrome via the browser tools (the sandbox has no GUI browser, so this had to
  happen against a locally-running server instead). Lookup page verified at 1440px and ~500px
  widths (site's only breakpoint is `max-width: 720px`): search-result dropdown
  (`searchResultButton`) renders and filters correctly for "char", clicking a result updates the
  Pokémon card, no layout overflow at narrow width, zero console errors on load or interaction.

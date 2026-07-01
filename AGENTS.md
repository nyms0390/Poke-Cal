# Repository Guidelines

## Project Shape

PokéCal is a dependency-free, browser-first ES module app. The main UI is
`index.html` with code in `src/app.js`; the battle calculator is `battle.html`
with code in `src/battle-page.js`, `src/damage.js`, `src/speed.js`, and
`src/battle-order.js`. Shared catalog/search/data helpers live in `src/catalog.js`,
`src/data.js`, `src/pokemon.js`, `src/showdown-data.js`, `src/stats.js`,
`src/ui.js`, and `src/usage-defaults.js`.

Generated catalogs live in `public/*.json`. Do not hand-edit these files unless
the task is explicitly about repairing generated output; prefer fixing the sync
or parser code and regenerating.

`MECHANICS_CHECKLIST.md` is the durable battle-calculator accuracy tracker.
Only mark checklist items complete after implementing the behavior and verifying
it with a focused test or a clearly reproducible manual check.

## Local Commands

Use Node.js 20 or newer. On this machine, `node` and `npm` may be absent from
`PATH`; the reliable Node binary is:

```sh
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
```

Canonical package scripts when `npm` is available:

```sh
npm test
npm run test:battle
npm run test:catalog
npm run test:data
npm run sync-data
npm run sync-champions-data
npm start
```

Direct equivalents that work with the bundled Node binary:

```sh
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/battle-order.test.js test/damage.test.js test/speed.test.js
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/catalog.test.js test/pokemon.test.js test/stats.test.js test/ui.test.js
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/limitless-data.test.js test/showdown-data.test.js test/sync-pokemon-data.test.js test/usage-defaults.test.js
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sync-pokemon-data.mjs
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/sync-limitless-champions-usage.mjs
/Users/zhangyang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/serve.mjs
```

`scripts/serve.mjs` listens on `127.0.0.1:4173` by default. If that port is
blocked, run it with another `PORT` value instead of changing app logic.

## Data Sync Rules

`scripts/sync-pokemon-data.mjs` downloads Pokemon Showdown core data and PokeAPI
Traditional Chinese aliases, then writes `public/pokemon.json`,
`public/abilities.json`, `public/moves.json`, and `public/items.json`.

`scripts/sync-limitless-champions-usage.mjs` overlays Limitless Champions
tournament usage counts, rates, and per-Pokemon default distributions.
Run the Showdown sync first when rebuilding from scratch.

Label external battle and catalog data precisely in user-facing copy:
Limitless is the Champions tournament usage source, Pokemon Showdown is the
mechanics/catalog seed, and PokeAPI is only the Traditional Chinese alias
source.

## Testing Expectations

Run the narrowest relevant test first:

- Battle calculator math, move order, Speed, items, abilities, or field effects:
  `test/damage.test.js`, `test/speed.test.js`, and/or
  `test/battle-order.test.js`.
- Catalog search, sorting, rendering helpers, or lookup UI:
  `test/catalog.test.js`, `test/pokemon.test.js`, `test/stats.test.js`, and/or
  `test/ui.test.js`.
- Showdown parsing, generated catalog shape, usage defaults, or sync scripts:
  `test/showdown-data.test.js`, `test/sync-pokemon-data.test.js`,
  `test/usage-defaults.test.js`, and/or `test/limitless-data.test.js`.

Run the full `node --test` suite before finishing shared logic, generated data,
or cross-page UI changes. For browser-visible changes, start the local server
and verify the relevant page at desktop and mobile widths.

## Implementation Conventions

Keep changes surgical and match the existing plain JavaScript style. The repo
uses ES modules, named exports, immutable array/object transforms where useful,
and Node's built-in test runner. Do not introduce dependencies or a build step
unless the user explicitly asks for that.

For battle-calculator work, prefer centralized engine helpers in `src/damage.js`,
`src/speed.js`, or `src/battle-order.js` over UI-only patches. The visible
default battle mode is doubles, and both sides should keep four editable moves
seeded from top usage when usage data exists.

When updating generated data, keep unrelated dirty files out of the change. This
repo often has concurrent battle-calculator and data-sync edits; inspect
`git status --short` before editing and do not revert user changes.

## Planning Rule

If you write an implementation plan, self-review it before presenting it. Remove
placeholders, keep file paths and names consistent, cover every requested
requirement, and make each step a concrete action with a verification command.

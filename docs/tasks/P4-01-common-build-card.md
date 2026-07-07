# P4-01 — Snapshot: common-build card from Champions usage

Status: TODO
Depends on: P0-07 (paths), P1-05 (tera usage data)
Phase: 4 (snapshot polish)

## Files to read
- `src/ui/lookup-page.js` (current detail rendering), `src/data/usage-defaults.js`
- `public/pokemon.json` — `champions.usage` shape: `{abilities, items, moves, natures, teras}`
  each `[{id, name, usageCount, usagePercent}]`

## Files to change
- `src/ui/lookup-page.js`, `index.html`, `src/styles.css`

## Goal
The lookup page lists abilities/moves/items with usage percentages but doesn't answer "what is
the standard build?" at a glance. Add one compact card at the top of a selected Pokémon's
detail view.

## Steps
1. "Common build" card, rendered only when `pokemon.champions` exists:
   - headline: usage rate + sample size (`usagePercent`, `usageCount` of teams)
   - one line each: top ability, top item, top nature, top tera — with their percentages
   - top 4 moves with percentages (this IS the champions default moveset — reuse
     `championsDefaultsForPokemon` so snapshot and calculator agree)
2. "Open in calculator →" link: `battle.html?left=<pokemonId>`; implement query-param handling
   in `battle-page.js` (seed the left side with champions defaults on load).
3. Label the source per AGENTS.md convention: "Limitless Champions usage (last N tournaments)".

## Acceptance criteria
- Pokémon without champions data show no card (no empty shell).
- The card's moveset equals the calculator's default seeding for the same Pokémon (test via
  shared function, not copy).
- `battle.html?left=miraidon` opens pre-seeded (manual check).

## Tests
```sh
npm run test:catalog && npm test
```

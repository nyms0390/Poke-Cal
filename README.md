# PokéCal

A compact, dependency-free competitive Pokémon toolkit: quick species lookup with Champions tournament usage, a two-Pokémon battle calculator, a matchup-driven SP builder, and interactive Speed tiers.

## Overview

PokéCal is a browser-first ES-module web app with no build step and no npm dependencies. The lookup page (`index.html`) searches Pokémon by English or Traditional Chinese name and shows base stats, forms, abilities, moves, and items with Limitless Champions usage rates. The battle calculator (`battle.html`) configures two Pokémon and computes move order and damage ranges. The builder (`builder.html`) finds defensive bulk and offensive break points against usage-backed threat sets, while the Speed tiers page (`speed.html`) compares base or final Speed across fixed opponent presets. All catalog data is generated into `public/*.json` from Pokémon Showdown, Limitless, Smogon ladder stats, NCP curated sets, and PokeAPI aliases.

## Project Structure

```
PokéCal/
├── index.html                 # Lookup page (loads src/ui/lookup-page.js)
├── battle.html                # Battle calculator page (loads src/ui/battle-page.js)
├── builder.html               # SP builder (loads src/ui/builder-page.js)
├── speed.html                 # Speed tiers (loads src/ui/speed-page.js)
├── src/
│   ├── identifiers.js          # Shared Showdown-style identifier normalization
│   ├── i18n.js                 # Locale state and translation helpers
│   ├── i18n-formatters.js      # Localized domain result formatting
│   ├── locales/                # English and Traditional Chinese messages
│   ├── engine/                 # Pure battle math — no DOM, no fetch
│   │   ├── constants.js        # LEVEL, STAT_KEYS
│   │   ├── natures.js          # NATURES table + natureMultiplier/natureOptionLabel
│   │   ├── type-chart.js       # TYPE_EFFECTIVENESS + typeEffectiveness()
│   │   ├── stats.js            # calculateStat, applyStage, totalBaseStats
│   │   ├── field.js            # createField() — weather/terrain/room/side conditions
│   │   ├── move-effects.js     # registry: moveId -> {basePower, moveType, hits, ...}
│   │   ├── modifiers.js        # registries: ability/item -> modifier producers
│   │   ├── damage.js           # the damage pipeline (orchestration only)
│   │   ├── speed.js            # Speed calculation (Tailwind, paralysis, items, ...)
│   │   └── battle-order.js     # Move order (priority, Speed, Trick Room)
│   ├── data/                   # loading, parsing, usage
│   │   ├── data.js              # Data loading helpers
│   │   ├── catalog.js           # Catalog search/sort helpers
│   │   ├── pokemon.js           # Species helpers
│   │   ├── showdown-data.js     # Pokémon Showdown export parsing
│   │   ├── champions-data.js    # Champions mod overlay (legality, learnsets, balance)
│   │   ├── limitless-data.js    # Limitless Champions usage building/merging
│   │   ├── smogon-data.js       # Smogon ladder stats parsing (SP spreads)
│   │   ├── ncp-data.js          # NCP curated Champions set parsing/merging
│   │   ├── active-set.js        # Cross-page active-set persistence
│   │   ├── saved-sets.js        # Named saved-set persistence
│   │   ├── set-paste.js         # PokéCal/Showdown set import and export
│   │   ├── usage-defaults.js    # Default move/item/ability seeding from usage
│   │   ├── threats.js           # Usage-backed threat sets and SP presets
│   │   ├── speed-line.js        # Pure Speed-tier rows and breakpoints
│   │   ├── bulk-points.js       # Defensive SP frontier search
│   │   └── break-points.js      # Offensive SP breakpoint search
│   ├── ui/                     # DOM only — build inputs for the engine, render outputs
│   │   ├── components.js        # Shared DOM factories (search results, SP/stage inputs, STAT_LABELS)
│   │   ├── bootstrap.js         # Shared page init / catalog loading / usage ranking
│   │   ├── battle-state.js      # Pure battle-page state helpers (no DOM)
│   │   ├── builder-state.js     # Pure builder state and final stats
│   │   ├── lookup-page.js       # Lookup page controller
│   │   ├── battle-page.js       # Battle calculator page controller
│   │   ├── builder-page.js      # SP builder controller
│   │   └── speed-page.js        # Speed tiers controller
│   └── styles.css              # Shared styles
├── public/                    # Generated catalogs (pokemon/abilities/moves/items .json)
├── scripts/
│   ├── lib/sync-utils.mjs                  # Shared sync CLI and JSON-file utilities
│   ├── sync-pokemon-data.mjs              # Regenerate public/*.json from Showdown (+ Champions mod) + PokeAPI
│   ├── sync-limitless-champions-usage.mjs # Overlay Limitless Champions usage
│   ├── sync-champions-spreads.mjs         # Overlay Smogon ladder SP spreads
│   ├── sync-ncp-spreads.mjs               # Overlay NCP curated Champions sets
│   └── serve.mjs                          # Static file server (127.0.0.1:4173)
├── test/                      # Node built-in test runner suites (node --test)
├── .github/workflows/pages.yml # Deploys repo root to GitHub Pages on push to main
├── ROADMAP.md                  # Master plan + task index (docs/tasks/*.md)
└── MECHANICS_CHECKLIST.md     # Battle-calculator accuracy tracker
```

## Requirements

- Node.js 20 or newer (uses `node --test`, `fetch`, ES modules)
- No npm dependencies (`npm install` is unnecessary)

## Setup

```sh
npm run sync-data              # regenerate public/*.json from Showdown (incl. Champions mod) + PokeAPI (needs internet)
npm run sync-champions-data    # overlay Limitless Champions usage (run after sync-data)
npm run sync-champions-spreads # overlay Smogon ladder SP spreads (run after sync-champions-data)
npm run sync-ncp-spreads       # overlay NCP curated sets (run after sync-champions-spreads)
npm run sync-all               # all four, in order
```

Generated catalogs are committed, so syncing is only needed to refresh data.

## Usage

```sh
npm start
```

Then open <http://127.0.0.1:4173> for lookup, `/battle.html` for the calculator, `/builder.html` for bulk/break points, or `/speed.html` for interactive Speed tiers. Set `PORT` to use a different port (`serve.mjs` reads `process.env.PORT`, default 4173).

### Builder breakpoint priority

Builder cards group a base Pokémon with all of its Mega forms into one stack. "Breakpoint
priority" ranks actual SP transitions, matching the implementation introduced in `ffc7280`:

- Break points sort every form/move result in the stack by current maximum-damage percentage
  (`maxPct`) and use only the first, highest-damage result. If its current result takes `H`
  hits, the required breakpoint is the least SP that guarantees `max(1, H - 1)` hits. The
  stack rank is `(H, required SP)`, so a possible OHKO → guaranteed OHKO transition ranks
  before a 2HKO → guaranteed OHKO transition, which ranks before a 3HKO → guaranteed 2HKO
  transition, and so on.
- Bulk points consider every matchup from every form in the stack, regardless of `maxPct`.
  Each matchup contributes only its first calculated bulk point. The stack uses the best
  `(starting hit count, total SP)` transition: any OHKO → its first guaranteed survival point
  ranks before any 2HKO → its first point, then any 3HKO → its first point, and so on.

A current guaranteed result is not a zero-SP breakpoint or bulkpoint; a result must have an
actual calculated transition to participate. Lower SP wins within the same transition tier,
and the existing catalog order is preserved when ranks tie or no transition exists. Maximum
damage still orders the move panels, but it filters stack priority only for break points. The
default sort preserves catalog order without applying these rules.

## Data Sources

- Pokémon Showdown (mechanics/catalog seed: pokedex, learnsets, abilities, moves, items, text descriptions): <https://github.com/smogon/pokemon-showdown/tree/master/data>
- Pokémon Showdown Champions mod (Champions legality and balance overrides: per-species legality/tier from `formats-data.ts`, Champions learnsets, move/item/ability availability and stat changes): <https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions>. Applied during `sync-data`; catalogs get a `champions.legal` flag and Champions-legal Pokémon get Champions learnsets and move/item stats.
- Limitless tournament API (Champions usage counts, rates, per-Pokémon items/abilities/moves/natures): <https://play.limitlesstcg.com/tournaments> (`VGC` game, `M-B` format, last 50 tournaments by default)
- Smogon ladder usage stats (popular SP spreads per Pokémon, `Nature:HP/Atk/Def/SpA/SpD/Spe` with usage rates): <https://www.smogon.com/stats/> chaos JSON for the Champions VGC ladder. `sync-champions-spreads` auto-detects the latest month and newest regulation (Bo1 + Bo3, rating cutoff 1760 by default; override with `--month`, `--formats`, `--cutoff`, `--top`) and writes top spreads to `champions.usage.spreads` in `public/pokemon.json`.
- NCP (Nimbasa City Post) damage calculator (hand-curated Champions sets): <https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/>. `sync-ncp-spreads` parses its maintained JavaScript setdex and writes normalized sets to `champions.ncp` in `public/pokemon.json`.
- PokeAPI CSVs (Traditional Chinese search aliases only): `pokemon_species_names.csv`, `move_names.csv`, `ability_names.csv`, `items.csv`, `item_names.csv`

Generated files: `public/pokemon.json`, `public/abilities.json`, `public/moves.json`, `public/items.json`. Re-run `npm run sync-data` when Showdown data changes, `npm run sync-champions-data` when Limitless has new Champions tournaments, `npm run sync-champions-spreads` when Smogon publishes new monthly stats, and `npm run sync-ncp-spreads` when NCP sets change. `.github/workflows/update-data.yml` runs all four weekly and commits changes.

## Development

```sh
npm test                 # full suite (node --test)
npm run test:battle      # battle-order, damage, speed
npm run test:catalog     # battle-state, catalog, identifiers, pokemon, stats, ui
npm run test:data        # sync/parser/merge/data-loading suites, including NCP and shared sync utilities
npm run test:damage      # damage only
npm run test:pokemon     # pokemon only
```

No linter is configured. Deployment is automatic: `.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push to `main`.

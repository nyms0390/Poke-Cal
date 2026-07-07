# PokéCal

A compact, dependency-free competitive Pokémon toolkit: quick species lookup with Champions tournament usage, plus a two-Pokémon battle calculator.

## Overview

PokéCal is a browser-first ES-module web app with no build step and no npm dependencies. The lookup page (`index.html`) searches Pokémon by English or Traditional Chinese name and shows base stats, forms, abilities, moves, and items with Limitless Champions usage rates. The battle calculator (`battle.html`) configures two Pokémon (moves, SP, natures, stat stages, abilities, items, status) and computes move order and damage ranges. All catalog data is generated into `public/*.json` by sync scripts that pull from Pokémon Showdown, Limitless, and PokeAPI.

## Project Structure

```
PokéCal/
├── index.html                 # Lookup page (loads src/app.js)
├── battle.html                # Battle calculator page (loads src/battle-page.js)
├── src/
│   ├── app.js                 # Lookup page controller
│   ├── battle-page.js         # Battle calculator page controller
│   ├── damage.js              # Damage formula engine
│   ├── speed.js               # Speed calculation (Tailwind, paralysis, items, ...)
│   ├── battle-order.js        # Move order (priority, Speed, Trick Room)
│   ├── catalog.js             # Catalog search/sort helpers
│   ├── data.js                # Data loading helpers
│   ├── pokemon.js             # Species helpers
│   ├── stats.js               # Stat math
│   ├── showdown-data.js       # Pokémon Showdown export parsing
│   ├── champions-data.js      # Champions mod overlay (legality, learnsets, balance)
│   ├── limitless-data.js      # Limitless Champions usage building/merging
│   ├── smogon-data.js         # Smogon ladder stats parsing (SP spreads)
│   ├── usage-defaults.js      # Default move/item/ability seeding from usage
│   ├── ui.js                  # Shared rendering helpers
│   └── styles.css             # Shared styles
├── public/                    # Generated catalogs (pokemon/abilities/moves/items .json)
├── scripts/
│   ├── sync-pokemon-data.mjs              # Regenerate public/*.json from Showdown (+ Champions mod) + PokeAPI
│   ├── sync-limitless-champions-usage.mjs # Overlay Limitless Champions usage
│   ├── sync-champions-spreads.mjs         # Overlay Smogon ladder SP spreads
│   └── serve.mjs                          # Static file server (127.0.0.1:4173)
├── test/                      # Node built-in test runner suites (node --test)
├── data/pokeapi/              # Local snapshots of PokeAPI CSVs (sync script downloads from GitHub)
├── .github/workflows/pages.yml # Deploys repo root to GitHub Pages on push to main
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
npm run sync-all               # all three, in order
```

Generated catalogs are committed, so syncing is only needed to refresh data.

## Usage

```sh
npm start
```

Then open <http://127.0.0.1:4173> for lookup or <http://127.0.0.1:4173/battle.html> for the battle calculator. Set `PORT` to use a different port (`serve.mjs` reads `process.env.PORT`, default 4173).

## Data Sources

- Pokémon Showdown (mechanics/catalog seed: pokedex, learnsets, abilities, moves, items, text descriptions): <https://github.com/smogon/pokemon-showdown/tree/master/data>
- Pokémon Showdown Champions mod (Champions legality and balance overrides: per-species legality/tier from `formats-data.ts`, Champions learnsets, move/item/ability availability and stat changes): <https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions>. Applied during `sync-data`; catalogs get a `champions.legal` flag and Champions-legal Pokémon get Champions learnsets and move/item stats.
- Limitless tournament API (Champions usage counts, rates, per-Pokémon items/abilities/moves/natures): <https://play.limitlesstcg.com/tournaments> (`VGC` game, `M-B` format, last 50 tournaments by default)
- Smogon ladder usage stats (popular SP spreads per Pokémon, `Nature:HP/Atk/Def/SpA/SpD/Spe` with usage rates): <https://www.smogon.com/stats/> chaos JSON for the Champions VGC ladder. `sync-champions-spreads` auto-detects the latest month and newest regulation (Bo1 + Bo3, rating cutoff 1760 by default; override with `--month`, `--formats`, `--cutoff`, `--top`) and writes top spreads to `champions.usage.spreads` in `public/pokemon.json`.
- PokeAPI CSVs (Traditional Chinese search aliases only): `pokemon_species_names.csv`, `move_names.csv`, `ability_names.csv`, `items.csv`, `item_names.csv`

Generated files: `public/pokemon.json`, `public/abilities.json`, `public/moves.json`, `public/items.json`. Re-run `npm run sync-data` when Showdown data changes; `npm run sync-champions-data` (alias: `sync-champions-usage`) when Limitless has new Champions tournaments; `npm run sync-champions-spreads` when Smogon publishes new monthly stats (1st–2nd of each month). `.github/workflows/update-data.yml` runs all three weekly and commits changes.

## Development

```sh
npm test                 # full suite (node --test)
npm run test:battle      # battle-order, damage, speed
npm run test:catalog     # catalog, pokemon, stats, ui
npm run test:data        # champions-data, data, limitless-data, showdown-data, smogon-data, sync-pokemon-data, usage-defaults
npm run test:damage      # damage only
npm run test:pokemon     # pokemon only
```

No linter is configured. Deployment is automatic: `.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push to `main`.

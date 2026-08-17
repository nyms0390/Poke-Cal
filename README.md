# PokéCal

A compact, dependency-free competitive Pokémon toolkit: species and move lookup, a two-Pokémon battle calculator, a matchup-driven SP builder, interactive Speed tiers, and recent Champions tournament teams.

## Overview

PokéCal is a browser-first ES-module web app with no build step and no npm dependencies. The lookup page (`index.html`) searches Pokémon by English or Traditional Chinese name and shows stats, defensive matchups, Champions usage, spreads, and a sortable move pool. The move catalog (`moves.html`) filters every Champions-legal move by name, type, category, or property. The battle calculator (`battle.html`) configures two Pokémon and computes move order, damage ranges, and KO chances, with saved sets and set-text import and export. The builder (`builder.html`) finds defensive bulk and offensive break points against usage-backed threat sets, while the Speed tiers page (`speed.html`) compares final Speed across fixed opponent presets. The tournament-team browser (`teams.html`) shows recent completed Limitless Champions brackets and their submitted builds. Catalog and team data is generated into `public/*.json` from Pokémon Showdown, Limitless, Smogon ladder stats, NCP curated sets, and PokeAPI aliases.

## Project Structure

```
PokéCal/
├── index.html                 # Lookup page (loads src/ui/lookup-page.js)
├── moves.html                 # Move catalog (loads src/ui/moves-page.js)
├── battle.html                # Battle calculator page (loads src/ui/battle-page.js)
├── builder.html               # SP builder (loads src/ui/builder-page.js)
├── speed.html                 # Speed tiers (loads src/ui/speed-page.js)
├── teams.html                 # Tournament teams (loads src/ui/teams-page.js)
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
│   │   ├── ko-chance.js        # Repeated-hit KO probabilities
│   │   ├── result-text.js      # Pure damage-result summaries
│   │   ├── speed.js            # Speed calculation (Tailwind, paralysis, items, ...)
│   │   └── battle-order.js     # Move order (priority, Speed, Trick Room)
│   ├── data/                   # loading, parsing, usage
│   │   ├── data.js              # Data loading helpers
│   │   ├── catalog.js           # Catalog search/sort helpers
│   │   ├── pokemon.js           # Species helpers
│   │   ├── showdown-data.js     # Pokémon Showdown export parsing
│   │   ├── champions-data.js    # Champions mod overlay (legality, learnsets, balance)
│   │   ├── limitless-data.js    # Limitless Champions usage building/merging
│   │   ├── limitless-teams.js   # Limitless tournament-team archive building/loading
│   │   ├── smogon-data.js       # Smogon ladder stats parsing (SP spreads)
│   │   ├── ncp-data.js          # NCP curated Champions set parsing/merging
│   │   ├── active-set.js        # Cross-page active-set persistence
│   │   ├── saved-sets.js        # Named saved-set persistence
│   │   ├── set-paste.js         # PokéCal/Showdown set import and export
│   │   ├── usage-defaults.js    # Default move/item/ability seeding from usage
│   │   ├── threats.js           # Usage-backed threat sets and SP presets
│   │   ├── threat-preferences.js # Persisted opponent-count preferences
│   │   ├── speed-line.js        # Pure Speed-tier rows and breakpoints
│   │   ├── bulk-points.js       # Defensive SP frontier search
│   │   └── break-points.js      # Offensive SP breakpoint search
│   ├── ui/                     # DOM only — build inputs for the engine, render outputs
│   │   ├── components.js        # Shared DOM factories (search results, SP/stage inputs, STAT_LABELS)
│   │   ├── bootstrap.js         # Shared page init / catalog loading / usage ranking
│   │   ├── battle-results.js    # Battle-result expansion helpers
│   │   ├── builder-focus.js     # Builder card focus restoration
│   │   ├── field-controls.js    # Shared environment and side-condition controls
│   │   ├── field-state.js       # Pure field-control state updates
│   │   ├── live-update.js       # Shared immediate/deferred UI updates
│   │   ├── battle-state.js      # Pure battle-page state helpers (no DOM)
│   │   ├── builder-state.js     # Pure builder state and final stats
│   │   ├── lookup-page.js       # Lookup page controller
│   │   ├── moves-page.js        # Move catalog controller
│   │   ├── battle-page.js       # Battle calculator page controller
│   │   ├── builder-page.js      # SP builder controller
│   │   ├── speed-page.js        # Speed tiers controller
│   │   └── teams-page.js        # Tournament-team browser controller
│   └── styles.css              # Shared styles
├── public/                    # Generated catalogs plus Limitless tournament teams
├── scripts/
│   ├── lib/sync-utils.mjs                  # Shared sync CLI and JSON-file utilities
│   ├── sync-pokemon-data.mjs              # Regenerate public/*.json from Showdown (+ Champions mod) + PokeAPI
│   ├── sync-limitless-champions-usage.mjs # Overlay usage and build the team archive
│   ├── sync-champions-spreads.mjs         # Overlay Smogon ladder SP spreads
│   ├── sync-ncp-spreads.mjs               # Overlay NCP curated Champions sets
│   └── serve.mjs                          # Static file server (127.0.0.1:4173)
├── test/                      # Node built-in test runner suites (node --test)
├── .github/workflows/pages.yml # Deploys repo root to GitHub Pages on push to main
├── ROADMAP.md                  # Completed implementation roadmap
└── MECHANICS_CHECKLIST.md     # Battle-calculator accuracy tracker
```

## Requirements

- Node.js 20 or newer (uses `node --test`, `fetch`, ES modules)
- No npm dependencies (`npm install` is unnecessary)

## Setup

```sh
npm run sync-data              # regenerate public/*.json from Showdown (incl. Champions mod) + PokeAPI (needs internet)
npm run sync-champions-data    # overlay Limitless usage and rebuild the team archive (run after sync-data)
npm run sync-champions-spreads # overlay Smogon ladder SP spreads (run after sync-champions-data)
npm run sync-ncp-spreads       # overlay NCP curated sets (run after sync-champions-spreads)
npm run sync-all               # all four, in order
```

Generated catalogs are committed, so syncing is only needed to refresh data.

## Usage

```sh
npm start
```

Then open one of the six tools:

| Route | Tool |
| --- | --- |
| `/` or `/index.html` | Pokémon lookup, usage, spreads, matchups, and move pool |
| `/moves.html` | Searchable, filterable Champions move catalog |
| `/battle.html` | Damage, KO chance, and move-order calculator |
| `/builder.html` | Defensive bulk and offensive break points |
| `/speed.html` | Interactive Speed tiers and breakpoints |
| `/teams.html` | Recent Limitless Champions tournament teams |

Set `PORT` to use a different port (`serve.mjs` reads `process.env.PORT`, default 4173). The battle calculator stores named sets in browser local storage, imports PokéCal SP or Pokémon Showdown EV set text, and exports PokéCal SP set text.

### Builder workflow and assumptions

Open `/builder.html`, choose your Pokémon and SP spread, select how many popular opponents to
analyze, and optionally add custom opponents. The Bulk tab searches for the least joint
HP/Def/SpD investment that improves survival against each family; the Break tab searches for
Atk/SpA thresholds that improve your selected moves' KO tier. Opponent cards are editable, and
the Speed tiers link carries the chosen Pokémon to `/speed.html`.

In builder and Speed-tier copy, a "threat" is a Pokémon selected by Limitless Champions usage.
Limitless provides observed nature, ability, item, move, and Tera
choices but no SP spreads. Threats therefore start with the most-used nature, ability, item, and
damaging moves, with Tera inactive. Offensive checks assume 32 Atk and 32 SpA. Defensive checks
use the top Smogon ladder SP spread when available, otherwise the explicit fast-offense fallback
of 2 HP / 0 Def / 0 SpD. The four Speed presets are max +Speed, max neutral, uninvested neutral,
and minimum −Speed. These defaults are editable comparison assumptions, not submitted Limitless
team spreads.

### Builder breakpoint priority

Builder cards group a base Pokémon with all of its Mega forms into one stack. "Breakpoint
priority" ranks actual SP transitions:

- Break points sort every form/move result in the stack by current maximum-damage percentage
  (`maxPct`) and use only the first, highest-damage result. If its current result takes `H`
  hits, the required breakpoint is the least SP that guarantees `max(1, H - 1)` hits. The
  stack rank is `(H, required SP)`, so a possible OHKO → guaranteed OHKO transition ranks
  before a 2HKO → guaranteed OHKO transition, which ranks before a 3HKO → guaranteed 2HKO
  transition, and so on.
- Bulk points establish each family stack's origin tier from zero HP/Def/SpD SP, using the two
  analyzed damaging moves for every displayed form. The target is the next modeled tier
  (OHKO → 2HKO through 5HKO → not KO'd within five hits), and the required cost is the least
  one legal joint HP/Def/SpD allocation that makes every analyzed matchup reach that target
  within the 66-point total-SP budget left after Atk/SpA/Spe. Families appear in fixed
  **Possible**, **Covered**, then **Unreachable** sections and sort within each section by
  `(zero-bulk origin hit count, joint required SP)`, preserving catalog order on a tie.

Maximum damage still orders move panels. The Break points tab retains its breakpoint/default
sort toggle; the Bulk tab always uses its fixed section order and joint-coverage ranking.

## Data Sources

- Pokémon Showdown (mechanics/catalog seed: pokedex, learnsets, abilities, moves, items, text descriptions): <https://github.com/smogon/pokemon-showdown/tree/master/data>
- Pokémon Showdown Champions mod (Champions legality and balance overrides: per-species legality/tier from `formats-data.ts`, Champions learnsets, move/item/ability availability and stat changes): <https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions>. Applied during `sync-data`; catalogs get a `champions.legal` flag and Champions-legal Pokémon get Champions learnsets and move/item stats.
- Limitless tournament API (Champions usage counts and rates plus per-Pokémon items, abilities, moves, natures, and Tera choices): <https://play.limitlesstcg.com/tournaments> (`VGC` game, `M-B` format, last 50 tournaments by default). The same sync also archives up to 10 recent completed brackets with published top-cut team lists; Limitless does not publish SP or EV spreads for those teams.
- Smogon ladder usage stats (popular SP spreads per Pokémon, `Nature:HP/Atk/Def/SpA/SpD/Spe` with usage rates): <https://www.smogon.com/stats/> chaos JSON for the Champions VGC ladder. `sync-champions-spreads` auto-detects the latest month and newest regulation (Bo1 + Bo3, rating cutoff 1760 by default; override with `--month`, `--formats`, `--cutoff`, `--top`) and writes top spreads to `champions.usage.spreads` in `public/pokemon.json`.
- NCP (Nimbasa City Post) damage calculator (hand-curated Champions sets): <https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/>. `sync-ncp-spreads` parses its maintained JavaScript setdex and writes normalized sets to `champions.ncp` in `public/pokemon.json`.
- PokeAPI CSVs (Traditional Chinese search aliases only): `pokemon_species_names.csv`, `move_names.csv`, `ability_names.csv`, `items.csv`, `item_names.csv`

Generated files: `public/pokemon.json`, `public/abilities.json`, `public/moves.json`, `public/items.json`, and `public/limitless-teams.json`. Re-run `npm run sync-data` when Showdown data changes, `npm run sync-champions-data` when Limitless has new Champions tournaments, `npm run sync-champions-spreads` when Smogon publishes new monthly stats, and `npm run sync-ncp-spreads` when NCP sets change. `.github/workflows/update-data.yml` runs all four weekly and commits changes.

## Development

```sh
npm test                 # full suite (node --test)
npm run test:battle      # battle-order, damage, speed
npm run test:builder     # threats/preferences, builder state, speed line, bulk/break points, cross-check
npm run test:catalog     # battle-state, catalog, identifiers, pokemon, stats, ui
npm run test:data        # sync/parser/merge/data-loading suites, including Limitless teams, NCP, and sync utilities
npm run test:damage      # damage only
npm run test:pokemon     # pokemon only
```

No linter is configured. Deployment is automatic: `.github/workflows/pages.yml` publishes the repository root to GitHub Pages on every push to `main`.

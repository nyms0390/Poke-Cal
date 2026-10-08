# PokéCal

A compact, dependency-free competitive Pokémon toolkit: species and move lookup, a two-Pokémon battle calculator, a matchup-driven SP builder, a one-on-one matchup overview, interactive Speed tiers, and recent Champions tournament teams.

## Overview

PokéCal is a browser-first ES-module web app with no build step and no npm dependencies. The lookup page (`index.html`) searches Pokémon by English or Traditional Chinese name and shows stats, defensive matchups, Champions usage, spreads, and a sortable move pool. The move catalog (`moves.html`) filters every Champions-legal move by name, type, category, or property. The battle calculator (`battle.html`) configures two Pokémon and computes move order, damage ranges, and KO chances, with saved sets and set-text import and export. The builder (`builder.html`) finds defensive bulk and offensive break points against usage-backed threat sets, the matchups page (`matchups.html`) races one set against the most-used Pokémon to show what beats it, what it beats, and where Speed decides, while the Speed tiers page (`speed.html`) compares final Speed across fixed opponent presets. The tournament-team browser (`teams.html`) shows recent completed Limitless Champions brackets and their submitted builds. Catalog and team data is generated into `public/*.json` from Pokémon Showdown, Limitless, Smogon ladder stats, NCP curated sets, and PokeAPI aliases; the pages load slim, minified Champions-only copies from `public/web/*.json`.

## Project Structure

```
PokéCal/
├── index.html                 # Lookup page (loads src/ui/lookup-page.js)
├── moves.html                 # Move catalog (loads src/ui/moves-page.js)
├── battle.html                # Battle calculator page (loads src/ui/battle-page.js)
├── builder.html               # SP builder (loads src/ui/builder-page.js)
├── matchups.html              # Matchup overview (loads src/ui/matchups-page.js)
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
│   │   ├── data.js              # Data loading helpers (fetches public/web/*.json)
│   │   ├── web-catalogs.js      # Pure slim browser-catalog derivation (Champions selection)
│   │   ├── catalog-validation.js # Pure catalog metrics, minimums, and max-shrink checks
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
│   │   ├── matchups.js          # One-on-one KO race, observed opposing sets, Trick Room team shares
│   │   ├── matchup-analysis.js  # Matchups page analysis: rank, race, summarize, group
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
│   │   ├── matchups-page.js     # Matchups page controller
│   │   ├── speed-page.js        # Speed tiers controller
│   │   └── teams-page.js        # Tournament-team browser controller
│   └── styles.css              # Shared styles
├── public/                    # Generated full catalogs plus Limitless tournament teams (MCP, scripts, skills)
│   ├── web/                   # Generated slim, minified browser catalogs (npm run build-web-catalogs)
│   ├── mcp-catalogs/          # Generated minified MCP Worker catalogs, every entry (npm run build-web-catalogs)
│   └── icons/                 # Type and move-category icons
├── scripts/
│   ├── lib/sync-utils.mjs                  # Shared sync CLI/JSON utilities and timeout/retry fetch helper
│   ├── lib/showdown-pin.mjs                # Read/validate/write the Showdown commit pin
│   ├── showdown-pin.json                  # Pinned smogon/pokemon-showdown commit used by sync-data
│   ├── bump-showdown-pin.mjs              # Move the pin to the latest Showdown master (npm run bump-showdown)
│   ├── sync-pokemon-data.mjs              # Regenerate public/*.json from Showdown (+ Champions mod) + PokeAPI
│   ├── sync-limitless-champions-usage.mjs # Overlay usage and build the team archive
│   ├── sync-champions-spreads.mjs         # Overlay Smogon ladder SP spreads
│   ├── sync-ncp-spreads.mjs               # Overlay NCP curated Champions sets
│   ├── build-web-catalogs.mjs             # Derive public/web/*.json and public/mcp-catalogs/*.json from public/*.json
│   ├── validate-data.mjs                  # Validate catalogs (minimums, --baseline shrink check)
│   ├── stage-site.mjs                     # Stage the GitHub Pages site into _site/
│   └── serve.mjs                          # Static file server (127.0.0.1:4173)
├── test/                      # Node built-in test runner suites (node --test)
├── .github/workflows/pages.yml # Tests, deploys _site/ to GitHub Pages and mcp/ to Cloudflare
├── .github/workflows/update-data.yml # Weekly sync (read-only job) + commit/deploy job
├── .github/workflows/bump-showdown.yml # Weekly "Bump Showdown pin" pull request
├── .github/dependabot.yml      # Weekly updates for the SHA-pinned GitHub Actions
└── ROADMAP.md                  # Completed implementation roadmap
```

## Requirements

- Node.js 22 (uses `node --test` globs, `fetch`, ES modules, and the permission model for the Showdown parsing sandbox; the MCP Worker also needs Node 22)
- No npm dependencies for the app (`npm install` is unnecessary). Only the MCP tests need `npm ci --prefix mcp --ignore-scripts`.

## Setup

```sh
npm run sync-data              # regenerate public/*.json from Showdown (incl. Champions mod, pinned commit) + PokeAPI (needs internet)
npm run sync-champions-data    # overlay Limitless usage and rebuild the team archive (run after sync-data)
npm run sync-champions-spreads # overlay Smogon ladder SP spreads (run after sync-champions-data)
npm run sync-ncp-spreads       # overlay NCP curated sets (needs only sync-data; independent of the usage/spread overlays)
npm run sync-all               # all four (sync-data, champions-data, champions-spreads, ncp-spreads), then build-web-catalogs
npm run build-web-catalogs     # regenerate the slim browser catalogs in public/web/ and the MCP catalogs in public/mcp-catalogs/
npm run validate-data          # check catalog metrics (add -- --baseline <dir> to compare against a copy)
npm run bump-showdown          # move scripts/showdown-pin.json to the latest Showdown master (-- --commit <sha> to pick one)
```

Generated catalogs are committed, so syncing is only needed to refresh data.

Showdown is pinned: `sync-data` fetches the Showdown base data, text, and Champions mod from the commit in `scripts/showdown-pin.json` (`{"repo": "smogon/pokemon-showdown", "commit": "<40-hex SHA>"}`), never from `master`, so stats, moves, and legality only change after a reviewed bump. `.github/workflows/bump-showdown.yml` runs `npm run bump-showdown` weekly (and on demand) and, when master has moved, opens or updates a single "Bump Showdown pin" pull request from `bot/showdown-pin` with the upstream compare link; merging it pulls those catalog changes into the next weekly sync. The usage sources (Limitless, Smogon stats, NCP) and PokeAPI are not pinned and keep updating weekly.

Syncs fail closed: each script validates its own freshly built output (`src/data/catalog-validation.js`: absolute minimums such as at least 150 Champions-legal Pokémon with Limitless usage, 100 with Smogon spreads, 40 with NCP sets, 1000 Pokémon with Traditional Chinese aliases, 3 archived tournaments; and no metric may shrink by more than 25% versus the files being replaced) and exits non-zero without writing anything when a check fails. Pass `--allow-shrink` (e.g. `npm run sync-ncp-spreads -- --allow-shrink`) only when a large drop is a legitimate upstream change; minimums still apply. Upstream requests use a shared helper with timeouts, bounded retries with backoff for network errors/429/5xx, and rejection of HTML error pages. Showdown `.ts` files are evaluated in a child Node process started with the permission model (no file, child-process, or worker access and an empty environment).

## Usage

### Cloudflare MCP

PokéCal also includes a deploy-ready, read-only Cloudflare Worker MCP at [`mcp/README.md`](mcp/README.md). It exposes deterministic Champions lookup, Speed, damage, and survival tools at `/mcp` without requiring callers to send model-provider credentials.

```sh
npm start
```

Then open one of the seven tools:

| Route | Tool |
| --- | --- |
| `/` or `/index.html` | Pokémon lookup, usage, spreads, matchups, and move pool |
| `/moves.html` | Searchable, filterable Champions move catalog |
| `/battle.html` | Damage, KO chance, and move-order calculator |
| `/builder.html` | Defensive bulk and offensive break points |
| `/matchups.html` | What beats one set, what it beats, and where Speed decides |
| `/speed.html` | Interactive Speed tiers and breakpoints |
| `/teams.html` | Recent Limitless Champions tournament teams |

Set `PORT` to use a different port (`serve.mjs` reads `process.env.PORT`, default 4173) and `SERVE_ROOT` to serve another directory (for example `_site` after `npm run stage-site`). The server only serves files inside its root (no dotfiles) and sends ETag/Last-Modified for revalidation. The battle calculator stores named sets in browser local storage, imports PokéCal SP or Pokémon Showdown EV set text, and exports PokéCal SP set text.

### Builder workflow and assumptions

Open `/builder.html`, choose your Pokémon and SP spread, select how many popular opponents to
analyze, and optionally add custom opponents. The Bulk tab searches for the least joint
HP/Def/SpD investment that improves survival against each family; the Break tab searches for
Atk/SpA thresholds that improve your selected moves' KO tier. Opponent cards are editable, and
the Speed tiers link carries the chosen Pokémon to `/speed.html`.

In builder and Speed-tier copy, a "threat" is a Pokémon selected by Limitless Champions usage.
PokéCal keeps Limitless's observed nature, ability, item, and move
choices (Tera usage is not kept), and Limitless has no SP spreads. Threats therefore start with
the most-used nature, ability, item, and damaging moves, with Tera inactive. Offensive checks assume 32 Atk and 32 SpA. Defensive checks
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

### Matchups workflow and assumptions

Open `/matchups.html` (or **Check matchups →** in the builder, which carries the current set),
choose the top 50 or 100 opponents and how equal-hit races resolve. Each opponent uses its top
Limitless Champions ability and item (a Mega form holds its stone), every damaging move on at
least 5% of its Limitless sets, and its top Smogon ladder SP spread, or a max-offense preset
when the ladder has none. Each side races with the move that KOs in the fewest hits with at
least a 50% chance; fewer hits wins, and equal hits go to whoever moves first (priority, then
Speed, reversed in Trick Room). **Auto** weights normal and Trick Room order by the share of
the opponent's submitted Limitless teams that run Trick Room. Weather and terrain abilities
apply on top of the chosen environment, Intimidate is applied on entry, and Fake Out, charge,
recharge and self-KO moves are left out of the race. It is a one-on-one measure, not a
doubles win rate.

## Data Sources

- Pokémon Showdown (mechanics/catalog seed: pokedex, learnsets, abilities, moves, items, text descriptions): <https://github.com/smogon/pokemon-showdown/tree/master/data>, fetched at the commit pinned in `scripts/showdown-pin.json`.
- Pokémon Showdown Champions mod (Champions legality and balance overrides: per-species legality/tier from `formats-data.ts`, Champions learnsets, move/item/ability availability and stat changes): <https://github.com/smogon/pokemon-showdown/tree/master/data/mods/champions>, at the same pinned commit. Applied during `sync-data`; catalogs get a `champions.legal` flag and Champions-legal Pokémon get Champions learnsets and move/item stats.
- Limitless tournament API (Champions usage counts and rates plus per-Pokémon items, abilities, moves, and natures; Tera usage is dropped during the merge): <https://play.limitlesstcg.com/tournaments> (`VGC` game, `M-C` format, last 50 tournaments by default). The same sync also archives up to 10 recent completed brackets with published top-cut team lists; Limitless does not publish SP or EV spreads for those teams.
- Smogon ladder usage stats (popular SP spreads per Pokémon, `Nature:HP/Atk/Def/SpA/SpD/Spe` with usage rates): <https://www.smogon.com/stats/> chaos JSON for the Champions VGC ladder. `sync-champions-spreads` auto-detects the latest month and newest regulation (Bo1 + Bo3, rating cutoff 1760 by default; override with `--month`, `--formats`, `--cutoff`, `--top`) and writes top spreads to `champions.usage.spreads` in `public/pokemon.json`.
- NCP (Nimbasa City Post) damage calculator (hand-curated Champions sets): <https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/>. `sync-ncp-spreads` parses its maintained JavaScript setdex and writes normalized sets to `champions.ncp` in `public/pokemon.json`.
- PokeAPI CSVs (Traditional Chinese search aliases only): `pokemon_species_names.csv`, `move_names.csv`, `ability_names.csv`, `items.csv`, `item_names.csv`
  - To correct a Traditional Chinese name (e.g. Kingambit 仆刀將軍 → 仆斬將軍), add it to `src/locales/zh-tw-name-overrides.js` and run `npm run apply-name-overrides`. `sync-data` re-applies the table on every scheduled update, so the fix is not overwritten.

Generated files: `public/pokemon.json`, `public/abilities.json`, `public/moves.json`, `public/items.json`, and `public/limitless-teams.json` (full catalogs, used by scripts and agent skills), plus `public/mcp-catalogs/*.json` for the MCP Worker (every entry, minified, without fields the Worker never reads: about 6.0 MB raw down to about 1.0 MB), plus the derived `public/web/*.json` the browser loads: only the Champions-legal entries the pages keep (legal Pokémon and their Mega forms, legal moves and items, and abilities those Pokémon use), minified and without Showdown's per-generation history fields. That cuts the four catalogs every page fetches from about 6.0 MB raw / 0.68 MB gzip to about 1.95 MB raw / 0.29 MB gzip. Re-run `npm run sync-data` after bumping the Showdown pin, `npm run sync-champions-data` when Limitless has new Champions tournaments, `npm run sync-champions-spreads` when Smogon publishes new monthly stats (it falls back up to three months if the newest has no Champions formats yet), and `npm run sync-ncp-spreads` when NCP sets change, then `npm run build-web-catalogs`. `.github/workflows/update-data.yml` runs all of them weekly in a read-only job (Showdown at the pinned commit), validates the result against the committed data, and a separate job commits `public/` and triggers the Pages deploy; `.github/workflows/bump-showdown.yml` proposes pin bumps as a pull request.

## Development

```sh
npm test                 # app suite (node --test "test/**/*.test.js"); no MCP dependencies needed
npm run test:mcp         # MCP Worker suite (run npm ci --prefix mcp --ignore-scripts first)
npm run test:all         # both (plain node --test)
npm run test:server      # static server tests
npm run test:battle      # battle-order, damage, speed
npm run test:builder     # threats/preferences, builder state, speed line, bulk/break points, cross-check
npm run test:catalog     # battle-state, catalog, identifiers, pokemon, stats, ui
npm run test:data        # sync/parser/merge/data-loading suites, incl. Limitless teams, NCP, sync utilities, validation, web catalogs
npm run test:damage      # damage only
npm run test:pokemon     # pokemon only
```

The accuracy record for the battle calculator is the `@smogon/calc` reference suite, not a separate checklist: `test/damage-reference.test.js` compares all 16 damage rolls of about 280 scenarios against `test/fixtures/damage-reference.json`, which is generated from `@smogon/calc` (Gen 9 rules, level 50, SP `s` = EV `min(252, 8s)`). The app and tests stay dependency-free; to add scenarios, run `npm install --no-save @smogon/calc@0.12.0 && node scripts/dev/generate-damage-reference.mjs` and commit the regenerated fixture. `test/speed-reference.test.js` does the same for final Speed against `test/fixtures/speed-reference.json` (`@smogon/calc` `getFinalSpeed`; regenerate with `node scripts/dev/generate-speed-reference.mjs`).

No linter is configured. Deployment is automatic: `.github/workflows/pages.yml` runs the app and MCP tests and `validate-data`, stages only the browser site with `npm run stage-site` (the seven pages, `src/`, `public/icons/`, and `public/web/` in `_site/`; tests, docs, MCP, scripts, agent skills, and the full catalogs are not published), and deploys it on every push to `main` and whenever the weekly data update commits new catalogs. The same workflow's `deploy-mcp` job deploys the Cloudflare MCP Worker after the tests pass when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets are set (see [`mcp/README.md`](mcp/README.md)).

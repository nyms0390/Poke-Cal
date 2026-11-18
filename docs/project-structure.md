# Project structure

File layout of the repo. AGENTS.md "Architecture" explains the layers and how the pages share state; this file is the map.

```
PokéCal/
├── index.html                 # Lookup page (loads src/ui/lookup-page.js)
├── moves.html                 # Move catalog (loads src/ui/moves-page.js)
├── battle.html                # Battle calculator page (loads src/ui/battle-page.js)
├── builder.html               # SP builder (loads src/ui/builder-page.js)
├── matchups.html              # Matchup overview (loads src/ui/matchups-page.js)
├── compare.html               # Set comparison (loads src/ui/compare-page.js)
├── speed.html                 # Speed tiers (loads src/ui/speed-page.js)
├── teams.html                 # Tournament teams (loads src/ui/teams-page.js)
├── my-teams.html              # Your saved teams (loads src/ui/my-teams-page.js)
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
│   │   ├── pokemon-art.js       # Catalog id → PokeAPI HOME render file (large sprite slots)
│   │   ├── showdown-data.js     # Pokémon Showdown export parsing
│   │   ├── champions-data.js    # Champions mod overlay (legality, learnsets, balance)
│   │   ├── limitless-data.js    # Limitless Champions usage building/merging
│   │   ├── limitless-teams.js   # Limitless tournament-team archive building/loading
│   │   ├── smogon-data.js       # Smogon ladder stats parsing (SP spreads)
│   │   ├── ncp-data.js          # NCP curated Champions set parsing/merging
│   │   ├── active-set.js        # Cross-page active-set persistence
│   │   ├── saved-sets.js        # Named saved-set persistence
│   │   ├── storage-store.js     # Versioned localStorage store shared by every persisted setting
│   │   ├── set-paste.js         # PokéCal/Showdown set import and export
│   │   ├── usage-defaults.js    # Default move/item/ability seeding from usage
│   │   ├── threats.js           # Usage-backed threat sets and SP presets
│   │   ├── matchups.js          # One-on-one KO race, observed opposing sets, Trick Room team shares
│   │   ├── matchup-analysis.js  # Matchups page analysis: rank, race, summarize, group
│   │   ├── uncommon-sets.js     # Fewest-rare-choice theory sets that beat a set
│   │   ├── niche-threats.js     # Rarely used Pokémon: harshest theory sets, grouped by pattern
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
├── .github/workflows/audit.yml # npm audit gate for mcp/ (dependency changes + weekly)
├── .github/dependabot.yml      # Weekly updates for the SHA-pinned GitHub Actions and mcp/ npm deps
└── docs/                       # DECISIONS.md (owner decisions), ui-quality-workflow.md, ROADMAP.md (historical July 2026 plan), move-conditions.md
```

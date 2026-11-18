# PokéCal

A compact competitive Pokémon toolkit for Pokémon Champions doubles: lookup, a battle calculator, an SP builder, matchups, Speed tiers and tournament teams. It is a plain browser app (ES modules, no build step, no npm dependencies), in English and Traditional Chinese.

## Pages

| Route | What it does |
| --- | --- |
| `/` | Pokémon lookup: stats, usage, teammates, spreads, move pool |
| `/moves.html` | Filterable, sortable Champions move catalog |
| `/battle.html` | Damage, KO chance and move order for two Pokémon |
| `/speed.html` | Interactive Speed tiers and breakpoints |
| `/builder.html` | Defensive bulk and offensive break points against top threats |
| `/matchups.html` | What beats one set, what it beats, and where Speed decides |
| `/compare.html` | Up to six variants of a set raced against the same opponents |
| `/teams.html` | Recent Limitless Champions tournament teams |
| `/my-teams.html` | Your saved teams, loaded into Battle or Matchups in one tap |

A read-only Cloudflare Worker MCP with the same engine lives in [`mcp/`](mcp/README.md).

## Quick start

Requires Node.js 22. Nothing to install.

```sh
npm start   # http://127.0.0.1:4173 (PORT and SERVE_ROOT change the port and root)
npm test    # app test suite, including the design lint
```

Generated catalogs in `public/` are committed and refreshed weekly by GitHub Actions, so you only sync data to refresh it sooner. Pushes to `main` deploy the site to GitHub Pages and the MCP to Cloudflare.

## Docs

- [AGENTS.md](AGENTS.md): commands, architecture and conventions for working on the code
- [DESIGN.md](DESIGN.md) and [docs/ui-quality-workflow.md](docs/ui-quality-workflow.md): UI design rules and how to verify UI changes
- [docs/DECISIONS.md](docs/DECISIONS.md): owner decisions on scope, mechanics, data and workflow
- [docs/mechanics.md](docs/mechanics.md): Builder and Matchups assumptions, the accuracy record, mechanics not modeled yet
- [docs/data-pipeline.md](docs/data-pipeline.md): data sources, sync commands and generated files
- [docs/project-structure.md](docs/project-structure.md): file layout

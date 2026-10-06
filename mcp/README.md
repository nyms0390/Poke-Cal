# PokéCal Cloudflare MCP

This package deploys the public, unauthenticated PokéCal MCP MVP as a Cloudflare Worker at `/mcp`. It uses the stateless Streamable HTTP handler from `agents/mcp/server` and reuses PokéCal's pure calculation engine. It does not run an LLM and never accepts, stores, or forwards an agent's model/provider API token; callers use their own AI-provider credentials.

## Prerequisites and commands

Node.js 22 or newer and a Cloudflare account configured for Wrangler are required for deployment. Dependencies are isolated to this directory:

```sh
cd mcp
npm install
npm test
npm run check:deploy       # Wrangler dry run only
npx wrangler dev           # local Worker at /mcp
npm run deploy             # manual production deployment (wrangler deploy)
```

Production deploys are automatic once the repository has two Actions secrets: `CLOUDFLARE_API_TOKEN` (a Cloudflare API token from the "Edit Cloudflare Workers" template, scoped to the owner's account) and `CLOUDFLARE_ACCOUNT_ID`. The `deploy-mcp` job in `.github/workflows/pages.yml` then runs `npm run deploy` after the app and MCP tests pass, on every push to `main` and whenever the weekly data update dispatches that workflow, so the Worker always serves the committed engine and `public/mcp-catalogs/`. Without the secrets the job skips with a warning and the manual command above is the only way to deploy.

The `MCP_RATE_LIMITER` binding in `wrangler.jsonc` allows 120 requests per 60 seconds per `CF-Connecting-IP` under rate-limit `namespace_id` `"20261"`. The id only needs to be unique among the rate-limit namespaces in the owner's Cloudflare account; Workers sharing an id share one counter.

This repository does not include an account ID, zone ID, custom domain, or a deployment token; CI reads them from the Actions secrets above. The Worker serves the MCP endpoint at `https://<worker-subdomain>.workers.dev/mcp` after deployment; configure that URL in an MCP-capable agent.

## Tools

Exactly five read-only tools are registered:

- `lookup_pokemon({query, limit})` — matching species with IDs, names, types, base stats, abilities, and concise Champions availability/usage.
- `lookup_move({query, limit})` — matching moves with type, category, power, accuracy, priority, target, description, and Champions legality.
- `compare_speed(...)` — resolved final Speed and acting order with spreads, modifiers, weather/terrain, and Trick Room.
- `calculate_damage(...)` — deterministic damage range/distribution, percentages, HP, type effectiveness, KO summary, notes, and assumptions.
- `check_survival(...)` — the damage result plus survival verdict and remaining-HP range.

### Input validation

All free-text inputs (names, spreads, abilities, items, and search queries) are trimmed and limited to 100 characters. Enum-like inputs are case-insensitive, accept common aliases, and are normalised to the values the engine uses; anything else is rejected with an `Invalid arguments: …` error that lists the accepted values. Error messages quote at most 40 characters of caller input.

| Input | Canonical values | Accepted aliases (case, spaces, `-` and `_` ignored) |
|---|---|---|
| `weather` | `RainDance`, `SunnyDay`, `Sandstorm`, `Snowscape` | `rain`, `sun`/`sunny`, `sand`, `snow`/`hail`; `none` or empty for clear weather |
| `terrain` | `Electric Terrain`, `Grassy Terrain`, `Misty Terrain`, `Psychic Terrain` | `electric`, `grassy`/`grass`, `misty`, `psychic`; `none` or empty for no terrain |
| `*Status` | `paralysis`, `burn`, `poison`, `toxic`, `sleep`, `freeze` | `par`/`paralyzed`, `brn`/`burned`, `psn`/`poisoned`, `tox`/`badly poisoned`, `slp`/`asleep`, `frz`/`frozen`; `none` or empty for healthy |
| `targetType`, `*TeraType` | The 18 types (`Normal` … `Fairy`) | Any capitalisation, e.g. `fire`, `FIRE` |

Stat stages are integers from −6 to 6, HP fractions are in (0, 1], `limit` is 1–10, and `moveOptions.hitCount` is 1–10.

### Champions legality

`compare_speed`, `calculate_damage`, and `check_survival` always return `legal` and `warnings`. When a Pokémon or move is not legal in Pokémon Champions (per the Pokémon Showdown Champions mod, e.g. Mewtwo or Psystrike), the calculation still runs as a hypothetical, but `legal` is `false` and `warnings` names each non-legal entry. The lookup tools report legality in `champions.legal`.

Pokémon Champions doubles is the default format. Results are deterministic and the public MVP is unauthenticated and read-only. Operators should apply Cloudflare rate limiting (and add authentication before exposing it to untrusted high-volume traffic) because catalog and calculation requests are publicly reachable.

## Data labels

- Pokémon Showdown — mechanics/catalog seed, including the Champions mod legality and balance overlay.
- Limitless — Champions tournament usage.
- Smogon ladder stats — Champions SP spreads.
- NCP (Nimbasa City Post) — curated Champions sets.
- PokeAPI — Traditional Chinese aliases only.

The Worker reads the generated `../public/mcp-catalogs/pokemon.json`, `moves.json`, `abilities.json`, and `items.json` through the Cloudflare `ASSETS` binding and caches parsed catalogs per Worker isolate. These are minified copies of the full `public/*.json` catalogs that keep every entry (so non-Champions-legal lookups still work) but drop fields the Worker never reads, cutting about 6.0 MB to 1.0 MB and the cold JSON parse by roughly 4x. Regenerate them with `npm run build-web-catalogs` from the repository root after any data sync. No user model token is required by PokéCal, and agent callers' AI-provider tokens are never sent to this service.

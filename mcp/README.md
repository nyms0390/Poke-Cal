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
npx wrangler deploy        # explicit production deployment
```

The production command is intentionally explicit. This repository does not include an account ID, zone ID, custom domain, or a deployment token. The Worker serves the MCP endpoint at `https://<worker-subdomain>.workers.dev/mcp` after deployment; configure that URL in an MCP-capable agent.

## Tools

Exactly five read-only tools are registered:

- `lookup_pokemon({query, limit})` — matching species with IDs, names, types, base stats, abilities, and concise Champions availability/usage.
- `lookup_move({query, limit})` — matching moves with type, category, power, accuracy, priority, target, description, and Champions legality.
- `compare_speed(...)` — resolved final Speed and acting order with spreads, modifiers, weather/terrain, and Trick Room.
- `calculate_damage(...)` — deterministic damage range/distribution, percentages, HP, type effectiveness, KO summary, notes, and assumptions.
- `check_survival(...)` — the damage result plus survival verdict and remaining-HP range.

Pokémon Champions doubles is the default format. Results are deterministic and the public MVP is unauthenticated and read-only. Operators should apply Cloudflare rate limiting (and add authentication before exposing it to untrusted high-volume traffic) because catalog and calculation requests are publicly reachable.

## Data labels

- Pokémon Showdown — mechanics/catalog seed, including the Champions mod legality and balance overlay.
- Limitless — Champions tournament usage.
- Smogon ladder stats — Champions SP spreads.
- NCP (Nimbasa City Post) — curated Champions sets.
- PokeAPI — Traditional Chinese aliases only.

The Worker reads the generated `../public/pokemon.json`, `moves.json`, `abilities.json`, and `items.json` through the Cloudflare `ASSETS` binding and caches parsed catalogs per Worker isolate. No user model token is required by PokéCal, and agent callers' AI-provider tokens are never sent to this service.

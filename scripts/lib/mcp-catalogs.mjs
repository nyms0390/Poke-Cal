// Pure derivation of the MCP Worker catalogs in public/mcp-catalogs/*.json from the full
// generated catalogs in public/*.json. Unlike the browser catalogs (public/web/), these keep
// every entry, including entries that are not Champions-legal, because the MCP tools look them
// up and report `legal: false`. They only drop fields that nothing the Worker runs reads:
// mcp/src/*.js, src/data/strategy-tools.js, and everything it imports (catalog.js,
// usage-defaults.js, src/engine/*). mcp/test/mcp-catalogs.test.js checks that tool outputs
// match the full catalogs and that the committed files equal this derivation.
import { stripGenerationHistory } from "../../src/data/web-catalogs.js";
import { topUsageEntry } from "../../src/data/usage-defaults.js";

export const MCP_CATALOG_NAMES = Object.freeze(["pokemon", "moves", "abilities", "items"]);
export const MCP_CATALOG_DIRECTORY = "mcp-catalogs";

// Catalog metadata no Worker code reads (Showdown numbering, contest/Z/Max data, sprites).
const UNUSED_METADATA_KEYS = ["num", "contestType", "isNonstandard", "zMove", "maxMove", "spritenum", "rating"];
// The Worker reads Champions legality, tier, and aggregate usage (for search ranking and the
// lookup summaries); source labels/URLs, NCP sets, spread metadata, and overlay descriptions
// are browser-only.
const CHAMPIONS_KEYS = ["legal", "tier", "usageCount", "usagePercent"];
// Per-Pokémon usage feeds championsDefaultsForPokemon, which only uses the top ability, item,
// nature, and spread (topUsageEntry). Default moves and Speed profiles are not used by the
// strategy tools.
const POKEMON_USAGE_KEYS = ["abilities", "items", "natures", "spreads"];

export function deriveMcpCatalogs({ pokemon, moves, abilities, items }) {
  return {
    pokemon: pokemon.map(slimPokemon),
    moves: moves.map(slimMove),
    abilities: abilities.map((entry) => slimNamedEntry(entry)),
    items: items.map((entry) => slimNamedEntry(entry)),
  };
}

export function serializeMcpCatalog(value) {
  return `${JSON.stringify(value)}\n`;
}

// Learnsets (`moves`) are only used for default moves, which the strategy tools discard.
function slimPokemon(entry) {
  const { moves: _learnset, champions, ...rest } = entry;
  const result = withoutKeys(rest, UNUSED_METADATA_KEYS);
  if (champions !== undefined) result.champions = slimChampions(champions, { usage: true });
  return result;
}

// lookup_move returns and searches `shortDesc ?? desc`, so the long `desc` is only kept when
// there is no short description.
function slimMove(entry) {
  const { champions, ...rest } = stripGenerationHistory(entry);
  const dropped = rest.shortDesc === undefined || rest.shortDesc === null
    ? UNUSED_METADATA_KEYS
    : [...UNUSED_METADATA_KEYS, "desc"];
  const result = withoutKeys(rest, dropped);
  if (champions !== undefined) result.champions = slimChampions(champions);
  return result;
}

// Abilities and items are resolved by id/name and read for engine data and usage ranking; no
// tool searches or returns their descriptions or aliases.
function slimNamedEntry(entry) {
  const { champions, ...rest } = stripGenerationHistory(entry);
  const result = withoutKeys(rest, [...UNUSED_METADATA_KEYS, "desc", "shortDesc", "aliases"]);
  if (champions !== undefined) result.champions = slimChampions(champions);
  return result;
}

function slimChampions(champions, { usage = false } = {}) {
  if (!champions || typeof champions !== "object") return champions;
  const result = Object.fromEntries(
    CHAMPIONS_KEYS.filter((key) => key in champions).map((key) => [key, champions[key]]),
  );
  if (usage && champions.usage) {
    result.usage = Object.fromEntries(POKEMON_USAGE_KEYS
      .map((key) => [key, topUsageEntry(champions.usage[key] ?? [])])
      .filter(([, top]) => top)
      .map(([key, top]) => [key, [top]]));
  }
  return result;
}

function withoutKeys(entry, keys) {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !keys.includes(key)));
}

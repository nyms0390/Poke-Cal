// Pure derivation of the MCP Worker catalogs in public/mcp-catalogs/*.json from the full
// generated catalogs in public/*.json. Unlike the browser catalogs (public/web/), these keep
// every entry, including entries that are not Champions-legal, because the MCP tools look them
// up and report `legal: false`. They only drop fields that nothing the Worker runs reads:
// mcp/src/*.js, src/data/strategy-tools.js, and everything it imports (catalog.js,
// usage-defaults.js, src/engine/*). mcp/test/mcp-catalogs.test.js checks that tool outputs
// match the full catalogs and that the committed files equal this derivation.
import { speedProfilesInUse } from "../../src/data/speed-line.js";
import { USAGE_LIST_KEYS, topUsageList } from "../../src/data/strategy-analysis.js";
import { stripGenerationHistory } from "../../src/data/web-catalogs.js";

export const MCP_CATALOG_NAMES = Object.freeze(["pokemon", "moves", "abilities", "items"]);
export const MCP_CATALOG_DIRECTORY = "mcp-catalogs";

// Catalog metadata no Worker code reads (Showdown numbering, contest/Z/Max data, sprites).
const UNUSED_METADATA_KEYS = ["num", "contestType", "isNonstandard", "zMove", "maxMove", "spritenum", "rating"];
// The Worker reads Champions legality, tier, and aggregate usage (for search ranking and the
// lookup summaries), and get_sets/speed_tiers read per-Pokémon usage and NCP sets; source
// labels/URLs, spread and NCP metadata, and overlay descriptions are browser-only.
const CHAMPIONS_KEYS = ["legal", "tier", "usageCount", "usagePercent"];
// Per-Pokémon usage lists keep the entries get_sets returns (topUsageList); defaults only read
// the top one. Smogon spreads stay whole because speed_tiers matches them by nature, and Speed
// profiles keep only those speed_tiers can show (speedProfilesInUse).
const CAPPED_USAGE_KEYS = USAGE_LIST_KEYS.filter((key) => key !== "spreads");
const USAGE_ENTRY_KEYS = ["id", "name", "usagePercent"];

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
  if (usage && champions.usage) result.usage = slimUsage(champions);
  if (usage && champions.ncp?.sets?.length) result.ncp = { sets: champions.ncp.sets };
  return result;
}

function slimUsage(champions) {
  const usage = champions.usage;
  const result = {};
  for (const key of CAPPED_USAGE_KEYS) {
    if (!usage[key]?.length) continue;
    result[key] = topUsageList(usage[key]).map((entry) => Object.fromEntries(
      USAGE_ENTRY_KEYS.filter((field) => field in entry).map((field) => [field, entry[field]]),
    ));
  }
  if (usage.spreads?.length) result.spreads = usage.spreads.map(({ name, usagePercent }) => ({ name, usagePercent }));
  const profiles = speedProfilesInUse({ champions });
  if (profiles.length) result.speedProfiles = profiles;
  return result;
}

function withoutKeys(entry, keys) {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => !keys.includes(key)));
}

import { normalizeId } from "./catalog.js";
import { NATURES } from "./damage.js";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const EMPTY_SPREAD = {
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
};

export function parseUsageSpread(name) {
  const match = /^([^:]+):(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)$/.exec(
    String(name ?? "").trim(),
  );
  if (!match) return null;

  const nature = match[1];
  const values = match.slice(2).map(Number);
  if (!(nature in NATURES) || values.some((value) => value < 0 || value > 32)) return null;

  return {
    nature,
    sp: Object.fromEntries(STAT_KEYS.map((stat, index) => [stat, values[index]])),
  };
}

export function usageDefaultsForPokemon(entry, usage, { abilityLookup, itemLookup, moveLookup } = {}) {
  const spread = parseUsageSpread(topUsageEntry(usage?.spreads)?.name) ?? EMPTY_SPREAD;
  const ability = resolveUsageEntry(topUsageEntry(usage?.abilities), abilityLookup);
  const item = resolveUsageEntry(topUsageEntry(usage?.items), itemLookup);
  const topMoves = (usage?.moves ?? []).slice(0, 4).map((move) => resolveUsageEntry(move, moveLookup));

  return {
    pokemon: entry,
    spreadName: topUsageEntry(usage?.spreads)?.name ?? "",
    nature: spread.nature,
    sp: { ...spread.sp },
    ability,
    item,
    moves: topMoves.length > 0 ? topMoves : (entry?.moves ?? []).map((id) => ({ id, name: id })),
  };
}

export function topUsageEntry(entries = []) {
  return [...entries].sort((a, b) => {
    const aUsage = Number.isFinite(a.usagePercent) ? a.usagePercent : -1;
    const bUsage = Number.isFinite(b.usagePercent) ? b.usagePercent : -1;
    return bUsage - aUsage || String(a.name).localeCompare(String(b.name));
  })[0] ?? null;
}

function resolveUsageEntry(entry, lookup) {
  if (!entry) return null;
  const resolved = lookup?.get(normalizeId(entry.id)) ?? lookup?.get(normalizeId(entry.name));
  return {
    ...(resolved ?? { id: normalizeId(entry.id ?? entry.name), name: entry.name ?? entry.id }),
    usagePercent: entry.usagePercent,
  };
}

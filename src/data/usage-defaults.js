import {
  championsUsageCount,
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
  sortByChampionsUsage,
} from "./catalog.js";
import { NATURES } from "../engine/damage.js";

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
  const nature = topUsageEntry(usage?.natures)?.name;
  const ability = resolveUsageEntry(topUsageEntry(usage?.abilities), abilityLookup);
  const item = resolveUsageEntry(topUsageEntry(usage?.items), itemLookup);
  const teraType = topUsageEntry(usage?.teras)?.name ?? "";
  const topMoves = (usage?.moves ?? []).slice(0, 4).map((move) => resolveUsageEntry(move, moveLookup));

  return {
    pokemon: entry,
    spreadName: topUsageEntry(usage?.spreads)?.name ?? "",
    nature: nature && nature in NATURES ? nature : spread.nature,
    sp: { ...spread.sp },
    ability,
    item,
    teraType,
    moves: topMoves.length > 0 ? topMoves : (entry?.moves ?? []).map((id) => ({ id, name: id })),
  };
}

export function championsDefaultsForPokemon(
  entry,
  { abilityLookup, moveLookup, items = [] } = {},
) {
  if (entry?.champions?.usage) {
    return usageDefaultsForPokemon(entry, entry.champions.usage, {
      abilityLookup,
      itemLookup: itemLookupFromEntries(items),
      moveLookup,
    });
  }

  const abilities = sortByChampionsUsage(resolvePokemonAbilities(entry, abilityLookup));
  const sortedItems = sortByChampionsUsage(items).filter((item) => championsUsageCount(item) >= 0);
  const moves = sortByChampionsUsage(resolveChampionsPokemonMoves(entry, moveLookup));

  return {
    pokemon: entry,
    spreadName: "",
    nature: EMPTY_SPREAD.nature,
    sp: { ...EMPTY_SPREAD.sp },
    ability: abilities[0] ?? null,
    item: sortedItems[0] ?? null,
    moves: moves.length > 0 ? moves : (entry?.moves ?? []).map((id) => ({ id, name: id })),
  };
}

function itemLookupFromEntries(items) {
  const lookup = new Map();
  for (const item of items) {
    lookup.set(normalizeId(item.id), item);
    lookup.set(normalizeId(item.name), item);
  }
  return lookup;
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

import { normalizeId } from "./catalog.js";

export const LIMITLESS_TOURNAMENTS_URL = "https://play.limitlesstcg.com/tournaments";
export const LIMITLESS_API_BASE_URL = "https://play.limitlesstcg.com/api";

export function buildLimitlessUsage(tournaments, standingsByTournament) {
  const tournamentEntries = tournaments.filter(Boolean);
  const counters = {
    pokemon: new Map(),
    abilities: new Map(),
    items: new Map(),
    moves: new Map(),
  };
  let teamCount = 0;

  for (const tournament of tournamentEntries) {
    const standings = standingsByTournament.get(tournament.id) ?? [];
    for (const standing of standings) {
      if (!Array.isArray(standing.decklist) || standing.decklist.length === 0) continue;
      teamCount += 1;
      for (const set of standing.decklist) {
        countPokemonSet(counters, set);
      }
    }
  }

  return {
    source: "Limitless",
    sourceUrl: LIMITLESS_TOURNAMENTS_URL,
    tournamentCount: tournamentEntries.length,
    teamCount,
    pokemon: usageEntries(counters.pokemon, teamCount, pokemonUsageEntry),
    abilities: usageEntries(counters.abilities, totalCount(counters.abilities), simpleUsageEntry),
    items: usageEntries(counters.items, totalCount(counters.items), simpleUsageEntry),
    moves: usageEntries(counters.moves, totalCount(counters.moves), simpleUsageEntry),
  };
}

export function mergeLimitlessUsage(data, usage) {
  return {
    ...data,
    pokemon: mergeUsageEntries(data.pokemon, usage.pokemon, mergePokemonUsage),
    abilities: mergeUsageEntries(data.abilities, usage.abilities, mergeCatalogUsage),
    moves: mergeUsageEntries(data.moves, usage.moves, mergeCatalogUsage),
    items: mergeUsageEntries(data.items, usage.items, mergeCatalogUsage),
  };
}

function countPokemonSet(counters, set) {
  const pokemonId = normalizePokemonSetId(set);
  if (!pokemonId) return;

  const pokemon = increment(counters.pokemon, pokemonId, set.name ?? set.id);
  pokemon.abilities ??= new Map();
  pokemon.items ??= new Map();
  pokemon.moves ??= new Map();
  pokemon.natures ??= new Map();

  if (set.ability) {
    increment(counters.abilities, normalizeId(set.ability), set.ability);
    increment(pokemon.abilities, normalizeId(set.ability), set.ability);
  }
  if (set.item) {
    increment(counters.items, normalizeId(set.item), set.item);
    increment(pokemon.items, normalizeId(set.item), set.item);
  }
  for (const attack of set.attacks ?? []) {
    if (!attack) continue;
    increment(counters.moves, normalizeId(attack), attack);
    increment(pokemon.moves, normalizeId(attack), attack);
  }
  if (set.nature) increment(pokemon.natures, normalizeId(set.nature), set.nature);
}

function normalizePokemonSetId(set) {
  return normalizeId(set.id || set.name);
}

function increment(map, id, name) {
  const entry = map.get(id) ?? { id, name: name ?? id, count: 0 };
  entry.count += 1;
  if (!entry.name && name) entry.name = name;
  map.set(id, entry);
  return entry;
}

function usageEntries(map, denominator, mapEntry) {
  return [...map.values()]
    .map((entry) => mapEntry(entry, denominator))
    .sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
}

function simpleUsageEntry(entry, denominator) {
  return {
    id: entry.id,
    name: entry.name,
    usageCount: entry.count,
    usagePercent: usagePercent(entry.count, denominator),
  };
}

function pokemonUsageEntry(entry, denominator) {
  return {
    ...simpleUsageEntry(entry, denominator),
    usage: {
      abilities: usageEntries(entry.abilities ?? new Map(), entry.count, simpleUsageEntry),
      items: usageEntries(entry.items ?? new Map(), entry.count, simpleUsageEntry),
      moves: usageEntries(entry.moves ?? new Map(), entry.count, simpleUsageEntry),
      natures: usageEntries(entry.natures ?? new Map(), entry.count, simpleUsageEntry),
    },
  };
}

function usagePercent(count, denominator) {
  return denominator > 0 ? (count / denominator) * 100 : 0;
}

function totalCount(map) {
  return [...map.values()].reduce((sum, entry) => sum + entry.count, 0);
}

function mergeUsageEntries(entries, usageEntries, mergeEntry) {
  const usageById = usageLookup(usageEntries);
  const usedIds = new Set();
  const merged = entries.map((entry) => {
    const usage = usageById.get(normalizeId(entry.id)) ?? usageById.get(normalizeId(entry.name));
    if (!usage) return clearUsage(entry);
    usedIds.add(usage.id);
    return mergeEntry(entry, usage);
  });

  for (const usage of usageEntries) {
    if (usedIds.has(usage.id)) continue;
    merged.push(mergeEntry({ id: usage.id, name: usage.name }, usage));
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

function usageLookup(entries) {
  const lookup = new Map();
  for (const entry of entries) {
    lookup.set(normalizeId(entry.id), entry);
    lookup.set(normalizeId(entry.name), entry);
  }
  return lookup;
}

function clearUsage(entry) {
  if (!entry.champions) return entry;
  return {
    ...entry,
    champions: clearUsageMetadata(entry.champions),
  };
}

function mergeCatalogUsage(entry, usage) {
  return {
    ...entry,
    champions: limitlessMetadata(entry.champions, usage),
  };
}

function mergePokemonUsage(entry, usage) {
  return {
    ...entry,
    champions: {
      ...limitlessMetadata(entry.champions, usage),
      usage: usage.usage,
    },
  };
}

function limitlessMetadata(champions, usage) {
  return {
    ...clearUsageMetadata(champions),
    source: "Limitless",
    sourceUrl: LIMITLESS_TOURNAMENTS_URL,
    usageCount: usage.usageCount,
    usagePercent: usage.usagePercent,
  };
}

function clearUsageMetadata(champions) {
  if (!champions) return {};
  const metadata = { ...champions };
  const isLimitless = metadata.source === "Limitless";
  if (!isLimitless) {
    delete metadata.source;
    delete metadata.sourceUrl;
  }
  delete metadata.catalogSource;
  delete metadata.catalogSourceUrl;
  delete metadata.icon;
  delete metadata.learnableMoveCount;
  delete metadata.rank;
  delete metadata.usage;
  delete metadata.usageCount;
  delete metadata.usagePercent;
  return metadata;
}

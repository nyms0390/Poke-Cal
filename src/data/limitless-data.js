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
  const catalogs = {
    pokemon: canonicalCatalogEntries(data.pokemon),
    abilities: canonicalCatalogEntries(data.abilities),
    moves: canonicalCatalogEntries(data.moves),
    items: canonicalCatalogEntries(data.items),
  };
  const usageCatalogs = {
    pokemon: usageCatalogEntries(catalogs.pokemon),
    abilities: usageCatalogEntries(catalogs.abilities),
    moves: usageCatalogEntries(catalogs.moves),
    items: usageCatalogEntries(catalogs.items),
  };
  const normalizedUsage = normalizeUsage(usage, usageCatalogs);

  return {
    ...data,
    pokemon: mergeUsageEntries(catalogs.pokemon, normalizedUsage.pokemon, mergePokemonUsage),
    abilities: mergeUsageEntries(catalogs.abilities, normalizedUsage.abilities, mergeCatalogUsage),
    moves: mergeUsageEntries(catalogs.moves, normalizedUsage.moves, mergeCatalogUsage),
    items: mergeUsageEntries(catalogs.items, normalizedUsage.items, mergeCatalogUsage),
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
  pokemon.teras ??= new Map();

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
  if (set.tera) increment(pokemon.teras, normalizeId(set.tera), set.tera);
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
      teras: usageEntries(entry.teras ?? new Map(), entry.count, simpleUsageEntry),
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
  const merged = entries.map((entry) => {
    const usage = usageById.get(normalizeId(entry.id)) ?? usageById.get(normalizeId(entry.name));
    if (!usage) return clearUsage(entry);
    return mergeEntry(entry, usage);
  });

  return merged.sort((a, b) => a.name.localeCompare(b.name));
}

function canonicalCatalogEntries(entries) {
  return entries.filter(
    (entry) => !(entry.champions?.source === "Limitless" && typeof entry.champions.legal !== "boolean"),
  );
}

function usageCatalogEntries(entries) {
  const hasLegality = entries.some((entry) => typeof entry.champions?.legal === "boolean");
  return hasLegality ? entries.filter((entry) => entry.champions.legal === true) : entries;
}

function normalizeUsage(usage, catalogs) {
  return {
    pokemon: normalizePokemonUsage(usage.pokemon, catalogs),
    abilities: normalizeCatalogUsage(usage.abilities, catalogs.abilities),
    moves: normalizeCatalogUsage(usage.moves, catalogs.moves),
    items: normalizeCatalogUsage(usage.items, catalogs.items),
  };
}

function normalizePokemonUsage(entries, catalogs) {
  return normalizeCatalogUsage(entries, catalogs.pokemon).map((entry) => ({
    ...entry,
    usage: {
      ...(entry.usage ?? {}),
      abilities: normalizeCatalogUsage(entry.usage?.abilities, catalogs.abilities),
      items: normalizeCatalogUsage(entry.usage?.items, catalogs.items),
      moves: normalizeCatalogUsage(entry.usage?.moves, catalogs.moves),
    },
  }));
}

function normalizeCatalogUsage(entries = [], catalog) {
  const lookup = usageLookup(catalog);
  return entries.flatMap((entry) => {
    const canonical = lookup.get(normalizeId(entry.id)) ?? lookup.get(normalizeId(entry.name));
    return canonical ? [{ ...entry, id: canonical.id, name: canonical.name }] : [];
  });
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
  const champions = clearUsageMetadata(entry.champions);
  const spreads = entry.champions.usage?.spreads;
  if (spreads) champions.usage = { spreads };
  return {
    ...entry,
    champions,
  };
}

function mergeCatalogUsage(entry, usage) {
  return {
    ...entry,
    champions: limitlessMetadata(entry.champions, usage),
  };
}

function mergePokemonUsage(entry, usage) {
  const spreads = entry.champions?.usage?.spreads;
  return {
    ...entry,
    champions: {
      ...limitlessMetadata(entry.champions, usage),
      usage: spreads ? { ...usage.usage, spreads } : usage.usage,
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

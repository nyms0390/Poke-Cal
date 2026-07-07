import { normalizeId } from "./catalog.js";
import { parseUsageSpread } from "./usage-defaults.js";

export const SMOGON_STATS_URL = "https://www.smogon.com/stats/";
export const SMOGON_CHAMPIONS_FORMAT_PATTERN = /gen9champions(vgc\d+reg[a-z]+?)(bo3)?/;

export function latestStatsMonth(indexHtml) {
  const months = [...String(indexHtml ?? "").matchAll(/href="(\d{4}-\d{2})\/"/g)].map(
    (match) => match[1],
  );
  return months.sort().at(-1) ?? null;
}

export function discoverChampionsFormats(chaosIndexHtml, { cutoff }) {
  const pattern = new RegExp(
    `href="(gen9champions(vgc\\d+reg[a-z]+?)(bo3)?)-${cutoff}\\.json"`,
    "g",
  );
  const formatsByRegulation = new Map();

  for (const match of String(chaosIndexHtml ?? "").matchAll(pattern)) {
    const [, format, regulation] = match;
    const formats = formatsByRegulation.get(regulation) ?? new Set();
    formats.add(format);
    formatsByRegulation.set(regulation, formats);
  }

  const latestRegulation = [...formatsByRegulation.keys()].sort().at(-1);
  return latestRegulation ? [...formatsByRegulation.get(latestRegulation)].sort() : [];
}

export function chaosUrl({ month, format, cutoff }) {
  return `${SMOGON_STATS_URL}${month}/chaos/${format}-${cutoff}.json`;
}

export function buildSmogonSpreads(chaosDataList, { top = 6, month } = {}) {
  const sources = chaosDataList.filter((chaos) => chaos?.data && typeof chaos.data === "object");
  const spreadsByPokemon = new Map();
  let battleCount = 0;

  for (const chaos of sources) {
    battleCount += Number(chaos.info?.["number of battles"]) || 0;
    for (const [name, monData] of Object.entries(chaos.data)) {
      const spreads = monData?.Spreads;
      if (!spreads || typeof spreads !== "object") continue;

      const entry = spreadsByPokemon.get(normalizeId(name)) ?? {
        id: normalizeId(name),
        name,
        weights: new Map(),
      };
      for (const [spreadName, weight] of Object.entries(spreads)) {
        const numericWeight = Number(weight);
        if (!Number.isFinite(numericWeight) || numericWeight <= 0) continue;
        if (!parseUsageSpread(spreadName)) continue;
        entry.weights.set(spreadName, (entry.weights.get(spreadName) ?? 0) + numericWeight);
      }
      if (entry.weights.size > 0) spreadsByPokemon.set(entry.id, entry);
    }
  }

  return {
    source: "Smogon",
    sourceUrl: SMOGON_STATS_URL,
    month,
    formats: sources.map((chaos) => chaos.info?.metagame).filter(Boolean),
    cutoff: sources[0]?.info?.cutoff,
    battleCount,
    pokemon: [...spreadsByPokemon.values()]
      .map((entry) => toSpreadUsageEntry(entry, top))
      .sort((a, b) => b.spreadWeight - a.spreadWeight || a.name.localeCompare(b.name)),
  };
}

export function mergeSmogonSpreads(pokemon, usage) {
  const lookup = new Map();
  for (const entry of usage.pokemon) {
    lookup.set(entry.id, entry);
    lookup.set(normalizeId(entry.name), entry);
  }
  const spreadsMeta = {
    source: usage.source,
    sourceUrl: usage.sourceUrl,
    month: usage.month,
    formats: usage.formats,
    cutoff: usage.cutoff,
  };

  return pokemon.map((entry) => {
    const spreadUsage =
      lookup.get(normalizeId(entry.id)) ?? lookup.get(normalizeId(entry.name));
    if (!spreadUsage) return clearSpreads(entry);

    return {
      ...entry,
      champions: {
        ...entry.champions,
        spreadsMeta,
        usage: { ...entry.champions?.usage, spreads: spreadUsage.spreads },
      },
    };
  });
}

function toSpreadUsageEntry(entry, top) {
  const totalWeight = [...entry.weights.values()].reduce((sum, weight) => sum + weight, 0);
  const spreads = [...entry.weights.entries()]
    .sort(([aName, aWeight], [bName, bWeight]) => bWeight - aWeight || aName.localeCompare(bName))
    .slice(0, top)
    .map(([name, weight]) => ({
      name,
      usageCount: round(weight, 1),
      usagePercent: round(totalWeight > 0 ? (weight / totalWeight) * 100 : 0, 2),
    }));

  return { id: entry.id, name: entry.name, spreadWeight: round(totalWeight, 1), spreads };
}

function clearSpreads(entry) {
  if (!entry.champions?.spreadsMeta && !entry.champions?.usage?.spreads) return entry;

  const champions = { ...entry.champions };
  delete champions.spreadsMeta;
  if (champions.usage?.spreads) {
    champions.usage = { ...champions.usage };
    delete champions.usage.spreads;
    if (Object.keys(champions.usage).length === 0) delete champions.usage;
  }
  return { ...entry, champions };
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

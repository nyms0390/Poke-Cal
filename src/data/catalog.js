import { normalizeId } from "../identifiers.js";

export { normalizeId };

function normalizeSearchValue(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]/g, "");
}

export function buildAbilityLookup(abilities) {
  const lookup = new Map();
  for (const ability of abilities) {
    addLookupKeys(lookup, ability, [ability.id, ability.name]);
  }
  return lookup;
}

export function buildMoveLookup(moves) {
  const lookup = new Map();
  for (const move of moves) {
    addLookupKeys(lookup, move, [move.id]);
  }
  return lookup;
}

export function buildItemLookup(items) {
  const lookup = new Map();
  for (const item of items) {
    addLookupKeys(lookup, item, [item.id, item.name]);
  }
  return lookup;
}

function addLookupKeys(lookup, entry, values) {
  for (const value of values) {
    const key = normalizeId(value);
    if (key) lookup.set(key, entry);
  }
}

export function resolvePokemonAbilities(entry, lookup) {
  return (entry?.abilities ?? []).map((name) => {
    const ability = lookup.get(normalizeId(name));
    return ability ?? { id: normalizeId(name), name };
  });
}

export function resolvePokemonMoves(entry, lookup) {
  return (entry?.moves ?? []).map((id) => {
    const move = lookup.get(normalizeId(id));
    return move ?? { id: normalizeId(id), name: id };
  });
}

export function resolveChampionsPokemonMoves(entry, lookup) {
  const moves = resolvePokemonMoves(entry, lookup);
  const championsMoves = moves.filter((move) => move.champions?.legal === true);
  return championsMoves.length > 0 ? championsMoves : moves;
}

export function resolvePokemonItems(usage, lookup) {
  return (usage?.items ?? []).map((usageItem) => {
    const item = lookup.get(normalizeId(usageItem.id)) ?? lookup.get(normalizeId(usageItem.name));
    return {
      ...(item ?? { id: normalizeId(usageItem.id), name: usageItem.name }),
      usagePercent: usageItem.usagePercent,
    };
  });
}

export function championsUsageCount(entry) {
  const count = entry?.champions?.usageCount;
  return Number.isFinite(count) ? count : -1;
}

export function sortByChampionsUsage(entries) {
  return [...entries].sort((a, b) => {
    const usageDifference = championsUsageCount(b) - championsUsageCount(a);
    return usageDifference || a.name.localeCompare(b.name);
  });
}

export function applyScopedUsage(entries, usageEntries = []) {
  if (!usageEntries.length) return entries;
  const usageById = new Map();
  for (const usage of usageEntries) {
    usageById.set(normalizeId(usage.id), usage);
    usageById.set(normalizeId(usage.name), usage);
  }

  return entries.map((entry) => {
    const usage = usageById.get(normalizeId(entry.id)) ?? usageById.get(normalizeId(entry.name));
    if (usage) {
      return {
        ...entry,
        champions: {
          ...(entry.champions ?? {}),
          source: "Limitless",
          usageCount: usage.usageCount,
          usagePercent: usage.usagePercent,
        },
      };
    }

    return clearEntryUsage(entry);
  });
}

function clearEntryUsage(entry) {
  if (!entry.champions) return entry;
  const champions = { ...entry.champions };
  delete champions.usageCount;
  delete champions.usagePercent;
  return { ...entry, champions };
}

export function usageForPokemon(usageStats, entry) {
  if (!usageStats?.pokemon || !entry) return null;
  return (
    usageStats.pokemon[normalizeId(entry.id)] ??
    usageStats.pokemon[normalizeId(entry.baseSpecies)] ??
    null
  );
}

export function filterMoves(moves, { query = "", type = "", category = "", flag = "" } = {}) {
  const normalizedQuery = normalizeSearchValue(query);
  return moves.filter((move) => {
    if (type && move.type !== type) return false;
    if (category && move.category !== category) return false;
    if (flag && !move.flags?.[flag]) return false;
    if (!normalizedQuery) return true;

    return [
      move.id,
      move.name,
      ...(move.aliases ?? []),
      move.type,
      move.category,
      move.shortDesc,
      move.desc,
    ]
      .map(normalizeSearchValue)
      .some((candidate) => candidate.includes(normalizedQuery));
  });
}

const MOVE_SORT_KEYS = new Set(["name", "type", "category", "power", "accuracy", "pp", "effect"]);

export function sortMoves(moves, { key = "", direction = "ascending" } = {}) {
  if (!MOVE_SORT_KEYS.has(key)) return [...moves];

  const directionMultiplier = direction === "descending" ? -1 : 1;
  const numericKey = {
    power: (move) => move.basePower,
    accuracy: (move) => (move.accuracy === true ? undefined : move.accuracy),
    pp: (move) => move.pp,
  }[key];
  const stringKey = {
    name: (move) => move.name,
    type: (move) => move.type,
    category: (move) => move.category,
    effect: moveEffect,
  }[key];

  return moves
    .map((move, index) => ({ move, index }))
    .sort((a, b) => {
      const aValue = numericKey ? numericKey(a.move) : stringKey(a.move);
      const bValue = numericKey ? numericKey(b.move) : stringKey(b.move);
      const aMissing = numericKey
        ? aValue === null || aValue === undefined || !Number.isFinite(Number(aValue))
          || (key === "power" && Number(aValue) === 0)
        : false;
      const bMissing = numericKey
        ? bValue === null || bValue === undefined || !Number.isFinite(Number(bValue))
          || (key === "power" && Number(bValue) === 0)
        : false;
      if (aMissing || bMissing) {
        if (aMissing !== bMissing) return aMissing ? 1 : -1;
        return a.index - b.index;
      }

      const comparison = numericKey
        ? Number(aValue) - Number(bValue)
        : String(aValue ?? "").localeCompare(String(bValue ?? ""));
      return comparison * directionMultiplier || a.index - b.index;
    })
    .map(({ move }) => move);
}

export function formatMovePower(power) {
  return power ? String(power) : "—";
}

export function formatMoveAccuracy(accuracy) {
  return accuracy === true ? "—" : String(accuracy ?? "—");
}

export function formatUsagePercent(usagePercent) {
  return Number.isFinite(usagePercent) ? `${usagePercent.toFixed(1)}%` : "—";
}

export function moveEffect(move) {
  return move.shortDesc || move.desc || "—";
}

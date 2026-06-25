export function normalizeId(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildAbilityLookup(abilities) {
  const lookup = new Map();
  for (const ability of abilities) {
    lookup.set(normalizeId(ability.id), ability);
    lookup.set(normalizeId(ability.name), ability);
  }
  return lookup;
}

export function buildMoveLookup(moves) {
  const lookup = new Map();
  for (const move of moves) {
    lookup.set(normalizeId(move.id), move);
  }
  return lookup;
}

export function buildItemLookup(items) {
  const lookup = new Map();
  for (const item of items) {
    lookup.set(normalizeId(item.id), item);
    lookup.set(normalizeId(item.name), item);
  }
  return lookup;
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

export function resolvePokemonItems(usage, lookup) {
  return (usage?.items ?? []).map((usageItem) => {
    const item = lookup.get(normalizeId(usageItem.id)) ?? lookup.get(normalizeId(usageItem.name));
    return {
      ...(item ?? { id: normalizeId(usageItem.id), name: usageItem.name }),
      usagePercent: usageItem.usagePercent,
    };
  });
}

export function mergeUsage(entries, usageEntries = []) {
  const usageById = new Map(usageEntries.map((entry) => [normalizeId(entry.id), entry]));
  return entries.map((entry) => {
    const usage = usageById.get(normalizeId(entry.id)) ?? usageById.get(normalizeId(entry.name));
    return usage ? { ...entry, usagePercent: usage.usagePercent } : entry;
  });
}

export function sortByUsage(entries) {
  return [...entries].sort((a, b) => {
    const aUsage = Number.isFinite(a.usagePercent) ? a.usagePercent : -1;
    const bUsage = Number.isFinite(b.usagePercent) ? b.usagePercent : -1;
    return bUsage - aUsage || a.name.localeCompare(b.name);
  });
}

export function usageForPokemon(usageStats, entry) {
  if (!usageStats?.pokemon || !entry) return null;
  return (
    usageStats.pokemon[normalizeId(entry.id)] ??
    usageStats.pokemon[normalizeId(entry.baseSpecies)] ??
    null
  );
}

export function filterMoves(moves, { query = "", type = "", category = "" } = {}) {
  const normalizedQuery = normalizeId(query);
  return moves.filter((move) => {
    if (type && move.type !== type) return false;
    if (category && move.category !== category) return false;
    if (!normalizedQuery) return true;

    return [move.id, move.name, move.type, move.category, move.shortDesc, move.desc]
      .map(normalizeId)
      .some((candidate) => candidate.includes(normalizedQuery));
  });
}

export function formatMovePower(power) {
  return power ? String(power) : "—";
}

export function formatMoveAccuracy(accuracy) {
  return accuracy === true ? "—" : String(accuracy ?? "—");
}

export function formatMovePriority(priority) {
  const value = Number(priority ?? 0);
  return value > 0 ? `+${value}` : String(value);
}

export function formatUsagePercent(usagePercent) {
  return Number.isFinite(usagePercent) ? `${usagePercent.toFixed(1)}%` : "—";
}

export function moveEffect(move) {
  return move.shortDesc || move.desc || "—";
}

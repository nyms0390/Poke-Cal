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

export function moveEffect(move) {
  return move.shortDesc || move.desc || "—";
}

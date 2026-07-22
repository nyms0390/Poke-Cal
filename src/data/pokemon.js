import { normalizeId } from "./catalog.js";

export function normalizeSearch(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]/g, "");
}

export function pokemonSpriteId(pokemon) {
  const fallback = normalizeId(pokemon?.id ?? pokemon?.name);
  const baseName = String(pokemon?.baseSpecies ?? "");
  const name = String(pokemon?.name ?? "");
  if (!baseName || !name.toLowerCase().startsWith(`${baseName.toLowerCase()}-`)) return fallback;

  const form = normalizeId(name.slice(baseName.length + 1));
  return form ? `${normalizeId(baseName)}-${form}` : fallback;
}

export function searchPokemon(pokemon, query, options = 12) {
  const { limit, abilityLookup, moveLookup, itemLookup, usageStats } =
    typeof options === "number" ? { limit: options } : { limit: 12, ...options };
  const queryTerms = searchTerms(query);
  if (queryTerms.length === 0) return [];

  return pokemon
    .map((entry) => {
      const matches = queryTerms.map((term) =>
        matchScore(entry, term, {
          abilityLookup,
          moveLookup,
          itemLookup,
          usageStats,
        }),
      );
      const match = matches.every(({ score }) => score < Infinity)
        ? combinedMatch(matches)
        : searchMatch(Infinity);
      return { entry, match };
    })
    .filter(({ match }) => match.score < Infinity)
    .sort(
      (a, b) =>
        a.match.score - b.match.score ||
        b.match.usagePercent - a.match.usagePercent ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, limit)
    .map(({ entry, match }) => ({ ...entry, searchMatch: match.label }));
}

function combinedMatch(matches) {
  const [primaryMatch] = matches;
  const labels = matches.map(({ label }) => label).filter(Boolean);
  const label = labels.length > 1 ? labels.join(" + ") : primaryMatch.label;
  return searchMatch(primaryMatch.score, label, primaryMatch.usagePercent);
}

function searchTerms(query) {
  return String(query ?? "")
    .split("+")
    .map(normalizeSearch)
    .filter(Boolean);
}

export function megaFamily(pokemon, selected) {
  const baseSpecies = selected.baseSpecies;
  const isBaseOrMega =
    selected.name === baseSpecies ||
    (selected.baseSpecies === baseSpecies && selected.name.includes("-Mega"));
  if (!isBaseOrMega) return [selected];

  const family = pokemon.filter(
    (entry) =>
      entry.name === baseSpecies ||
      (entry.baseSpecies === baseSpecies && entry.name.includes("-Mega")),
  );

  if (!family.some((entry) => entry.name.includes("-Mega"))) return [selected];

  return family.sort((a, b) => {
    if (a.name === baseSpecies) return -1;
    if (b.name === baseSpecies) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function megaFamilyId(pokemon) {
  const id = normalizeId(pokemon?.id ?? pokemon?.name);
  const baseSpecies = String(pokemon?.baseSpecies ?? "");
  const name = String(pokemon?.name ?? "");
  const belongsToMegaFamily = baseSpecies &&
    (name === baseSpecies || name.includes("-Mega"));
  return belongsToMegaFamily ? normalizeId(baseSpecies) : id;
}

function matchScore(entry, query, { abilityLookup, moveLookup, itemLookup, usageStats } = {}) {
  const candidates = [entry.name, entry.baseSpecies, ...(entry.aliases ?? [])].map(
    normalizeSearch,
  );

  if (candidates.includes(query)) return searchMatch(0);
  if (candidates.some((candidate) => candidate.startsWith(query))) return searchMatch(1);
  if (candidates.some((candidate) => candidate.includes(query))) return searchMatch(2);

  const typeMatchResult = typeMatch(entry.types, query);
  if (typeMatchResult) return typeMatchResult;

  const usage = usageForEntry(usageStats, entry);
  const usageMatch =
    catalogMatch(usage?.abilities, query, abilityLookup, "Ability", 3) ??
    catalogMatch(usage?.moves, query, moveLookup, "Move", 3) ??
    catalogMatch(usage?.items, query, itemLookup, "Item", 3);
  if (usageMatch) return usageMatch;

  const catalogMatchResult =
    catalogMatch(entry.abilities, query, abilityLookup, "Ability", 6) ??
    catalogMatch(entry.moves, query, moveLookup, "Move", 6);
  if (catalogMatchResult) return catalogMatchResult;

  return searchMatch(Infinity);
}

function typeMatch(types = [], query) {
  let bestMatch = null;

  for (const type of types) {
    const normalizedType = normalizeSearch(type);
    const score =
      normalizedType === query ? 2.5
      : normalizedType.startsWith(query) ? 3.5
      : normalizedType.includes(query) ? 4.5
      : Infinity;

    if (score === Infinity) continue;

    const match = searchMatch(score, `Type: ${type}`);
    if (!bestMatch || match.score < bestMatch.score) bestMatch = match;
  }

  return bestMatch;
}

function catalogMatch(entries = [], query, lookup, label, baseScore) {
  let bestMatch = null;

  for (const entry of entries) {
    const rawId = typeof entry === "string" ? entry : entry.id;
    const rawName = typeof entry === "string" ? entry : entry.name;
    const resolved = lookup?.get(normalizeSearch(rawId)) ?? lookup?.get(normalizeSearch(rawName));
    const displayName = resolved?.name ?? rawName ?? rawId;
    const candidates = [rawId, rawName, displayName, ...(resolved?.aliases ?? [])].map(
      normalizeSearch,
    );
    const score =
      candidates.includes(query) ? baseScore
      : candidates.some((candidate) => candidate.startsWith(query)) ? baseScore + 1
      : candidates.some((candidate) => candidate.includes(query)) ? baseScore + 2
      : Infinity;

    if (score === Infinity) continue;

    const usagePercent =
      typeof entry === "string" || !Number.isFinite(entry.usagePercent) ? -1 : entry.usagePercent;
    const match = searchMatch(score, `${label}: ${displayName}`, usagePercent);
    if (
      !bestMatch ||
      match.score < bestMatch.score ||
      (match.score === bestMatch.score && match.usagePercent > bestMatch.usagePercent)
    ) {
      bestMatch = match;
    }
  }

  return bestMatch;
}

function usageForEntry(usageStats, entry) {
  const usage =
    usageStats?.pokemon?.[normalizeSearch(entry.id)] ??
    usageStats?.pokemon?.[normalizeSearch(entry.baseSpecies)] ??
    null;
  return usage ?? entry.champions?.usage ?? null;
}

function searchMatch(score, label = "", usagePercent = -1) {
  return { score, label, usagePercent };
}

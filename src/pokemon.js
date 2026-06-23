export function normalizeSearch(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\u3400-\u9fff]/g, "");
}

export function searchPokemon(pokemon, query, limit = 12) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return [];

  return pokemon
    .map((entry) => ({
      entry,
      score: matchScore(entry, normalizedQuery),
    }))
    .filter(({ score }) => score < Infinity)
    .sort((a, b) => a.score - b.score || a.entry.name.localeCompare(b.entry.name))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

export function megaFamily(pokemon, selected) {
  const baseSpecies = selected.baseSpecies;
  const isBaseOrMega =
    selected.name === baseSpecies || selected.name.startsWith(`${baseSpecies}-Mega`);
  if (!isBaseOrMega) return [selected];

  const family = pokemon.filter(
    (entry) =>
      entry.name === baseSpecies || entry.name.startsWith(`${baseSpecies}-Mega`),
  );

  if (!family.some((entry) => entry.name.includes("-Mega"))) return [selected];

  return family.sort((a, b) => {
    if (a.name === baseSpecies) return -1;
    if (b.name === baseSpecies) return 1;
    return a.name.localeCompare(b.name);
  });
}

function matchScore(entry, query) {
  const candidates = [entry.name, entry.baseSpecies, ...(entry.aliases ?? [])].map(
    normalizeSearch,
  );

  if (candidates.includes(query)) return 0;
  if (candidates.some((candidate) => candidate.startsWith(query))) return 1;
  if (candidates.some((candidate) => candidate.includes(query))) return 2;
  return Infinity;
}

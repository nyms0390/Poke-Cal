import { searchPokemon } from "../data/pokemon.js";

export const DEFAULT_BROWSE_LIMIT = 20;

// Keep the current selection visible beside the most-used Champions Pokémon.
export function lookupBrowseEntries(pokemon, selected, query, searchOptions = {}) {
  if (String(query ?? "").trim()) {
    return searchPokemon(pokemon, query, { ...searchOptions, limit: pokemon.length });
  }
  const popular = [...pokemon].sort((a, b) =>
    (b.champions?.usageCount ?? 0) - (a.champions?.usageCount ?? 0) ||
    a.name.localeCompare(b.name),
  );
  return [
    ...(selected ? [selected] : []),
    ...popular.filter(({ id }) => id !== selected?.id),
  ].slice(0, DEFAULT_BROWSE_LIMIT);
}

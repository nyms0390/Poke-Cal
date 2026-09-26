import { searchPokemon } from "../data/pokemon.js";

// Keep the current selection visible while browsing the full, real catalog.
export function lookupBrowseEntries(pokemon, selected, query, searchOptions = {}) {
  if (String(query ?? "").trim()) {
    return searchPokemon(pokemon, query, { ...searchOptions, limit: pokemon.length });
  }
  if (!selected) return pokemon;
  return [selected, ...pokemon.filter(({ id }) => id !== selected.id)];
}

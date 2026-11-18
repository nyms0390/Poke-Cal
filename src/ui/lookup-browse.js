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

// A pick keeps the search, so the result list stays put for comparing neighbours (restored
// after the 2026-09-26 browse rail dropped it). The query is cleared only when the new
// selection would not appear in its own results, such as a teammate or form opened from the
// details panel, so the list never hides what is selected.
export function lookupQueryAfterSelect(pokemon, selected, query, searchOptions = {}) {
  const text = String(query ?? "");
  if (!text.trim() || !selected) return "";
  const matches = lookupBrowseEntries(pokemon, selected, text, searchOptions);
  return matches.some(({ id }) => id === selected.id) ? text : "";
}

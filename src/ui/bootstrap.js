import { applyScopedUsage, sortByChampionsUsage } from "../data/catalog.js";
import { loadPokemonData } from "../data/data.js";
import { t } from "../i18n.js";

// Shared catalog-loading boilerplate for both page controllers: fetch the Pokémon/ability/
// move/item catalogs, report a status line, and surface the "run the sync script" error copy
// on failure. `onStatus` receives the status text; `onLoaded` (optional) receives the loaded
// data on success, before `loadCatalogs` resolves.
export async function loadCatalogs({ onStatus, onLoaded } = {}) {
  try {
    const data = await loadPokemonData();
    onStatus?.(catalogLoadedStatus(data));
    onLoaded?.(data);
    return data;
  } catch (error) {
    onStatus?.(t("catalog.missing"));
    console.error(error);
    return null;
  }
}

export function catalogLoadedStatus(data) {
  return t("catalog.loaded", {
    pokemon: data.pokemon.length,
    abilities: data.abilities.length,
    moves: data.moves.length,
  });
}

// Shared "rank a catalog list by Champions usage" composition, repeated for abilities, items,
// and moves on both pages.
export function rankByUsage(entries, scope) {
  return sortByChampionsUsage(applyScopedUsage(entries, scope));
}

import { applyScopedUsage, sortByChampionsUsage } from "../catalog.js";
import { loadPokemonData } from "../data.js";

// Shared catalog-loading boilerplate for both page controllers: fetch the Pokémon/ability/
// move/item catalogs, report a status line, and surface the "run the sync script" error copy
// on failure. `onStatus` receives the status text; `onLoaded` (optional) receives the loaded
// data on success, before `loadCatalogs` resolves.
export async function loadCatalogs({ onStatus, onLoaded } = {}) {
  try {
    const data = await loadPokemonData();
    onStatus?.(
      `${data.pokemon.length} Pokémon/forms, ${data.abilities.length} abilities, ` +
        `${data.moves.length} moves loaded`,
    );
    onLoaded?.(data);
    return data;
  } catch (error) {
    onStatus?.("Run npm run sync-data to generate Pokémon data.");
    console.error(error);
    return null;
  }
}

// Shared "rank a catalog list by Champions usage" composition, repeated for abilities, items,
// and moves on both pages.
export function rankByUsage(entries, scope) {
  return sortByChampionsUsage(applyScopedUsage(entries, scope));
}

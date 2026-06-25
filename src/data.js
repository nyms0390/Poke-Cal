import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "./catalog.js";

export async function loadPokemonData() {
  const [pokemonResponse, abilitiesResponse, movesResponse, itemsResponse, usageData] =
    await Promise.all([
      fetch("./public/pokemon.json"),
      fetch("./public/abilities.json"),
      fetch("./public/moves.json"),
      fetch("./public/items.json"),
      loadOptionalJson("./public/usage-stats.json"),
    ]);

  for (const response of [pokemonResponse, abilitiesResponse, movesResponse, itemsResponse]) {
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
  }

  const [pokemon, abilities, moves, items] = await Promise.all([
    pokemonResponse.json(),
    abilitiesResponse.json(),
    movesResponse.json(),
    itemsResponse.json(),
  ]);

  return {
    pokemon,
    abilities,
    moves,
    items,
    abilityLookup: buildAbilityLookup(abilities),
    itemLookup: buildItemLookup(items),
    moveLookup: buildMoveLookup(moves),
    usageStats: usageData,
  };
}

async function loadOptionalJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}


import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "./catalog.js";

export async function loadPokemonData() {
  const [pokemonResponse, abilitiesResponse, movesResponse, itemsResponse] = await Promise.all([
    fetch("./public/pokemon.json"),
    fetch("./public/abilities.json"),
    fetch("./public/moves.json"),
    fetch("./public/items.json"),
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
  const championPokemon = championsEntries(pokemon);
  const championAbilities = championsEntries(abilities);
  const championMoves = championsEntries(moves);
  const championItems = championsEntries(items);

  return {
    pokemon: championPokemon,
    abilities: championAbilities,
    moves: championMoves,
    items: championItems,
    abilityLookup: buildAbilityLookup(championAbilities),
    itemLookup: buildItemLookup(championItems),
    moveLookup: buildMoveLookup(championMoves),
  };
}

function championsEntries(entries) {
  const filtered = entries.filter((entry) => entry.champions);
  return filtered.length > 0 ? filtered : entries;
}

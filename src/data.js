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
  const championPokemon = includeMegaFamilies(championsEntries(pokemon), pokemon);
  const championAbilities = includeNamedEntries(
    championsEntries(abilities),
    abilities,
    championPokemon.flatMap((entry) => entry.abilities ?? []),
  );
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

function includeMegaFamilies(entries, allPokemon) {
  if (entries.length === allPokemon.length) return entries;

  const retainedIds = new Set(entries.map((entry) => entry.id));
  const retainedBaseSpecies = new Set(entries.map((entry) => entry.baseSpecies ?? entry.name));
  return allPokemon.filter(
    (entry) =>
      retainedIds.has(entry.id) ||
      (retainedBaseSpecies.has(entry.baseSpecies) && entry.name.includes("-Mega")),
  );
}

function includeNamedEntries(entries, allEntries, names) {
  if (entries.length === allEntries.length) return entries;

  const retainedIds = new Set(entries.map((entry) => entry.id));
  const retainedNames = new Set(entries.map((entry) => entry.name));
  for (const name of names) {
    retainedNames.add(name);
  }

  return allEntries.filter((entry) => retainedIds.has(entry.id) || retainedNames.has(entry.name));
}

import test from "node:test";
import assert from "node:assert/strict";

import { megaFamily, searchPokemon } from "../src/pokemon.js";

const pokemon = [
  {
    id: "pikachu",
    name: "Pikachu",
    baseSpecies: "Pikachu",
    baseSpeed: 90,
    aliases: ["皮卡丘"],
  },
  {
    id: "charizard",
    name: "Charizard",
    baseSpecies: "Charizard",
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "charizardmegax",
    name: "Charizard-Mega-X",
    baseSpecies: "Charizard",
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "charizardmegay",
    name: "Charizard-Mega-Y",
    baseSpecies: "Charizard",
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "charizardgmax",
    name: "Charizard-Gmax",
    baseSpecies: "Charizard",
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
];

test("searches Pokémon by normalized English name", () => {
  assert.equal(searchPokemon(pokemon, "pika")[0].id, "pikachu");
});

test("searches forms by Traditional Chinese base-species name", () => {
  assert.deepEqual(
    searchPokemon(pokemon, "噴火龍").map(({ id }) => id),
    ["charizard", "charizardgmax", "charizardmegax", "charizardmegay"],
  );
});

test("returns an empty result for a blank query", () => {
  assert.deepEqual(searchPokemon(pokemon, "  "), []);
});

test("groups the base Pokémon with all of its Mega forms", () => {
  assert.deepEqual(
    megaFamily(pokemon, pokemon.find(({ id }) => id === "charizardmegax")).map(
      ({ id }) => id,
    ),
    ["charizard", "charizardmegax", "charizardmegay"],
  );
});

test("does not add unrelated forms to a Mega family", () => {
  assert.equal(
    megaFamily(pokemon, pokemon.find(({ id }) => id === "charizard")).some(
      ({ id }) => id === "charizardgmax",
    ),
    false,
  );
});

test("keeps a selected non-Mega alternate form on its own page", () => {
  const gmax = pokemon.find(({ id }) => id === "charizardgmax");
  assert.deepEqual(megaFamily(pokemon, gmax), [gmax]);
});

test("returns only the selected Pokémon when it has no Mega form", () => {
  assert.deepEqual(megaFamily(pokemon, pokemon[0]), [pokemon[0]]);
});

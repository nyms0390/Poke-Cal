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
    abilities: ["Static", "Lightning Rod"],
    moves: ["thunderbolt", "irontail"],
  },
  {
    id: "charizard",
    name: "Charizard",
    baseSpecies: "Charizard",
    baseSpeed: 100,
    aliases: ["噴火龍"],
    abilities: ["Blaze", "Solar Power"],
    moves: ["flamethrower", "airslash"],
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
  {
    id: "megaabsol",
    name: "Mega Absol",
    baseSpeed: 115,
    aliases: [],
  },
];

test("searches Pokémon by normalized English name", () => {
  assert.equal(searchPokemon(pokemon, "pika")[0].id, "pikachu");
});

test("searches Pokémon by ability names", () => {
  assert.equal(
    searchPokemon(pokemon, "lightning rod", {
      abilityLookup: new Map([["lightningrod", { name: "Lightning Rod" }]]),
    })[0].id,
    "pikachu",
  );
});

test("searches Pokémon by move names", () => {
  assert.equal(
    searchPokemon(pokemon, "Iron Tail", {
      moveLookup: new Map([["irontail", { name: "Iron Tail" }]]),
    })[0].id,
    "pikachu",
  );
});

test("prioritizes usage-backed ability matches over raw ability matches", () => {
  assert.equal(
    searchPokemon(pokemon, "static", {
      abilityLookup: new Map([["static", { name: "Static" }]]),
      usageStats: {
        pokemon: {
          charizard: { abilities: [{ id: "static", name: "Static", usagePercent: 70 }] },
        },
      },
    })[0].id,
    "charizard",
  );
});

test("prioritizes usage-backed move matches over broad learnset matches", () => {
  assert.equal(
    searchPokemon(
      [
        ...pokemon,
        {
          id: "abomasnow",
          name: "Abomasnow",
          baseSpecies: "Abomasnow",
          baseSpeed: 60,
          aliases: [],
          moves: ["thunderbolt"],
        },
      ],
      "thunderbolt",
      {
        moveLookup: new Map([["thunderbolt", { name: "Thunderbolt" }]]),
        usageStats: {
          pokemon: {
            pikachu: { moves: [{ id: "thunderbolt", name: "Thunderbolt", usagePercent: 35 }] },
          },
        },
      },
    )[0].id,
    "pikachu",
  );
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

test("search tolerates catalog entries without base species", () => {
  assert.equal(searchPokemon(pokemon, "char")[0].id, "charizard");
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

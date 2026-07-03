import test from "node:test";
import assert from "node:assert/strict";

import { megaFamily, searchPokemon } from "../src/pokemon.js";

const pokemon = [
  {
    id: "pikachu",
    name: "Pikachu",
    baseSpecies: "Pikachu",
    types: ["Electric"],
    baseSpeed: 90,
    aliases: ["皮卡丘"],
    abilities: ["Static", "Lightning Rod"],
    moves: ["thunderbolt", "irontail"],
  },
  {
    id: "charizard",
    name: "Charizard",
    baseSpecies: "Charizard",
    types: ["Fire", "Flying"],
    baseSpeed: 100,
    aliases: ["噴火龍"],
    abilities: ["Blaze", "Solar Power"],
    moves: ["flamethrower", "airslash"],
  },
  {
    id: "charizardmegax",
    name: "Charizard-Mega-X",
    baseSpecies: "Charizard",
    types: ["Fire", "Dragon"],
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "charizardmegay",
    name: "Charizard-Mega-Y",
    baseSpecies: "Charizard",
    types: ["Fire", "Flying"],
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "charizardgmax",
    name: "Charizard-Gmax",
    baseSpecies: "Charizard",
    types: ["Fire", "Flying"],
    baseSpeed: 100,
    aliases: ["噴火龍"],
  },
  {
    id: "tatsugiri",
    name: "Tatsugiri",
    baseSpecies: "Tatsugiri",
    types: ["Dragon", "Water"],
    baseSpeed: 82,
    aliases: [],
  },
  {
    id: "tatsugiricurlymega",
    name: "Tatsugiri-Curly-Mega",
    baseSpecies: "Tatsugiri",
    types: ["Dragon", "Water"],
    baseSpeed: 82,
    aliases: [],
  },
  {
    id: "megaabsol",
    name: "Mega Absol",
    types: ["Dark"],
    baseSpeed: 115,
    aliases: [],
  },
  {
    id: "tinkaton",
    name: "Tinkaton",
    baseSpecies: "Tinkaton",
    types: ["Fairy", "Steel"],
    baseSpeed: 94,
    aliases: [],
    abilities: ["Mold Breaker"],
    moves: ["fakeout"],
  },
  {
    id: "excadrill",
    name: "Excadrill",
    baseSpecies: "Excadrill",
    types: ["Ground", "Steel"],
    baseSpeed: 88,
    aliases: [],
    abilities: ["Mold Breaker"],
    moves: ["earthquake"],
  },
  {
    id: "hariyama",
    name: "Hariyama",
    baseSpecies: "Hariyama",
    types: ["Fighting"],
    baseSpeed: 50,
    aliases: [],
    abilities: ["Thick Fat"],
    moves: ["fakeout"],
  },
];

test("searches Pokémon by normalized English name", () => {
  assert.equal(searchPokemon(pokemon, "pika")[0].id, "pikachu");
});

test("searches Pokémon by type", () => {
  assert.deepEqual(
    searchPokemon(pokemon, "fire").map(({ id }) => id),
    ["charizard", "charizardgmax", "charizardmegax", "charizardmegay"],
  );
});

test("searches Pokémon by type with normalized casing", () => {
  assert.equal(searchPokemon(pokemon, "FIRE")[0].id, "charizard");
});

test("searches Pokémon by plus-separated type terms", () => {
  const matches = searchPokemon(pokemon, "fire + flying");

  assert.deepEqual(
    matches.map(({ id }) => id),
    ["charizard", "charizardgmax", "charizardmegay"],
  );
  assert.equal(matches[0].searchMatch, "Type: Fire + Type: Flying");
});

test("prioritizes type matches over usage-backed catalog matches", () => {
  assert.equal(
    searchPokemon(pokemon, "fire", {
      usageStats: {
        pokemon: {
          pikachu: { abilities: [{ id: "fire", name: "Fire", usagePercent: 100 }] },
        },
      },
      abilityLookup: new Map([["fire", { name: "Fire" }]]),
    })[0].id,
    "charizard",
  );
});

test("searches Pokémon by ability names", () => {
  assert.equal(
    searchPokemon(pokemon, "lightning rod", {
      abilityLookup: new Map([["lightningrod", { name: "Lightning Rod" }]]),
    })[0].id,
    "pikachu",
  );
});

test("searches Pokémon by ability Traditional Chinese aliases", () => {
  assert.equal(
    searchPokemon(pokemon, "避雷針", {
      abilityLookup: new Map([["lightningrod", { name: "Lightning Rod", aliases: ["避雷針"] }]]),
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

test("searches Pokémon by move Traditional Chinese aliases", () => {
  assert.equal(
    searchPokemon(pokemon, "鐵尾", {
      moveLookup: new Map([["irontail", { name: "Iron Tail", aliases: ["鐵尾"] }]]),
    })[0].id,
    "pikachu",
  );
});

test("searches Pokémon by plus-separated ability and move terms", () => {
  const [match] = searchPokemon(pokemon, "mold + fake", {
    abilityLookup: new Map([["moldbreaker", { name: "Mold Breaker" }]]),
    moveLookup: new Map([["fakeout", { name: "Fake Out" }]]),
  });

  assert.equal(match.id, "tinkaton");
  assert.equal(match.searchMatch, "Ability: Mold Breaker + Move: Fake Out");
});

test("searches Pokémon by plus-separated Traditional Chinese ability and move aliases", () => {
  const [match] = searchPokemon(pokemon, "破格 + 擊掌奇襲", {
    abilityLookup: new Map([["moldbreaker", { name: "Mold Breaker", aliases: ["破格"] }]]),
    moveLookup: new Map([["fakeout", { name: "Fake Out", aliases: ["擊掌奇襲"] }]]),
  });

  assert.equal(match.id, "tinkaton");
  assert.equal(match.searchMatch, "Ability: Mold Breaker + Move: Fake Out");
});

test("searches Pokémon by plus-separated full ability and move names", () => {
  assert.deepEqual(
    searchPokemon(pokemon, "mold breaker + fake out", {
      abilityLookup: new Map([["moldbreaker", { name: "Mold Breaker" }]]),
      moveLookup: new Map([["fakeout", { name: "Fake Out" }]]),
    }).map(({ id }) => id),
    ["tinkaton"],
  );
});

test("searches Pokémon by Champions item Traditional Chinese aliases", () => {
  assert.equal(
    searchPokemon(
      [
        {
          ...pokemon[0],
          champions: {
            usage: {
              items: [{ id: "lightball", name: "Light Ball", usagePercent: 91 }],
            },
          },
        },
      ],
      "電氣球",
      {
        itemLookup: new Map([["lightball", { name: "Light Ball", aliases: ["電氣球"] }]]),
      },
    )[0].id,
    "pikachu",
  );
});

test("returns an empty result for separator-only search", () => {
  assert.deepEqual(searchPokemon(pokemon, "+"), []);
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

test("groups Mega forms whose form label appears before Mega", () => {
  assert.deepEqual(
    megaFamily(pokemon, pokemon.find(({ id }) => id === "tatsugiri")).map(({ id }) => id),
    ["tatsugiri", "tatsugiricurlymega"],
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

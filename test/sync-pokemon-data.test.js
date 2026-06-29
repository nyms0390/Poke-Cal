import test from "node:test";
import assert from "node:assert/strict";

import { downloadEverything } from "../scripts/sync-pokemon-data.mjs";

const fixtures = new Map([
  [
    "pokedex.ts",
    `export const Pokedex: import('../sim/dex-species').SpeciesDataTable = {
      pikachu: {
        num: 25,
        name: "Pikachu",
        types: ["Electric"],
        baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
        abilities: { 0: "Static", H: "Lightning Rod" },
      },
    };`,
  ],
  [
    "learnsets.ts",
    `export const Learnsets: import('../sim/dex-species').LearnsetDataTable = {
      pikachu: {
        learnset: {
          thunderbolt: ["9M"],
          quickattack: ["9L1"],
        },
      },
    };`,
  ],
  [
    "abilities.ts",
    `export const Abilities: import('../sim/dex-abilities').AbilityDataTable = {
      static: {
        name: "Static",
        rating: 2,
      },
    };`,
  ],
  [
    "text/abilities.ts",
    `export const AbilitiesText: { [id: IDEntry]: AbilityText } = {
      static: {
        name: "Static",
        shortDesc: "30% chance a Pokemon making contact with this Pokemon will be paralyzed.",
      },
    };`,
  ],
  [
    "moves.ts",
    `export const Moves: import('../sim/dex-moves').MoveDataTable = {
      thunderbolt: {
        name: "Thunderbolt",
        type: "Electric",
        category: "Special",
        basePower: 90,
        accuracy: 100,
        pp: 15,
      },
    };`,
  ],
  [
    "text/moves.ts",
    `export const MovesText: { [id: IDEntry]: MoveText } = {
      thunderbolt: {
        name: "Thunderbolt",
        desc: "Has a 10% chance to paralyze the target.",
        shortDesc: "10% chance to paralyze the target.",
      },
    };`,
  ],
  [
    "items.ts",
    `export const Items: import('../sim/dex-items').ItemDataTable = {
      lightball: {
        name: "Light Ball",
        itemUser: ["Pikachu"],
        onModifyAtk() {
          return true;
        },
      },
    };`,
  ],
  [
    "text/items.ts",
    `export const ItemsText: { [id: IDEntry]: ItemText } = {
      lightball: {
        name: "Light Ball",
        shortDesc: "If held by a Pikachu, its Attack and Sp. Atk are doubled.",
      },
    };`,
  ],
  [
    "pokemon_species_names.csv",
    [
      "pokemon_species_id,local_language_id,name,genus",
      "25,4,皮卡丘,鼠寶可夢",
    ].join("\n"),
  ],
]);

test("downloads Pokémon, item, ability, and move catalogs from source files", async () => {
  const data = await downloadEverything(async (url) => {
    const [key] = [...fixtures.keys()]
      .filter((candidate) => url.endsWith(candidate))
      .sort((a, b) => b.length - a.length);
    assert.ok(key, `Unexpected fixture URL: ${url}`);
    return fixtures.get(key);
  });

  assert.deepEqual(data.pokemon, [
    {
      id: "pikachu",
      name: "Pikachu",
      baseSpecies: "Pikachu",
      types: ["Electric"],
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
      baseSpeed: 90,
      abilities: ["Lightning Rod", "Static"],
      moves: ["quickattack", "thunderbolt"],
      aliases: ["皮卡丘"],
    },
  ]);
  assert.equal(data.abilities[0].shortDesc.includes("paralyzed"), true);
  assert.equal(data.moves[0].basePower, 90);
  assert.equal(data.items[0].shortDesc.includes("Pikachu"), true);
  assert.equal("onModifyAtk" in data.items[0], false);
  assert.equal("usage-stats" in data, false);
});

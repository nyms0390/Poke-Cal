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
        weightkg: 6,
        abilities: { 0: "Static", H: "Lightning Rod" },
      },
      floetteeternal: {
        num: 670,
        name: "Floette-Eternal",
        baseSpecies: "Floette",
        types: ["Fairy"],
        baseStats: { hp: 74, atk: 65, def: 67, spa: 125, spd: 128, spe: 92 },
        weightkg: 0.9,
        abilities: { 0: "Flower Veil", H: "Symbiosis" },
      },
      floettemega: {
        num: 670,
        name: "Floette-Mega",
        baseSpecies: "Floette",
        battleOnly: "Floette-Eternal",
        types: ["Fairy"],
        baseStats: { hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 },
        weightkg: 100.8,
        abilities: { 0: "Fairy Aura" },
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
        num: 9,
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
        num: 85,
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
        num: 236,
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
    "champions/formats-data.ts",
    `export const FormatsData: import('../../../sim/dex-species').ModdedSpeciesFormatsDataTable = {
      pikachu: {
        tier: "OU",
      },
    };`,
  ],
  [
    "champions/learnsets.ts",
    `export const Learnsets: import('../../../sim/dex-species').ModdedLearnsetDataTable = {
      pikachu: {
        learnset: {
          volttackle: ["9M"],
          thunderbolt: ["9M"],
        },
      },
    };`,
  ],
  [
    "champions/abilities.ts",
    `export const Abilities: import('../../../sim/dex-abilities').ModdedAbilityDataTable = {
      static: {
        inherit: true,
        rating: 3,
      },
    };`,
  ],
  [
    "champions/moves.ts",
    `export const Moves: import('../../../sim/dex-moves').ModdedMoveDataTable = {
      thunderbolt: {
        inherit: true,
        basePower: 95,
      },
    };`,
  ],
  [
    "champions/items.ts",
    `export const Items: import('../../../sim/dex-items').ModdedItemDataTable = {
      lightball: {
        inherit: true,
        isNonstandard: "Past",
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
  [
    "move_names.csv",
    [
      "move_id,local_language_id,name",
      "85,4,十萬伏特",
      "85,9,Thunderbolt",
    ].join("\n"),
  ],
  [
    "ability_names.csv",
    [
      "ability_id,local_language_id,name",
      "9,4,靜電",
      "9,9,Static",
    ].join("\n"),
  ],
  [
    "items.csv",
    [
      "id,identifier,category_id,cost,fling_power,fling_effect_id",
      "236,light-ball,12,1000,,",
    ].join("\n"),
  ],
  [
    "item_names.csv",
    [
      "item_id,local_language_id,name",
      "236,4,電氣球",
      "236,9,Light Ball",
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
      id: "floetteeternal",
      name: "Floette-Eternal",
      baseSpecies: "Floette",
      types: ["Fairy"],
      baseStats: { hp: 74, atk: 65, def: 67, spa: 125, spd: 128, spe: 92 },
      baseSpeed: 92,
      weightkg: 0.9,
      abilities: ["Flower Veil", "Symbiosis"],
      moves: [],
      aliases: [],
      champions: { legal: false },
    },
    {
      id: "floettemega",
      name: "Floette-Mega",
      baseSpecies: "Floette",
      battleOnly: "Floette-Eternal",
      types: ["Fairy"],
      baseStats: { hp: 74, atk: 85, def: 87, spa: 155, spd: 148, spe: 102 },
      baseSpeed: 102,
      weightkg: 100.8,
      abilities: ["Fairy Aura"],
      moves: [],
      aliases: [],
      champions: { legal: false },
    },
    {
      id: "pikachu",
      name: "Pikachu",
      baseSpecies: "Pikachu",
      types: ["Electric"],
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
      baseSpeed: 90,
      weightkg: 6,
      abilities: ["Lightning Rod", "Static"],
      moves: ["thunderbolt", "volttackle"],
      aliases: ["皮卡丘"],
      champions: { legal: true, tier: "OU" },
    },
  ]);
  assert.deepEqual(data.abilities[0].aliases, ["靜電"]);
  assert.deepEqual(data.moves[0].aliases, ["十萬伏特"]);
  assert.deepEqual(data.items[0].aliases, ["電氣球"]);
  assert.equal(data.abilities[0].shortDesc.includes("paralyzed"), true);
  assert.equal(data.abilities[0].rating, 3);
  assert.equal(data.abilities[0].champions.legal, true);
  assert.equal(data.moves[0].basePower, 95);
  assert.equal(data.moves[0].champions.legal, true);
  assert.equal(data.items[0].shortDesc.includes("Pikachu"), true);
  assert.equal(data.items[0].champions.legal, false);
  assert.equal("onModifyAtk" in data.items[0], false);
  assert.equal("usage-stats" in data, false);
});

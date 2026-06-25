import test from "node:test";
import assert from "node:assert/strict";

import { downloadEverything, latestStatsMonth } from "../scripts/sync-pokemon-data.mjs";

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
  [
    "stats/",
    [
      '<a href="2026-04/">2026-04/</a>',
      '<a href="2026-05/">2026-05/</a>',
    ].join("\n"),
  ],
  [
    "gen9championsbssregma-0.json",
    JSON.stringify({
      data: {
        Pikachu: {
          "Raw count": 200,
          usage: 0.125,
          Abilities: { Static: 145 },
          Items: { "Light Ball": 176.4 },
          Moves: { Thunderbolt: 182.8 },
          Spreads: { "Timid:0/0/0/252/4/252": 126.4 },
        },
      },
    }),
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
  assert.deepEqual(data["usage-stats"].pokemon.pikachu.items, [
    { id: "lightball", name: "Light Ball", usagePercent: 88.2 },
  ]);
  assert.equal(data["usage-stats"].month, "2026-05");
});

test("discovers the latest Smogon stats month from the directory index", () => {
  assert.equal(
    latestStatsMonth(`
      <a href="2026-02/">2026-02/</a>
      <a href="2026-05/">2026-05/</a>
      <a href="2026-04/">2026-04/</a>
    `),
    "2026-05",
  );
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAbilityLookup,
  buildItemLookup,
  buildMoveLookup,
  filterMoves,
  formatUsagePercent,
  formatMoveAccuracy,
  formatMovePower,
  formatMovePriority,
  mergeUsage,
  moveEffect,
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
  resolvePokemonItems,
  resolvePokemonMoves,
  sortByUsage,
  usageForPokemon,
} from "../src/catalog.js";

test("normalizes Showdown-style identifiers", () => {
  assert.equal(normalizeId("Thunder Punch"), "thunderpunch");
  assert.equal(normalizeId("10,000,000 Volt Thunderbolt"), "10000000voltthunderbolt");
});

test("resolves abilities by id or display name with safe fallbacks", () => {
  const lookup = buildAbilityLookup([
    {
      id: "lightningrod",
      name: "Lightning Rod",
      shortDesc: "Draws Electric moves.",
      rating: 3,
    },
  ]);

  assert.deepEqual(
    resolvePokemonAbilities({ abilities: ["Lightning Rod", "Missing Ability"] }, lookup),
    [
      {
        id: "lightningrod",
        name: "Lightning Rod",
        shortDesc: "Draws Electric moves.",
        rating: 3,
      },
      {
        id: "missingability",
        name: "Missing Ability",
      },
    ],
  );
});

test("resolves moves by learnset id with safe fallbacks", () => {
  const lookup = buildMoveLookup([
    {
      id: "thunderbolt",
      name: "Thunderbolt",
      type: "Electric",
      category: "Special",
    },
  ]);

  assert.deepEqual(resolvePokemonMoves({ moves: ["thunderbolt", "unknownmove"] }, lookup), [
    {
      id: "thunderbolt",
      name: "Thunderbolt",
      type: "Electric",
      category: "Special",
    },
    {
      id: "unknownmove",
      name: "unknownmove",
    },
  ]);
});

test("prefers Champions-available moves when catalog metadata exists", () => {
  const lookup = buildMoveLookup([
    {
      id: "thunderbolt",
      name: "Thunderbolt",
      champions: { usageCount: 50 },
    },
    {
      id: "hiddenpower",
      name: "Hidden Power",
    },
  ]);

  assert.deepEqual(
    resolveChampionsPokemonMoves({ moves: ["thunderbolt", "hiddenpower", "unknownmove"] }, lookup),
    [
      {
        id: "thunderbolt",
        name: "Thunderbolt",
        champions: { usageCount: 50 },
      },
    ],
  );
});

test("resolves items and merges usage by normalized id", () => {
  const lookup = buildItemLookup([
    {
      id: "lightball",
      name: "Light Ball",
      shortDesc: "If held by a Pikachu, its Attack and Sp. Atk are doubled.",
    },
  ]);

  assert.deepEqual(
    resolvePokemonItems(
      {
        items: [
          { id: "lightball", name: "Light Ball", usagePercent: 88.2 },
          { id: "choicescarf", name: "Choice Scarf", usagePercent: 6.4 },
        ],
      },
      lookup,
    ),
    [
      {
        id: "lightball",
        name: "Light Ball",
        shortDesc: "If held by a Pikachu, its Attack and Sp. Atk are doubled.",
        usagePercent: 88.2,
      },
      {
        id: "choicescarf",
        name: "Choice Scarf",
        usagePercent: 6.4,
      },
    ],
  );
});

test("merges usage into catalog entries without dropping missing entries", () => {
  const entries = [
    { id: "static", name: "Static" },
    { id: "lightningrod", name: "Lightning Rod" },
  ];
  const usageEntries = [{ id: "static", name: "Static", usagePercent: 72.5 }];

  assert.deepEqual(mergeUsage(entries, usageEntries), [
    { id: "static", name: "Static", usagePercent: 72.5 },
    { id: "lightningrod", name: "Lightning Rod" },
  ]);
});

test("sorts used entries before unused entries and formats usage", () => {
  assert.deepEqual(
    sortByUsage([
      { id: "quickattack", usagePercent: 44.1 },
      { id: "thunderbolt", usagePercent: 91.4 },
      { id: "agility" },
    ]).map(({ id }) => id),
    ["thunderbolt", "quickattack", "agility"],
  );
  assert.equal(formatUsagePercent(88.234), "88.2%");
  assert.equal(formatUsagePercent(undefined), "—");
});

test("selects exact form usage before base species usage", () => {
  const usageStats = {
    pokemon: {
      charizard: { usagePercent: 11 },
      charizardmegax: { usagePercent: 22 },
    },
  };

  assert.equal(
    usageForPokemon(usageStats, {
      id: "charizardmegax",
      baseSpecies: "Charizard",
    }).usagePercent,
    22,
  );
  assert.equal(
    usageForPokemon(usageStats, {
      id: "charizardmegay",
      baseSpecies: "Charizard",
    }).usagePercent,
    11,
  );
});

test("filters moves by query, type, and category", () => {
  const moves = [
    {
      id: "thunderbolt",
      name: "Thunderbolt",
      type: "Electric",
      category: "Special",
      shortDesc: "10% chance to paralyze the target.",
    },
    {
      id: "quickattack",
      name: "Quick Attack",
      type: "Normal",
      category: "Physical",
      shortDesc: "Usually goes first.",
    },
  ];

  assert.deepEqual(filterMoves(moves, { query: "para" }).map(({ id }) => id), [
    "thunderbolt",
  ]);
  assert.deepEqual(filterMoves(moves, { type: "Normal" }).map(({ id }) => id), [
    "quickattack",
  ]);
  assert.deepEqual(filterMoves(moves, { category: "Special" }).map(({ id }) => id), [
    "thunderbolt",
  ]);
});

test("formats move display values", () => {
  assert.equal(formatMovePower(0), "—");
  assert.equal(formatMovePower(90), "90");
  assert.equal(formatMoveAccuracy(true), "—");
  assert.equal(formatMoveAccuracy(85), "85");
  assert.equal(formatMovePriority(0), "0");
  assert.equal(formatMovePriority(1), "+1");
  assert.equal(formatMovePriority(-3), "-3");
  assert.equal(moveEffect({ shortDesc: "Short.", desc: "Long." }), "Short.");
  assert.equal(moveEffect({ desc: "Long." }), "Long.");
  assert.equal(moveEffect({}), "—");
});

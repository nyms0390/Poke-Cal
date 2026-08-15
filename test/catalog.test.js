import test from "node:test";
import assert from "node:assert/strict";

import {
  applyScopedUsage,
  buildAbilityLookup,
  buildItemLookup,
  buildMoveLookup,
  filterMoves,
  formatUsagePercent,
  formatMoveAccuracy,
  formatMovePower,
  moveEffect,
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
  resolvePokemonItems,
  resolvePokemonMoves,
  sortMoves,
  usageForPokemon,
} from "../src/data/catalog.js";

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
      champions: { legal: true, usageCount: 50 },
    },
    {
      id: "hiddenpower",
      name: "Hidden Power",
      champions: { legal: false, usageCount: 50 },
    },
  ]);

  assert.deepEqual(
    resolveChampionsPokemonMoves({ moves: ["thunderbolt", "hiddenpower", "unknownmove"] }, lookup),
    [
      {
        id: "thunderbolt",
        name: "Thunderbolt",
        champions: { legal: true, usageCount: 50 },
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

test("formats usage percentages", () => {
  assert.equal(formatUsagePercent(88.234), "88.2%");
  assert.equal(formatUsagePercent(undefined), "—");
});

test("applies scoped usage and clears stale global counts", () => {
  const scoped = applyScopedUsage(
    [
      { id: "fakeout", name: "Fake Out", champions: { usageCount: 1000 } },
      { id: "protect", name: "Protect", champions: { usageCount: 9000 } },
    ],
    [{ id: "fakeout", name: "Fake Out", usageCount: 7, usagePercent: 70 }],
  );

  assert.equal(scoped[0].champions.usageCount, 7);
  assert.equal(scoped[0].champions.usagePercent, 70);
  assert.equal(scoped[1].champions.usageCount, undefined);
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
      aliases: ["十萬伏特"],
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
  assert.deepEqual(filterMoves(moves, { query: "十萬伏特" }).map(({ id }) => id), [
    "thunderbolt",
  ]);
  assert.deepEqual(filterMoves(moves, { type: "Normal" }).map(({ id }) => id), [
    "quickattack",
  ]);
  assert.deepEqual(filterMoves(moves, { category: "Special" }).map(({ id }) => id), [
    "thunderbolt",
  ]);
});

test("filters moves by move property and combines it with existing filters", () => {
  const moves = [
    {
      id: "thunderpunch",
      name: "Thunder Punch",
      type: "Electric",
      category: "Physical",
      flags: { contact: 1, punch: 1 },
    },
    {
      id: "hypervoice",
      name: "Hyper Voice",
      type: "Normal",
      category: "Special",
      flags: { sound: 1 },
    },
    {
      id: "boomburst",
      name: "Boomburst",
      type: "Normal",
      category: "Special",
      flags: { sound: 1 },
    },
  ];

  assert.deepEqual(filterMoves(moves, { flag: "punch" }).map(({ id }) => id), [
    "thunderpunch",
  ]);
  assert.deepEqual(
    filterMoves(moves, { type: "Normal", category: "Special", flag: "sound", query: "hyper" })
      .map(({ id }) => id),
    ["hypervoice"],
  );
});

test("formats move display values", () => {
  assert.equal(formatMovePower(0), "—");
  assert.equal(formatMovePower(90), "90");
  assert.equal(formatMoveAccuracy(true), "—");
  assert.equal(formatMoveAccuracy(85), "85");
  assert.equal(moveEffect({ shortDesc: "Short.", desc: "Long." }), "Short.");
  assert.equal(moveEffect({ desc: "Long." }), "Long.");
  assert.equal(moveEffect({}), "—");
});

test("sorts moves by every catalog column without mutating or losing stable order", () => {
  const moves = [
    {
      id: "status-a",
      name: "Status A",
      type: "Normal",
      category: "Status",
      basePower: 0,
      accuracy: true,
      pp: undefined,
      shortDesc: "Same effect",
    },
    {
      id: "damage-b",
      name: "Damage B",
      type: "Water",
      category: "Special",
      basePower: 80,
      accuracy: 100,
      pp: 15,
      shortDesc: "Beta effect",
    },
    {
      id: "damage-a",
      name: "Damage A",
      type: "Fire",
      category: "Physical",
      basePower: 80,
      accuracy: 90,
      pp: 20,
      shortDesc: "Alpha effect",
    },
    {
      id: "status-b",
      name: "Status B",
      type: "Grass",
      category: "Status",
      basePower: 0,
      accuracy: true,
      pp: undefined,
      shortDesc: "Same effect",
    },
  ];

  for (const key of ["name", "type", "category", "power", "accuracy", "pp", "effect"]) {
    const ascending = sortMoves(moves, { key, direction: "ascending" });
    const descending = sortMoves(moves, { key, direction: "descending" });
    assert.notStrictEqual(ascending, moves);
    assert.notStrictEqual(descending, moves);
    assert.equal(ascending.length, moves.length);
    assert.equal(descending.length, moves.length);
  }

  assert.deepEqual(sortMoves(moves, { key: "name", direction: "ascending" }).map(({ id }) => id), [
    "damage-a",
    "damage-b",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "name", direction: "descending" }).map(({ id }) => id), [
    "status-b",
    "status-a",
    "damage-b",
    "damage-a",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "type", direction: "ascending" }).map(({ id }) => id), [
    "damage-a",
    "status-b",
    "status-a",
    "damage-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "category", direction: "descending" }).map(({ id }) => id), [
    "status-a",
    "status-b",
    "damage-b",
    "damage-a",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "power", direction: "ascending" }).map(({ id }) => id), [
    "damage-b",
    "damage-a",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "accuracy", direction: "descending" }).map(({ id }) => id), [
    "damage-b",
    "damage-a",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "pp", direction: "ascending" }).map(({ id }) => id), [
    "damage-b",
    "damage-a",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "effect", direction: "ascending" }).map(({ id }) => id), [
    "damage-a",
    "damage-b",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "effect", direction: "descending" }).map(({ id }) => id), [
    "status-a",
    "status-b",
    "damage-b",
    "damage-a",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "power", direction: "descending" }).map(({ id }) => id), [
    "damage-b",
    "damage-a",
    "status-a",
    "status-b",
  ]);
  assert.deepEqual(sortMoves(moves, { key: "unknown", direction: "ascending" }), moves);
  assert.deepEqual(moves.map(({ id }) => id), ["status-a", "damage-b", "damage-a", "status-b"]);
});

test("keeps null Accuracy and PP values with displayed-missing values", () => {
  const moves = [
    { id: "null-accuracy", name: "Null Accuracy", accuracy: null, pp: 10 },
    { id: "valid-accuracy", name: "Valid Accuracy", accuracy: 90, pp: 10 },
    { id: "null-pp", name: "Null PP", accuracy: 90, pp: null },
    { id: "valid-pp", name: "Valid PP", accuracy: 90, pp: 5 },
  ];

  for (const direction of ["ascending", "descending"]) {
    assert.deepEqual(
      sortMoves(moves, { key: "accuracy", direction }).map(({ id }) => id),
      ["valid-accuracy", "null-pp", "valid-pp", "null-accuracy"],
    );
    assert.deepEqual(
      sortMoves(moves, { key: "pp", direction }).map(({ id }) => id),
      direction === "ascending"
        ? ["valid-pp", "null-accuracy", "valid-accuracy", "null-pp"]
        : ["null-accuracy", "valid-accuracy", "valid-pp", "null-pp"],
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAbilityLookup,
  buildMoveLookup,
  filterMoves,
  formatMoveAccuracy,
  formatMovePower,
  formatMovePriority,
  moveEffect,
  normalizeId,
  resolvePokemonAbilities,
  resolvePokemonMoves,
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

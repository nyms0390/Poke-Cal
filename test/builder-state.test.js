import test from "node:test";
import assert from "node:assert/strict";

import {
  createBuilderState,
  finalStats,
  normalizeThreatCount,
  partitionBulkMatchups,
  significantBreakPoints,
} from "../src/ui/builder-state.js";

const pikachu = {
  id: "pikachu",
  name: "Pikachu",
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
};

const usageDefaults = {
  nature: "Timid",
  sp: { hp: 0, atk: 0, def: 4, spa: 32, spd: 0, spe: 32 },
  ability: { id: "static", name: "Static" },
  item: { id: "lightball", name: "Light Ball" },
  teraType: "Electric",
  moves: [
    { id: "thunderbolt", name: "Thunderbolt" },
    { id: "voltswitch", name: "Volt Switch" },
    { id: "protect", name: "Protect" },
    { id: "nastyplot", name: "Nasty Plot" },
  ],
};

test("creates an empty builder with the default threat count", () => {
  assert.deepEqual(createBuilderState(), { user: null, threatCount: 20 });
});

test("normalizes an editable threat count to a whole number from zero through fifty", () => {
  assert.equal(normalizeThreatCount("12.9"), 12);
  assert.equal(normalizeThreatCount(-3), 0);
  assert.equal(normalizeThreatCount(80), 50);
  assert.equal(normalizeThreatCount(""), 20);
  assert.equal(normalizeThreatCount("not a number"), 20);
});

test("creates one canonical side state without activating the usage-backed Tera type", () => {
  const state = createBuilderState(pikachu, usageDefaults, { threatCount: 12 });

  assert.equal(state.user.pokemon, pikachu);
  assert.equal(state.user.nature, "Timid");
  assert.deepEqual(state.user.sp, usageDefaults.sp);
  assert.equal(state.user.teraType, "");
  assert.deepEqual(state.user.selectedMoveIds, [
    "thunderbolt",
    "voltswitch",
    "protect",
    "nastyplot",
  ]);
  assert.equal(state.threatCount, 12);
});

test("calculates all six final level-50 stats without mutating builder state", () => {
  const state = createBuilderState(pikachu, usageDefaults);

  assert.deepEqual(finalStats(state), {
    hp: 110,
    atk: 67,
    def: 64,
    spa: 102,
    spd: 70,
    spe: 156,
  });
  assert.deepEqual(state.user.sp, usageDefaults.sp);
  assert.equal(finalStats(createBuilderState()), null);
});

test("defers bulk matchups at 3HKO and longer behind more detail", () => {
  const matchups = [
    { id: "ohko", damage: { koText: "50.0% chance to OHKO" } },
    { id: "two", damage: { koText: "guaranteed 2HKO" } },
    { id: "three", damage: { koText: "guaranteed 3HKO" } },
    { id: "four", damage: { koText: "25.0% chance to 4HKO" } },
    { id: "five", damage: { koText: "guaranteed 5HKO" } },
    { id: "safe", damage: { koText: "not a KO within 5 hits" } },
  ];

  const partitioned = partitionBulkMatchups(matchups);

  assert.deepEqual(partitioned.primary.map(({ id }) => id), ["ohko", "two"]);
  assert.deepEqual(partitioned.detail.map(({ id }) => id), ["three", "four", "five", "safe"]);
});

test("keeps only meaningful break-point spread milestones", () => {
  const points = [
    { sp: 3, achieves: "100.0% chance to 4HKO" },
    { sp: 19, achieves: "58.0% chance to 3HKO", requiresPlusNature: true },
    { sp: 20, achieves: "0.1% chance to 3HKO" },
    { sp: 22, achieves: "0.5% chance to 3HKO" },
    { sp: 32, achieves: "guaranteed 3HKO" },
  ];

  assert.deepEqual(
    significantBreakPoints("99.5% chance to 4HKO", points),
    [points[1], points[2], points[4]],
  );
});

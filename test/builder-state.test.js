import test from "node:test";
import assert from "node:assert/strict";

import { createBuilderState, finalStats } from "../src/ui/builder-state.js";

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

test("creates one canonical side state with the usage-backed Tera type", () => {
  const state = createBuilderState(pikachu, usageDefaults, { threatCount: 12 });

  assert.equal(state.user.pokemon, pikachu);
  assert.equal(state.user.nature, "Timid");
  assert.deepEqual(state.user.sp, usageDefaults.sp);
  assert.equal(state.user.teraType, "Electric");
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

import test from "node:test";
import assert from "node:assert/strict";

import { calculateSpeed, finalSpeed, speedBreakdown } from "../src/engine/speed.js";
import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";

test("calculates level 50 Champions Speed from base stat and SP", () => {
  assert.deepEqual(
    calculateSpeed({ baseSpeed: 100, sp: 32 }),
    {
      rawSpeed: 152,
      natureSpeed: 152,
      modifiedSpeed: 152,
      effectiveOrder: 152,
    },
  );
});

test("applies nature before stat stages", () => {
  assert.equal(
    calculateSpeed({
      baseSpeed: 100,
      sp: 32,
      nature: "Jolly",
      stage: 1,
    }).modifiedSpeed,
    250,
  );
});

test("applies Tailwind and paralysis to the staged Speed", () => {
  const result = calculateSpeed({
    baseSpeed: 90,
    sp: 20,
    tailwind: true,
    status: "paralysis",
  });

  assert.equal(result.natureSpeed, 130);
  assert.equal(result.modifiedSpeed, 130);
});

test("applies optional item or ability multipliers", () => {
  assert.equal(
    calculateSpeed({
      baseSpeed: 100,
      sp: 32,
      speedMultiplier: 1.5,
    }).modifiedSpeed,
    228,
  );
});

test("represents Trick Room as reversed move order, not a changed Speed stat", () => {
  const result = calculateSpeed({
    baseSpeed: 100,
    sp: 32,
    trickRoom: true,
  });

  assert.equal(result.modifiedSpeed, 152);
  assert.equal(result.effectiveOrder, 9848);
});

test("rejects SP and stage values outside Champions limits", () => {
  assert.throws(() => calculateSpeed({ baseSpeed: 100, sp: 33 }), /SP/);
  assert.throws(() => calculateSpeed({ baseSpeed: 100, stage: 7 }), /Stage/);
});

test("calculates final Speed from the battle calculator state shape", () => {
  const side = {
    pokemon: { baseStats: { spe: 100 } },
    nature: "Jolly",
    sp: { spe: 32 },
    stages: { spe: 1 },
    item: { id: "choicescarf", name: "Choice Scarf" },
    tailwind: true,
    status: "paralysis",
  };

  assert.equal(finalSpeed(side), 375);
  // Manual modifier chains with (does not replace) Choice Scarf: 250 × 2 × 1.5 × 1.5 = 1125 → par 562.
  assert.equal(finalSpeed({ ...side, speedMultiplier: 1.5 }), 562);
});

const ditto = { id: "ditto", name: "Ditto", types: ["Normal"],
  baseStats: { hp: 48, atk: 48, def: 48, spa: 48, spd: 48, spe: 48 } };
const regigigas = { id: "regigigas", name: "Regigigas", types: ["Normal"],
  baseStats: { hp: 110, atk: 160, def: 110, spa: 80, spd: 110, spe: 100 } };
const quickPowder = { id: "quickpowder", name: "Quick Powder" };
const slowStart = { id: "slowstart", name: "Slow Start" };

test("Quick Powder doubles an untransformed Ditto's Speed (matches @smogon/calc)", () => {
  const state = { pokemon: ditto, sp: { spe: 32 }, nature: "Jolly", item: quickPowder };
  // @smogon/calc getFinalSpeed: 220 (Jolly, 32 SP) and 300 (Hardy, 32 SP, +1).
  assert.equal(finalSpeed(state), 220);
  assert.equal(finalSpeed({ ...state, nature: "Hardy", stages: { spe: 1 } }), 300);
  assert.deepEqual(speedBreakdown(state).modifiers.map(({ label }) => label), ["Quick Powder"]);
  assert.equal(finalSpeed({ ...state, transformed: true }), 110);
  assert.equal(finalSpeed({ ...state, itemConsumed: true }), 110);
  assert.equal(finalSpeed({ ...state, pokemon: regigigas }), finalSpeed({ ...state, pokemon: regigigas, item: null }));
});

test("Slow Start halves Speed while active (matches @smogon/calc)", () => {
  const state = { pokemon: regigigas, sp: { spe: 32 }, nature: "Jolly", ability: slowStart };
  // @smogon/calc getFinalSpeed with abilityOn: 83, and 76 with Choice Scarf at Adamant -1.
  assert.equal(finalSpeed(state), 83);
  assert.equal(finalSpeed({ ...state, nature: "Adamant", stages: { spe: -1 },
    item: { id: "choicescarf", name: "Choice Scarf" } }), 76);
  assert.equal(finalSpeed({ ...state, slowStartActive: false }), 167);
  assert.equal(finalSpeed(state, {}, { suppressAbility: true }), 167);
});

test("Slow Start halves physical Attack only while active (matches @smogon/calc)", () => {
  const garchomp = { id: "garchomp", name: "Garchomp", types: ["Dragon", "Ground"],
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } };
  const run = (move, attackerState) => calculateDamage({ attacker: regigigas, defender: garchomp, move,
    attackerState: { nature: "Adamant", sp: { atk: 32, spe: 32 }, stages: {}, ability: slowStart, item: null, ...attackerState },
    defenderState: { nature: "Hardy", sp: {}, stages: {}, ability: { id: "roughskin", name: "Rough Skin" }, item: null },
    field: createField({ format: "singles" }) });
  const bodySlam = { id: "bodyslam", name: "Body Slam", type: "Normal", category: "Physical", basePower: 85,
    target: "normal", flags: { contact: 1 } };
  const hyperVoice = { id: "hypervoice", name: "Hyper Voice", type: "Normal", category: "Special", basePower: 90,
    target: "allAdjacentFoes", flags: { sound: 1 } };
  assert.deepEqual(run(bodySlam).rolls, [49, 49, 49, 51, 51, 52, 52, 52, 54, 54, 55, 55, 55, 57, 57, 58]);
  assert.equal(run(bodySlam).notes.includes("Slow Start"), true);
  assert.deepEqual(run(hyperVoice).rolls, [43, 45, 45, 45, 46, 46, 46, 48, 48, 48, 49, 49, 49, 51, 51, 52]);
  assert.equal(run(hyperVoice).notes.includes("Slow Start"), false);
  assert.equal(run(bodySlam, { slowStartActive: false }).maxDamage > 100, true);
});

test("Speed clamps out-of-range stages and coerces string SP instead of throwing", () => {
  const species = { id: "speedy", name: "Speedy", baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 100 } };
  const clean = finalSpeed({ pokemon: species, sp: { spe: 32 }, stages: { spe: 6 } });
  assert.equal(finalSpeed({ pokemon: species, sp: { spe: "32" }, stages: { spe: 9 } }), clean);
  assert.equal(finalSpeed({ pokemon: species, sp: { spe: 40 }, stages: { spe: "6" } }), clean);
  assert.equal(finalSpeed({ pokemon: species, sp: { spe: 32.9 }, stages: { spe: 6.5 } }), clean);
  assert.equal(finalSpeed({ pokemon: species, sp: { spe: -5 }, stages: { spe: -8 } }),
    finalSpeed({ pokemon: species, sp: { spe: 0 }, stages: { spe: -6 } }));
});

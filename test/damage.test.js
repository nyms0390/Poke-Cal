import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDamage,
  calculateStat,
  koSummary,
  natureMultiplier,
  unsupportedMoveReason,
} from "../src/damage.js";

const pikachu = {
  id: "pikachu",
  name: "Pikachu",
  types: ["Electric"],
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
};

const squirtle = {
  id: "squirtle",
  name: "Squirtle",
  types: ["Water"],
  baseStats: { hp: 44, atk: 48, def: 65, spa: 50, spd: 64, spe: 43 },
};

const neutralState = {
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0 },
  ability: null,
  item: null,
};

test("calculates Champions-style HP and non-HP stats with nature and stages", () => {
  assert.equal(calculateStat({ base: 35, stat: "hp", sp: 32 }), 142);
  assert.equal(calculateStat({ base: 100, stat: "atk", sp: 32, nature: "Adamant" }), 167);
  assert.equal(calculateStat({ base: 100, stat: "spa", sp: 32, nature: "Adamant" }), 136);
  assert.equal(calculateStat({ base: 100, stat: "atk", sp: 32, stage: 1 }), 228);
});

test("maps all named natures to stat multipliers", () => {
  assert.equal(natureMultiplier("Jolly", "spe"), 1.1);
  assert.equal(natureMultiplier("Jolly", "spa"), 0.9);
  assert.equal(natureMultiplier("Quirky", "atk"), 1);
  assert.equal(natureMultiplier("Unknown", "atk"), 1);
});

test("calculates STAB, type effectiveness, immunity, burn, crit, and roll ranges", () => {
  const thunderbolt = { id: "thunderbolt", name: "Thunderbolt", type: "Electric", category: "Special", basePower: 90 };
  const result = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });

  assert.equal(result.supported, true);
  assert.equal(result.typeMultiplier, 2);
  assert.deepEqual([result.minDamage, result.maxDamage], [86, 104]);
  assert.deepEqual([result.minPercent, result.maxPercent], [72.2, 87.3]);
  assert.equal(result.rolls.length, 16);

  const immune = calculateDamage({
    attacker: pikachu,
    defender: { ...squirtle, types: ["Ground"] },
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.deepEqual([immune.minDamage, immune.maxDamage, immune.minPercent], [0, 0, 0]);

  const physical = { id: "quickattack", name: "Quick Attack", type: "Normal", category: "Physical", basePower: 40 };
  const normal = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: physical,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const burned = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: physical,
    attackerState: { ...neutralState, burned: true },
    defenderState: neutralState,
    burned: true,
  });
  const critical = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: physical,
    attackerState: neutralState,
    defenderState: neutralState,
    critical: true,
  });
  assert.equal(burned.maxDamage < normal.maxDamage, true);
  assert.equal(critical.maxDamage > normal.maxDamage, true);
});

test("truncates damage percentages like Pikalytics Champions calculator", () => {
  const incineroar = {
    id: "incineroar",
    name: "Incineroar",
    types: ["Fire", "Dark"],
    baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 },
  };
  const spread = {
    nature: "Careful",
    sp: { hp: 32, atk: 0, def: 14, spa: 0, spd: 20, spe: 0 },
    stages: { atk: 0, def: 0, spa: 0, spd: 0 },
    ability: null,
    item: null,
  };
  const result = calculateDamage({
    attacker: incineroar,
    defender: incineroar,
    move: { id: "flareblitz", name: "Flare Blitz", type: "Fire", category: "Physical", basePower: 120 },
    attackerState: { ...spread, stages: { ...spread.stages, atk: -1 } },
    defenderState: spread,
  });

  assert.deepEqual([result.minDamage, result.maxDamage], [25, 30]);
  assert.deepEqual([result.minPercent, result.maxPercent], [12.3, 14.8]);
});

test("defaults to doubles spread-move damage", () => {
  const spreadThunderbolt = {
    id: "spreadthunderbolt",
    name: "Spread Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
    target: "allAdjacentFoes",
  };
  const doubles = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: spreadThunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const singles = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: spreadThunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
    battleFormat: "singles",
  });

  assert.deepEqual([doubles.minDamage, doubles.maxDamage], [64, 78]);
  assert.deepEqual([doubles.minPercent, doubles.maxPercent], [53.7, 65.5]);
  assert.deepEqual([singles.minDamage, singles.maxDamage], [86, 104]);
  assert.equal(doubles.notes.includes("Doubles spread move"), true);
});

test("applies curated item and ability modifiers", () => {
  const physical = { id: "quickattack", name: "Quick Attack", type: "Normal", category: "Physical", basePower: 40 };
  const special = { id: "thunderbolt", name: "Thunderbolt", type: "Electric", category: "Special", basePower: 90 };
  const cases = [
    ["Choice Band", { item: { id: "choiceband", name: "Choice Band" } }, physical],
    ["Choice Specs", { item: { id: "choicespecs", name: "Choice Specs" } }, special],
    ["Life Orb", { item: { id: "lifeorb", name: "Life Orb" } }, special],
    ["Light Ball", { item: { id: "lightball", name: "Light Ball" } }, special],
    ["Expert Belt", { item: { id: "expertbelt", name: "Expert Belt" } }, special],
    ["Muscle Band", { item: { id: "muscleband", name: "Muscle Band" } }, physical],
    ["Wise Glasses", { item: { id: "wiseglasses", name: "Wise Glasses" } }, special],
    ["Adaptability", { ability: { id: "adaptability", name: "Adaptability" } }, special],
    ["Huge Power", { ability: { id: "hugepower", name: "Huge Power" } }, physical],
    ["Pure Power", { ability: { id: "purepower", name: "Pure Power" } }, physical],
    ["Guts", { ability: { id: "guts", name: "Guts" }, burned: true }, physical],
    ["Technician", { ability: { id: "technician", name: "Technician" } }, physical],
  ];

  for (const [label, statePatch, move] of cases) {
    const result = calculateDamage({
      attacker: pikachu,
      defender: squirtle,
      move,
      attackerState: { ...neutralState, ...statePatch },
      defenderState: neutralState,
      burned: statePatch.burned ?? false,
    });
    assert.equal(result.notes.includes(label), true, label);
  }
});

test("classifies unsupported moves and summarizes KOs", () => {
  assert.match(unsupportedMoveReason({ category: "Status", basePower: 0 }), /Status/);
  assert.match(unsupportedMoveReason({ id: "grassknot", category: "Special", basePower: 0 }), /Variable/);
  assert.match(unsupportedMoveReason({ id: "bodypress", category: "Physical", basePower: 80 }), /Custom/);
  assert.equal(koSummary({ minDamage: 100, maxDamage: 100, defenderHp: 100 }), "Guaranteed 1HKO");
  assert.equal(koSummary({ minDamage: 45, maxDamage: 60, defenderHp: 100 }), "Possible 2HKO");
});

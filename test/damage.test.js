import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateDamage,
  calculateStat,
  formatDamageResult,
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

test("supports numeric fixed-damage moves and type immunities", () => {
  const dragonRage = {
    id: "dragonrage",
    name: "Dragon Rage",
    type: "Dragon",
    category: "Special",
    basePower: 0,
    damage: 40,
  };
  const sonicBoom = {
    id: "sonicboom",
    name: "Sonic Boom",
    type: "Normal",
    category: "Special",
    basePower: 0,
    damage: 20,
  };
  const superFang = {
    id: "superfang",
    name: "Super Fang",
    type: "Normal",
    category: "Physical",
    basePower: 0,
  };
  const ruination = {
    id: "ruination",
    name: "Ruination",
    type: "Dark",
    category: "Special",
    basePower: 0,
  };

  const dragonRageResult = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: dragonRage,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.equal(dragonRageResult.supported, true);
  assert.deepEqual([dragonRageResult.minDamage, dragonRageResult.maxDamage], [40, 40]);
  assert.deepEqual([dragonRageResult.minPercent, dragonRageResult.maxPercent], [33.6, 33.6]);
  assert.equal(dragonRageResult.notes.includes("Fixed damage"), true);

  const sonicBoomResult = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: sonicBoom,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.deepEqual([sonicBoomResult.minDamage, sonicBoomResult.maxDamage], [20, 20]);

  const superFangResult = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: superFang,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.deepEqual([superFangResult.minDamage, superFangResult.maxDamage], [59, 59]);
  assert.deepEqual([superFangResult.minPercent, superFangResult.maxPercent], [49.5, 49.5]);

  const ruinationResult = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: ruination,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.deepEqual([ruinationResult.minDamage, ruinationResult.maxDamage], [59, 59]);

  const immune = calculateDamage({
    attacker: pikachu,
    defender: { ...squirtle, types: ["Ghost"] },
    move: sonicBoom,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  assert.deepEqual([immune.minDamage, immune.maxDamage, immune.minPercent], [0, 0, 0]);
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

test("applies type-boosting held items only to matching move types", () => {
  const ironTail = {
    id: "irontail",
    name: "Iron Tail",
    type: "Steel",
    category: "Physical",
    basePower: 100,
  };
  const quickAttack = {
    id: "quickattack",
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    basePower: 40,
  };

  const noItem = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: ironTail,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const metalCoat = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: ironTail,
    attackerState: { ...neutralState, item: { id: "metalcoat", name: "Metal Coat" } },
    defenderState: neutralState,
  });
  const nonMatching = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: { ...neutralState, item: { id: "metalcoat", name: "Metal Coat" } },
    defenderState: neutralState,
  });
  const normalNoItem = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: neutralState,
    defenderState: neutralState,
  });

  assert.equal(metalCoat.notes.includes("Metal Coat"), true);
  assert.equal(metalCoat.maxDamage > noItem.maxDamage, true);
  assert.equal(nonMatching.notes.includes("Metal Coat"), false);
  assert.deepEqual([nonMatching.minDamage, nonMatching.maxDamage], [normalNoItem.minDamage, normalNoItem.maxDamage]);
});

test("applies resist berries to matching super-effective damage", () => {
  const thunderbolt = {
    id: "thunderbolt",
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
  };
  const waterGun = {
    id: "watergun",
    name: "Water Gun",
    type: "Water",
    category: "Special",
    basePower: 40,
  };
  const quickAttack = {
    id: "quickattack",
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    basePower: 40,
  };

  const noBerry = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const wacanBerry = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, item: { id: "wacanberry", name: "Wacan Berry" } },
  });
  const neutralPasshoBerry = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: neutralState,
    defenderState: { ...neutralState, item: { id: "passhoberry", name: "Passho Berry" } },
  });
  const neutralWaterGun = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const chilanBerry = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: neutralState,
    defenderState: { ...neutralState, item: { id: "chilanberry", name: "Chilan Berry" } },
  });
  const noChilan = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: neutralState,
    defenderState: neutralState,
  });

  assert.equal(wacanBerry.notes.includes("Wacan Berry"), true);
  assert.deepEqual([wacanBerry.minDamage, wacanBerry.maxDamage], [43, 52]);
  assert.equal(wacanBerry.maxDamage < noBerry.maxDamage, true);
  assert.equal(neutralPasshoBerry.notes.includes("Passho Berry"), false);
  assert.deepEqual(
    [neutralPasshoBerry.minDamage, neutralPasshoBerry.maxDamage],
    [neutralWaterGun.minDamage, neutralWaterGun.maxDamage],
  );
  assert.equal(chilanBerry.notes.includes("Chilan Berry"), true);
  assert.equal(chilanBerry.maxDamage < noChilan.maxDamage, true);
});

test("applies type-specific offensive ability multipliers", () => {
  const thunderbolt = {
    id: "thunderbolt",
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
  };
  const dragonClaw = {
    id: "dragonclaw",
    name: "Dragon Claw",
    type: "Dragon",
    category: "Physical",
    basePower: 80,
  };
  const ironTail = {
    id: "irontail",
    name: "Iron Tail",
    type: "Steel",
    category: "Physical",
    basePower: 100,
  };
  const rockSlide = {
    id: "rockslide",
    name: "Rock Slide",
    type: "Rock",
    category: "Physical",
    basePower: 75,
  };
  const quickAttack = {
    id: "quickattack",
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    basePower: 40,
  };

  const transistor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: { ...neutralState, ability: { id: "transistor", name: "Transistor" } },
    defenderState: neutralState,
  });
  const noTransistor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const dragonsMaw = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: dragonClaw,
    attackerState: { ...neutralState, ability: { id: "dragonsmaw", name: "Dragon's Maw" } },
    defenderState: neutralState,
  });
  const steelworker = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: ironTail,
    attackerState: { ...neutralState, ability: { id: "steelworker", name: "Steelworker" } },
    defenderState: neutralState,
  });
  const rockyPayload = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: rockSlide,
    attackerState: { ...neutralState, ability: { id: "rockypayload", name: "Rocky Payload" } },
    defenderState: neutralState,
  });
  const nonMatching = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: { ...neutralState, ability: { id: "steelworker", name: "Steelworker" } },
    defenderState: neutralState,
  });
  const normalNoAbility = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: neutralState,
    defenderState: neutralState,
  });

  assert.equal(transistor.notes.includes("Transistor"), true);
  assert.equal(transistor.maxDamage > noTransistor.maxDamage, true);
  assert.equal(dragonsMaw.notes.includes("Dragon's Maw"), true);
  assert.equal(steelworker.notes.includes("Steelworker"), true);
  assert.equal(rockyPayload.notes.includes("Rocky Payload"), true);
  assert.deepEqual([nonMatching.minDamage, nonMatching.maxDamage], [normalNoAbility.minDamage, normalNoAbility.maxDamage]);
});

test("applies move-flag offensive ability multipliers", () => {
  const cases = [
    [
      "Iron Fist",
      { id: "ironfist", name: "Iron Fist" },
      { id: "thunderpunch", name: "Thunder Punch", type: "Electric", category: "Physical", basePower: 75, flags: { punch: 1 } },
    ],
    [
      "Strong Jaw",
      { id: "strongjaw", name: "Strong Jaw" },
      { id: "crunch", name: "Crunch", type: "Dark", category: "Physical", basePower: 80, flags: { bite: 1 } },
    ],
    [
      "Sharpness",
      { id: "sharpness", name: "Sharpness" },
      { id: "razorleaf", name: "Razor Leaf", type: "Grass", category: "Physical", basePower: 55, flags: { slicing: 1 } },
    ],
    [
      "Tough Claws",
      { id: "toughclaws", name: "Tough Claws" },
      { id: "scratch", name: "Scratch", type: "Normal", category: "Physical", basePower: 40, flags: { contact: 1 } },
    ],
    [
      "Mega Launcher",
      { id: "megalauncher", name: "Mega Launcher" },
      { id: "aurasphere", name: "Aura Sphere", type: "Fighting", category: "Special", basePower: 80, flags: { pulse: 1 } },
    ],
    [
      "Reckless",
      { id: "reckless", name: "Reckless" },
      { id: "flareblitz", name: "Flare Blitz", type: "Fire", category: "Physical", basePower: 120, flags: { contact: 1 }, recoil: [33, 100] },
    ],
  ];

  for (const [label, ability, move] of cases) {
    const boosted = calculateDamage({
      attacker: pikachu,
      defender: squirtle,
      move,
      attackerState: { ...neutralState, ability },
      defenderState: neutralState,
    });
    const neutral = calculateDamage({
      attacker: pikachu,
      defender: squirtle,
      move,
      attackerState: neutralState,
      defenderState: neutralState,
    });

    assert.equal(boosted.notes.includes(label), true, label);
    assert.equal(boosted.maxDamage > neutral.maxDamage, true, label);
  }

  const nonMatching = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: { id: "quickattack", name: "Quick Attack", type: "Normal", category: "Physical", basePower: 40, flags: {} },
    attackerState: { ...neutralState, ability: { id: "ironfist", name: "Iron Fist" } },
    defenderState: neutralState,
  });
  assert.equal(nonMatching.notes.includes("Iron Fist"), false);
});

test("applies Sniper and critical-hit blocking abilities", () => {
  const thunderbolt = {
    id: "thunderbolt",
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
  };

  const normal = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const critical = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
    critical: true,
  });
  const sniper = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: { ...neutralState, ability: { id: "sniper", name: "Sniper" } },
    defenderState: neutralState,
    critical: true,
  });
  const battleArmor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, ability: { id: "battlearmor", name: "Battle Armor" } },
    critical: true,
  });
  const shellArmor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, ability: { id: "shellarmor", name: "Shell Armor" } },
    critical: true,
  });

  assert.equal(critical.maxDamage > normal.maxDamage, true);
  assert.equal(sniper.maxDamage > critical.maxDamage, true);
  assert.deepEqual([battleArmor.minDamage, battleArmor.maxDamage], [normal.minDamage, normal.maxDamage]);
  assert.deepEqual([shellArmor.minDamage, shellArmor.maxDamage], [normal.minDamage, normal.maxDamage]);
});

test("critical hits ignore harmful attacker stages and helpful defender stages", () => {
  const thunderbolt = {
    id: "thunderbolt",
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
  };
  const neutralCritical = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
    critical: true,
  });
  const attackerDropped = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: { ...neutralState, stages: { ...neutralState.stages, spa: -6 } },
    defenderState: neutralState,
    critical: true,
  });
  const defenderBoosted = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, stages: { ...neutralState.stages, spd: 6 } },
    critical: true,
  });
  const attackerBoosted = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: { ...neutralState, stages: { ...neutralState.stages, spa: 2 } },
    defenderState: neutralState,
    critical: true,
  });

  assert.deepEqual(
    [attackerDropped.minDamage, attackerDropped.maxDamage],
    [neutralCritical.minDamage, neutralCritical.maxDamage],
  );
  assert.deepEqual(
    [defenderBoosted.minDamage, defenderBoosted.maxDamage],
    [neutralCritical.minDamage, neutralCritical.maxDamage],
  );
  assert.equal(attackerBoosted.maxDamage > neutralCritical.maxDamage, true);
});

test("applies super-effective damage reduction abilities", () => {
  const thunderbolt = {
    id: "thunderbolt",
    name: "Thunderbolt",
    type: "Electric",
    category: "Special",
    basePower: 90,
  };
  const waterGun = {
    id: "watergun",
    name: "Water Gun",
    type: "Water",
    category: "Special",
    basePower: 40,
  };

  const superEffective = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const prismArmor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, ability: { id: "prismarmor", name: "Prism Armor" } },
  });
  const solidRock = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: thunderbolt,
    attackerState: neutralState,
    defenderState: { ...neutralState, ability: { id: "solidrock", name: "Solid Rock" } },
  });
  const neutral = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const neutralPrismArmor = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: neutralState,
    defenderState: { ...neutralState, ability: { id: "prismarmor", name: "Prism Armor" } },
  });

  assert.equal(prismArmor.notes.includes("Prism Armor"), true);
  assert.equal(solidRock.notes.includes("Solid Rock"), true);
  assert.equal(prismArmor.maxDamage < superEffective.maxDamage, true);
  assert.equal(solidRock.maxDamage < superEffective.maxDamage, true);
  assert.deepEqual([neutralPrismArmor.minDamage, neutralPrismArmor.maxDamage], [neutral.minDamage, neutral.maxDamage]);
});

test("applies Tinted Lens only to not-very-effective attacks", () => {
  const waterGun = {
    id: "watergun",
    name: "Water Gun",
    type: "Water",
    category: "Special",
    basePower: 40,
  };
  const quickAttack = {
    id: "quickattack",
    name: "Quick Attack",
    type: "Normal",
    category: "Physical",
    basePower: 40,
  };

  const resisted = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const tintedLens = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: waterGun,
    attackerState: { ...neutralState, ability: { id: "tintedlens", name: "Tinted Lens" } },
    defenderState: neutralState,
  });
  const neutral = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const neutralTintedLens = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: quickAttack,
    attackerState: { ...neutralState, ability: { id: "tintedlens", name: "Tinted Lens" } },
    defenderState: neutralState,
  });

  assert.equal(tintedLens.notes.includes("Tinted Lens"), true);
  assert.equal(tintedLens.maxDamage > resisted.maxDamage, true);
  assert.equal(neutralTintedLens.notes.includes("Tinted Lens"), false);
  assert.deepEqual([neutralTintedLens.minDamage, neutralTintedLens.maxDamage], [neutral.minDamage, neutral.maxDamage]);
});

test("uses Defense and Defense stages for Body Press damage", () => {
  const pressmon = {
    id: "pressmon",
    name: "Pressmon",
    types: ["Fighting"],
    baseStats: { hp: 80, atk: 20, def: 120, spa: 20, spd: 80, spe: 50 },
  };
  const normalmon = {
    id: "normalmon",
    name: "Normalmon",
    types: ["Normal"],
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 50 },
  };
  const bodyPress = {
    id: "bodypress",
    name: "Body Press",
    type: "Fighting",
    category: "Physical",
    basePower: 80,
    overrideOffensiveStat: "def",
  };

  const neutral = calculateDamage({
    attacker: pressmon,
    defender: normalmon,
    move: bodyPress,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const defenseBoosted = calculateDamage({
    attacker: pressmon,
    defender: normalmon,
    move: bodyPress,
    attackerState: { ...neutralState, stages: { ...neutralState.stages, def: 2 } },
    defenderState: neutralState,
  });
  const attackBoosted = calculateDamage({
    attacker: pressmon,
    defender: normalmon,
    move: bodyPress,
    attackerState: { ...neutralState, stages: { ...neutralState.stages, atk: 6 } },
    defenderState: neutralState,
  });

  assert.deepEqual([neutral.minDamage, neutral.maxDamage], [128, 152]);
  assert.deepEqual([defenseBoosted.minDamage, defenseBoosted.maxDamage], [254, 300]);
  assert.deepEqual([attackBoosted.minDamage, attackBoosted.maxDamage], [128, 152]);
});

test("uses Defense and Defense stages for Psyshock-style special damage", () => {
  const mindmon = {
    id: "mindmon",
    name: "Mindmon",
    types: ["Psychic"],
    baseStats: { hp: 80, atk: 20, def: 60, spa: 120, spd: 60, spe: 50 },
  };
  const shieldmon = {
    id: "shieldmon",
    name: "Shieldmon",
    types: ["Normal"],
    baseStats: { hp: 80, atk: 80, def: 40, spa: 80, spd: 140, spe: 50 },
  };
  const psyshock = {
    id: "psyshock",
    name: "Psyshock",
    type: "Psychic",
    category: "Special",
    basePower: 80,
    overrideDefensiveStat: "def",
  };
  const psystrike = {
    id: "psystrike",
    name: "Psystrike",
    type: "Psychic",
    category: "Special",
    basePower: 100,
    overrideDefensiveStat: "def",
  };
  const secretSword = {
    id: "secretsword",
    name: "Secret Sword",
    type: "Fighting",
    category: "Special",
    basePower: 85,
    overrideDefensiveStat: "def",
  };
  const psychic = {
    id: "psychic",
    name: "Psychic",
    type: "Psychic",
    category: "Special",
    basePower: 90,
  };

  const normalSpecial = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: psychic,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const psyshockResult = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: psyshock,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const psystrikeResult = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: psystrike,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const secretSwordResult = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: secretSword,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const defenseBoosted = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: psyshock,
    attackerState: neutralState,
    defenderState: { ...neutralState, stages: { ...neutralState.stages, def: 2 } },
  });
  const spDefenseBoosted = calculateDamage({
    attacker: mindmon,
    defender: shieldmon,
    move: psyshock,
    attackerState: neutralState,
    defenderState: { ...neutralState, stages: { ...neutralState.stages, spd: 6 } },
  });

  assert.deepEqual([normalSpecial.minDamage, normalSpecial.maxDamage], [45, 54]);
  assert.deepEqual([psyshockResult.minDamage, psyshockResult.maxDamage], [106, 126]);
  assert.deepEqual([psystrikeResult.minDamage, psystrikeResult.maxDamage], [132, 156]);
  assert.deepEqual([secretSwordResult.minDamage, secretSwordResult.maxDamage], [150, 178]);
  assert.deepEqual([defenseBoosted.minDamage, defenseBoosted.maxDamage], [54, 64]);
  assert.deepEqual([spDefenseBoosted.minDamage, spDefenseBoosted.maxDamage], [106, 126]);
});

test("ignores defender Defense stages for ignoreDefensive physical moves", () => {
  const swordmon = {
    id: "swordmon",
    name: "Swordmon",
    types: ["Fighting", "Dark"],
    baseStats: { hp: 80, atk: 120, def: 80, spa: 20, spd: 80, spe: 50 },
  };
  const wallmon = {
    id: "wallmon",
    name: "Wallmon",
    types: ["Normal"],
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 50 },
  };
  const slash = {
    id: "slash",
    name: "Slash",
    type: "Normal",
    category: "Physical",
    basePower: 70,
  };
  const ignoreDefenseMoves = [
    {
      id: "chipaway",
      name: "Chip Away",
      type: "Normal",
      category: "Physical",
      basePower: 70,
      ignoreDefensive: true,
    },
    {
      id: "darkestlariat",
      name: "Darkest Lariat",
      type: "Dark",
      category: "Physical",
      basePower: 85,
      ignoreDefensive: true,
    },
    {
      id: "sacredsword",
      name: "Sacred Sword",
      type: "Fighting",
      category: "Physical",
      basePower: 90,
      ignoreDefensive: true,
    },
  ];
  const boostedDefenseState = {
    ...neutralState,
    stages: { ...neutralState.stages, def: 4 },
  };

  const normal = calculateDamage({
    attacker: swordmon,
    defender: wallmon,
    move: slash,
    attackerState: neutralState,
    defenderState: neutralState,
  });
  const normalIntoBoost = calculateDamage({
    attacker: swordmon,
    defender: wallmon,
    move: slash,
    attackerState: neutralState,
    defenderState: boostedDefenseState,
  });
  assert.equal(normalIntoBoost.maxDamage < normal.maxDamage, true);

  for (const move of ignoreDefenseMoves) {
    const neutral = calculateDamage({
      attacker: swordmon,
      defender: wallmon,
      move,
      attackerState: neutralState,
      defenderState: neutralState,
    });
    const intoBoost = calculateDamage({
      attacker: swordmon,
      defender: wallmon,
      move,
      attackerState: neutralState,
      defenderState: boostedDefenseState,
    });

    assert.deepEqual([intoBoost.minDamage, intoBoost.maxDamage], [neutral.minDamage, neutral.maxDamage], move.name);
  }
});

test("classifies unsupported moves and summarizes KOs", () => {
  assert.match(unsupportedMoveReason({ category: "Status", basePower: 0 }), /Status/);
  assert.match(unsupportedMoveReason({ id: "grassknot", category: "Special", basePower: 0 }), /Variable/);
  assert.equal(unsupportedMoveReason({ id: "bodypress", category: "Physical", basePower: 80 }), "");
  assert.equal(unsupportedMoveReason({ id: "psyshock", category: "Special", basePower: 80 }), "");
  assert.equal(unsupportedMoveReason({ id: "dragonrage", category: "Special", basePower: 0, damage: 40 }), "");
  assert.match(unsupportedMoveReason({ id: "nightshade", category: "Special", basePower: 0, damage: "level" }), /Fixed/);
  assert.equal(koSummary({ minDamage: 100, maxDamage: 100, defenderHp: 100 }), "Guaranteed 1HKO");
  assert.equal(koSummary({ minDamage: 45, maxDamage: 60, defenderHp: 100 }), "Possible 2HKO");
});

test("formats unsupported damage results with their specific reason", () => {
  const result = calculateDamage({
    attacker: pikachu,
    defender: squirtle,
    move: { id: "grassknot", name: "Grass Knot", type: "Grass", category: "Special", basePower: 0 },
    attackerState: neutralState,
    defenderState: neutralState,
  });

  assert.equal(formatDamageResult(result), "Variable or zero base power is not supported.");
});

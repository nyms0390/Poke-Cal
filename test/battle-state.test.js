import test from "node:test";
import assert from "node:assert/strict";

import { applyControl, buildCalcInput, createSideState } from "../src/ui/battle-state.js";
import { calculateDamage } from "../src/engine/damage.js";

const pikachu = {
  id: "pikachu",
  name: "Pikachu",
  types: ["Electric"],
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
};

const usageDefaults = {
  nature: "Timid",
  sp: { hp: 0, atk: 0, def: 4, spa: 32, spd: 0, spe: 32 },
  ability: { id: "static", name: "Static" },
  item: { id: "lightball", name: "Light Ball" },
  moves: [
    { id: "thunderbolt", name: "Thunderbolt" },
    { id: "voltswitch", name: "Volt Switch" },
    { id: "protect", name: "Protect" },
    { id: "nastyplot", name: "Nasty Plot" },
  ],
};

test("createSideState builds the canonical side-state shape with neutral battle-condition defaults", () => {
  const state = createSideState(pikachu, usageDefaults);

  assert.equal(state.pokemon, pikachu);
  assert.equal(state.nature, "Timid");
  assert.deepEqual(state.sp, usageDefaults.sp);
  assert.deepEqual(state.stages, { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.deepEqual(state.ability, usageDefaults.ability);
  assert.deepEqual(state.item, usageDefaults.item);
  assert.equal(state.status, "");
  assert.equal(state.teraType, "");
  assert.equal(state.currentHpFraction, 1);
  assert.deepEqual(state.selectedMoveIds, ["thunderbolt", "voltswitch", "protect", "nastyplot"]);
  assert.equal(state.speedMultiplier, 1);
  assert.equal(state.tailwind, false);
});

test("createSideState normalizes fewer than four usage moves without throwing", () => {
  const state = createSideState(pikachu, { ...usageDefaults, moves: [{ id: "Thunderbolt" }] });
  assert.deepEqual(state.selectedMoveIds, ["thunderbolt", "", "", ""]);
});

test("createSideState does not mutate the sp object it was given", () => {
  const sp = { hp: 0, atk: 0, def: 4, spa: 32, spd: 0, spe: 32 };
  const state = createSideState(pikachu, { ...usageDefaults, sp });
  state.sp.spe = 0;
  assert.equal(sp.spe, 32);
});

test("applyControl clamps SP into 0-32 without mutating the input state", () => {
  const state = createSideState(pikachu, usageDefaults);
  const updated = applyControl(state, { kind: "sp", stat: "spe", value: "999" });
  assert.equal(updated.sp.spe, 32);
  assert.equal(state.sp.spe, 32, "input state left alone");
  assert.notEqual(updated, state);

  const negative = applyControl(state, { kind: "sp", stat: "hp", value: "-5" });
  assert.equal(negative.sp.hp, 0);
});

test("applyControl clamps stat stages into -6..6", () => {
  const state = createSideState(pikachu, usageDefaults);
  assert.equal(applyControl(state, { kind: "stage", stat: "atk", value: "9" }).stages.atk, 6);
  assert.equal(applyControl(state, { kind: "stage", stat: "atk", value: "-9" }).stages.atk, -6);
  assert.equal(applyControl(state, { kind: "stage", stat: "atk", value: "-2" }).stages.atk, -2);
});

test("applyControl replaces ability/item with the already-resolved entry", () => {
  const state = createSideState(pikachu, usageDefaults);
  const newAbility = { id: "lightningrod", name: "Lightning Rod" };
  const newItem = { id: "choicespecs", name: "Choice Specs" };

  assert.deepEqual(applyControl(state, { kind: "ability", value: newAbility }).ability, newAbility);
  assert.deepEqual(applyControl(state, { kind: "item", value: newItem }).item, newItem);
  assert.equal(applyControl(state, { kind: "item", value: null }).item, null);
});

test("applyControl normalizes and replaces one selected move by index", () => {
  const state = createSideState(pikachu, usageDefaults);
  const updated = applyControl(state, { kind: "move", index: 1, value: "Iron Tail" });
  assert.deepEqual(updated.selectedMoveIds, ["thunderbolt", "irontail", "protect", "nastyplot"]);
  assert.deepEqual(state.selectedMoveIds, ["thunderbolt", "voltswitch", "protect", "nastyplot"]);
});

test("applyControl applies a valid usage spread and ignores an invalid one", () => {
  const state = createSideState(pikachu, usageDefaults);
  const applied = applyControl(state, { kind: "spread", value: "Jolly:2/32/0/0/0/32" });
  assert.equal(applied.nature, "Jolly");
  assert.deepEqual(applied.sp, { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });

  const untouched = applyControl(state, { kind: "spread", value: "not a spread" });
  assert.equal(untouched, state);
});

test("applyControl updates nature, speed multiplier, tailwind, and status", () => {
  const state = createSideState(pikachu, usageDefaults);
  assert.equal(applyControl(state, { kind: "nature", value: "Adamant" }).nature, "Adamant");
  assert.equal(applyControl(state, { kind: "speedMultiplier", value: "1.5" }).speedMultiplier, 1.5);
  assert.equal(applyControl(state, { kind: "tailwind", value: true }).tailwind, true);
  assert.equal(applyControl(state, { kind: "status", value: "paralysis" }).status, "paralysis");
  assert.equal(applyControl(state, { kind: "status", value: "burn" }).status, "burn");
});

test("applyControl clamps current HP as a fraction of the supplied maximum", () => {
  const state = createSideState(pikachu, usageDefaults);
  assert.equal(applyControl(state, { kind: "currentHpFraction", value: 0.5, maxHp: 110 }).currentHpFraction, 0.5);
  assert.equal(applyControl(state, { kind: "currentHpFraction", value: 2, maxHp: 110 }).currentHpFraction, 1);
  assert.equal(applyControl(state, { kind: "currentHpFraction", value: 0, maxHp: 110 }).currentHpFraction, 1 / 110);
});

test("applyControl toggles Tera and keeps the selected Tera type", () => {
  const state = createSideState(pikachu, usageDefaults);
  const active = applyControl(state, { kind: "tera", value: { enabled: true, type: "Fire" } });
  assert.equal(active.teraType, "Fire");
  assert.equal(applyControl(active, { kind: "teraType", value: "Water" }).teraType, "Water");
  assert.equal(applyControl(active, { kind: "tera", value: { enabled: false, type: "Water" } }).teraType, "");
});

test("applyControl returns the same state for an unknown kind", () => {
  const state = createSideState(pikachu, usageDefaults);
  assert.equal(applyControl(state, { kind: "unknown", value: "x" }), state);
});

test("buildCalcInput assembles both sides and a Field from raw control values", () => {
  const attacker = createSideState(pikachu, usageDefaults);
  const defender = createSideState(
    { ...pikachu, id: "squirtle", name: "Squirtle" },
    { ...usageDefaults, nature: "Bold" },
  );
  const damageState = { attacker, defender };

  const input = buildCalcInput(damageState, { format: "singles", trickRoom: true, critical: true });

  assert.equal(input.attacker, attacker.pokemon);
  assert.equal(input.defender, defender.pokemon);
  assert.equal(input.attackerState, attacker);
  assert.equal(input.defenderState, defender);
  assert.equal(input.field.format, "singles");
  assert.equal(input.field.trickRoom, true);
  assert.equal(input.critical, true);
});

test("buildCalcInput defaults critical to false and format/trickRoom to Field defaults", () => {
  const damageState = {
    attacker: createSideState(pikachu, usageDefaults),
    defender: createSideState(pikachu, usageDefaults),
  };
  const input = buildCalcInput(damageState, {});
  assert.equal(input.critical, false);
  assert.equal(input.field.format, "doubles");
  assert.equal(input.field.trickRoom, false);
});

test("buildCalcInput passes weather/terrain/gravity through to the Field object", () => {
  const damageState = {
    attacker: createSideState(pikachu, usageDefaults),
    defender: createSideState(pikachu, usageDefaults),
  };
  const input = buildCalcInput(damageState, {
    weather: "SunnyDay",
    terrain: "Electric Terrain",
    gravity: true,
  });
  assert.equal(input.field.weather, "SunnyDay");
  assert.equal(input.field.terrain, "Electric Terrain");
  assert.equal(input.field.gravity, true);
});

// P1-02: attackerSide/defenderSide are field-card panels keyed by physical side ("Attacker's
// side"/"Defender's side"), not by calculation direction — buildCalcInput must slice them into
// the right role for each direction's Field object.
test("buildCalcInput's field boosts the attacker-as-source row from the attacker panel only", () => {
  const damageState = {
    attacker: createSideState(pikachu, usageDefaults),
    defender: createSideState(pikachu, usageDefaults),
  };
  const input = buildCalcInput(damageState, {
    attackerSide: { helpingHand: true, powerSpot: false, battery: false, steelySpirit: false },
    defenderSide: { reflect: false, lightScreen: false, auroraVeil: false, friendGuard: false },
  });

  assert.equal(input.field.attackerSide.helpingHand, true);
  assert.equal(input.field.defenderSide.reflect, false);
});

test("buildCalcInput's reverseField swaps which panel supplies boosts vs. screens", () => {
  const damageState = {
    attacker: createSideState(pikachu, usageDefaults),
    defender: createSideState(pikachu, usageDefaults),
  };
  const input = buildCalcInput(damageState, {
    attackerSide: { helpingHand: true, powerSpot: false, battery: false, steelySpirit: false, reflect: true },
    defenderSide: { reflect: false, lightScreen: false, auroraVeil: false, friendGuard: false },
  });

  // Side A's (the "Attacker's side" panel's) Helping Hand must not boost side B's move: in the
  // reverse direction (defender-as-source), the attackerSide comes from the defender panel, so
  // Helping Hand is off.
  assert.equal(input.reverseField.attackerSide.helpingHand, false);
  // Side A's Reflect becomes the incoming screen once side A is the one being hit.
  assert.equal(input.reverseField.defenderSide.reflect, true);
});

test("buildCalcInput direction handling changes calculated damage: side A's Helping Hand only boosts side A's move", () => {
  const attackerPokemon = {
    id: "attackmon",
    name: "Attackmon",
    types: ["Normal"],
    baseStats: { hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 50 },
  };
  const defenderPokemon = {
    id: "defendmon",
    name: "Defendmon",
    types: ["Normal"],
    baseStats: { hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 50 },
  };
  const move = { id: "tackle", name: "Tackle", type: "Normal", category: "Physical", basePower: 100 };
  const damageState = {
    attacker: createSideState(attackerPokemon, { ...usageDefaults, ability: null, item: null }),
    defender: createSideState(defenderPokemon, { ...usageDefaults, ability: null, item: null }),
  };
  const input = buildCalcInput(damageState, {
    attackerSide: { helpingHand: true, powerSpot: false, battery: false, steelySpirit: false },
    defenderSide: { reflect: false, lightScreen: false, auroraVeil: false, friendGuard: false },
  });

  const sideAAttacks = calculateDamage({
    attacker: input.attacker,
    defender: input.defender,
    move,
    attackerState: input.attackerState,
    defenderState: input.defenderState,
    field: input.field,
  });
  const sideBAttacks = calculateDamage({
    attacker: input.defender,
    defender: input.attacker,
    move,
    attackerState: input.defenderState,
    defenderState: input.attackerState,
    field: input.reverseField,
  });

  assert.equal(sideAAttacks.notes.includes("Helping Hand"), true);
  assert.equal(sideBAttacks.notes.includes("Helping Hand"), false);
  assert.equal(sideAAttacks.maxDamage > sideBAttacks.maxDamage, true);
});

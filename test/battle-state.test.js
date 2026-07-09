import test from "node:test";
import assert from "node:assert/strict";

import { applyControl, buildCalcInput, createSideState } from "../src/ui/battle-state.js";

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
  assert.equal(state.paralyzed, false);
  assert.equal(state.burned, false);
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

test("applyControl toggles nature, speed multiplier, and battle-condition booleans", () => {
  const state = createSideState(pikachu, usageDefaults);
  assert.equal(applyControl(state, { kind: "nature", value: "Adamant" }).nature, "Adamant");
  assert.equal(applyControl(state, { kind: "speedMultiplier", value: "1.5" }).speedMultiplier, 1.5);
  assert.equal(applyControl(state, { kind: "tailwind", value: true }).tailwind, true);
  assert.equal(applyControl(state, { kind: "paralyzed", value: true }).paralyzed, true);
  assert.equal(applyControl(state, { kind: "burned", value: true }).burned, true);
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

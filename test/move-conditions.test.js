import test from "node:test";
import assert from "node:assert/strict";

import { moveConditionDescriptors, moveConditionValue, moveOptionsForSlot } from "../src/ui/move-conditions.js";
import { applyControl, createSideState } from "../src/ui/battle-state.js";
import { activeSetFromState, applyActiveSet } from "../src/data/active-set.js";

const pokemon = { id: "testmon", name: "Testmon", types: ["Ghost"], baseStats: { hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 80 } };
const move = (id, basePower = 50) => ({ id, name: id, type: "Ghost", category: "Physical", basePower });
const defaults = { nature: "Hardy", sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability: null, item: null,
  moves: [move("lastrespects"), move("hex"), move("tripleaxel", 20), move("ragefist")] };

test("catalog-driven controls expose exact predicates and no ordinary-move control", () => {
  assert.deepEqual(moveConditionDescriptors(move("tackle")), []);
  assert.equal(moveConditionDescriptors(move("venoshock"))[0].labelKey, "battle.condition.targetPoisoned");
  assert.equal(moveConditionDescriptors(move("smellingsalts"))[0].labelKey, "battle.condition.targetParalyzed");
  assert.equal(moveConditionDescriptors(move("wakeupslap"))[0].labelKey, "battle.condition.targetAsleep");
  assert.deepEqual(moveConditionDescriptors(move("tripleaxel", 20))[0].choices.map((choice) => choice.value), ["auto", "1", "2", "3"]);
  assert.deepEqual(moveConditionDescriptors(move("lastrespects"))[0].choices.map((choice) => choice.value), ["auto", "0", "1", "2", "3", "4", "5"]);
  assert.deepEqual(moveConditionDescriptors(move("spitup"))[0].choices.map((choice) => choice.value), ["auto", "0", "1", "2", "3"]);
  assert.deepEqual(moveConditionDescriptors(move("beatup"))[0].choices.map((choice) => choice.value), ["auto", "1", "2", "3", "4", "5", "6"]);
  assert.equal(moveConditionDescriptors(move("whirlpool"))[0].labelKey, "battle.condition.targetDiving");
  assert.deepEqual(moveConditionDescriptors({ ...move("dragondarts"), multihit: 2 },
    { item: { id: "loadeddice" } })[0].choices.map((choice) => choice.value), ["auto", "1", "2"]);
});

test("Bullet Seed keeps every exact hit choice with Skill Link or Loaded Dice", () => {
  const bulletSeed = move("bulletseed", 25);
  const choices = ["auto", "2", "3", "4", "5"];
  for (const attackerState of [
    { ability: { id: "skilllink" } },
    { item: { id: "loadeddice" } },
  ]) {
    const descriptor = moveConditionDescriptors(bulletSeed, attackerState)[0];
    assert.equal(descriptor.key, "hitCount");
    assert.deepEqual(descriptor.choices.map((choice) => choice.value), choices);
    assert.deepEqual(moveOptionsForSlot({ ...attackerState, moveOptionsBySlot: [{ hitCount: "3" }] }, 0, bulletSeed),
      { hitCount: 3 });
  }
});

test("per-slot conditions survive unrelated edits and reset on move replacement", () => {
  const initial = createSideState(pokemon, defaults);
  const exact = applyControl(initial, { kind: "moveOption", index: 0, key: "faintedAllyCount", value: "5" });
  const hex = applyControl(exact, { kind: "moveOption", index: 1, key: "conditionOverride", value: "yes" });
  assert.equal(moveConditionValue(hex, 0, moveConditionDescriptors(move("lastrespects"))[0]), "5");
  assert.deepEqual(moveOptionsForSlot(hex, 0, move("lastrespects")), { faintedAllyCount: 5 });
  assert.deepEqual(moveOptionsForSlot(hex, 1, move("hex")), { conditionOverride: true });
  assert.deepEqual(moveOptionsForSlot(hex, 2, move("tripleaxel", 20)), {});
  const replaced = applyControl(hex, { kind: "move", index: 0, value: "tackle" });
  assert.deepEqual(replaced.moveOptionsBySlot[0], {});
  assert.deepEqual(replaced.moveOptionsBySlot[1], { conditionOverride: "yes" });
});

test("active set reload restores move options for the same selected moves", () => {
  const initial = createSideState(pokemon, defaults);
  const chosen = applyControl(initial, { kind: "moveOption", index: 3, key: "hitsReceived", value: "6" });
  const stored = activeSetFromState(chosen);
  const restored = applyActiveSet(createSideState(pokemon, defaults), stored);
  assert.deepEqual(moveOptionsForSlot(restored, 3, move("ragefist")), { hitsReceived: 6 });
});

test("Auto clears legacy slot overrides for hits, order, and condition through reload", () => {
  const cases = [
    ["tripleaxel", "hitCount", "selectedHitCounts", 2],
    ["payback", "targetMoved", "targetMovedOverrides", true],
    ["hex", "conditionOverride", "conditionOverrides", true],
  ];
  for (const [id, key, legacyKey, legacyValue] of cases) {
    const initial = createSideState(pokemon, { ...defaults, moves: [move(id), ...defaults.moves.slice(1)] });
    const legacy = { ...initial, [legacyKey]: [legacyValue, null, null, null] };
    const automatic = applyControl(legacy, { kind: "moveOption", index: 0, key, value: "auto" });
    const descriptor = moveConditionDescriptors(move(id))[0];
    assert.equal(moveConditionValue(automatic, 0, descriptor), "auto", id);
    assert.deepEqual(moveOptionsForSlot(automatic, 0, move(id)), {}, id);
    const persisted = activeSetFromState(automatic);
    const restored = applyActiveSet(legacy, persisted);
    assert.deepEqual(moveOptionsForSlot(restored, 0, move(id)), {}, `${id} reload`);
  }
});

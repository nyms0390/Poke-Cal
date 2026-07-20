import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_SET_STORAGE_KEY,
  activeSetFromState,
  applyActiveSet,
  createActiveSetStore,
} from "../src/data/active-set.js";

const pokemon = { id: "miraidon", name: "Miraidon" };
const ability = { id: "hadronengine", name: "Hadron Engine" };
const item = { id: "choicespecs", name: "Choice Specs" };
const state = {
  pokemon,
  nature: "Modest",
  sp: { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 28 },
  ability,
  item,
  teraType: "Electric",
  selectedMoveIds: ["electrodrift", "dracometeor", "voltswitch", "protect"],
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("persists one versioned active Pokémon set", () => {
  const storage = memoryStorage();
  const store = createActiveSetStore(storage);
  const activeSet = activeSetFromState(state);

  assert.deepEqual(store.writeSet(activeSet), activeSet);
  assert.deepEqual(createActiveSetStore(storage).readSet(), activeSet);
  assert.deepEqual(JSON.parse(storage.getItem(ACTIVE_SET_STORAGE_KEY)), {
    version: 1,
    set: activeSet,
  });

  store.clearSet();
  assert.equal(store.readSet(), null);
});

test("builds a complete set while preserving fields absent from a partial page", () => {
  const fullSet = activeSetFromState(state);
  const speedOnlyState = {
    pokemon,
    nature: "Timid",
    sp: { spe: 32 },
  };

  assert.deepEqual(activeSetFromState(speedOnlyState, fullSet), {
    ...fullSet,
    nature: "Timid",
    sp: { ...fullSet.sp, spe: 32 },
  });
});

test("applies a matching active set using current catalog objects", () => {
  const defaults = {
    pokemon,
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null,
    item: null,
    teraType: "",
    selectedMoveIds: ["", "", "", ""],
  };
  const restored = applyActiveSet(defaults, activeSetFromState(state), {
    abilityLookup: new Map([[ability.id, ability]]),
    itemLookup: new Map([[item.id, item]]),
  });

  assert.equal(restored.pokemon, pokemon);
  assert.equal(restored.ability, ability);
  assert.equal(restored.item, item);
  assert.equal(restored.nature, "Modest");
  assert.equal(restored.teraType, "Electric");
  assert.deepEqual(restored.sp, state.sp);
  assert.deepEqual(restored.selectedMoveIds, state.selectedMoveIds);

  const other = { ...defaults, pokemon: { id: "koraidon", name: "Koraidon" } };
  assert.equal(applyActiveSet(other, activeSetFromState(state)), other);
});

test("does not add unsupported fields to a page state", () => {
  const calculatorState = {
    pokemon,
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null,
    item: null,
    selectedMoveIds: ["", "", "", ""],
  };

  const restored = applyActiveSet(calculatorState, activeSetFromState(state));
  assert.equal("teraType" in restored, false);
});

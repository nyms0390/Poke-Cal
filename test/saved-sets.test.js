import test from "node:test";
import assert from "node:assert/strict";

import { createSavedSetStore, SAVED_SETS_STORAGE_KEY } from "../src/data/saved-sets.js";

const pokemon = { id: "miraidon", name: "Miraidon" };
const ability = { id: "hadronengine", name: "Hadron Engine" };
const item = { id: "choicespecs", name: "Choice Specs" };
const moves = [
  { id: "electrodrift", name: "Electro Drift" },
  { id: "dracometeor", name: "Draco Meteor" },
];
const sideState = {
  pokemon,
  ability,
  item,
  teraType: "Electric",
  nature: "Modest",
  sp: { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  moves,
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
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("saves, lists, and deletes named sets as paste text", () => {
  const storage = memoryStorage();
  const store = createSavedSetStore(storage);

  const saved = store.saveSet("miraidon", "Specs", sideState);
  assert.equal(saved.name, "Specs");
  assert.match(saved.text, /^Miraidon @ Choice Specs$/m);
  assert.match(saved.text, /^- Electro Drift$/m);

  assert.deepEqual(store.listSets("miraidon"), [{ name: "Specs", text: saved.text }]);
  assert.deepEqual(JSON.parse(storage.getItem(SAVED_SETS_STORAGE_KEY)), {
    version: 1,
    sets: { miraidon: { Specs: saved.text } },
  });

  const reloadedStore = createSavedSetStore(storage);
  assert.deepEqual(reloadedStore.listSets("miraidon"), [{ name: "Specs", text: saved.text }]);

  assert.equal(store.deleteSet("miraidon", "Specs"), true);
  assert.deepEqual(store.listSets("miraidon"), []);
});

test("keeps sets separated per normalized pokemon id", () => {
  const store = createSavedSetStore(memoryStorage());
  store.saveSet("Miraidon", "One", sideState);
  store.saveSet("Koraidon", "Two", { ...sideState, pokemon: { id: "koraidon", name: "Koraidon" } });

  assert.deepEqual(store.listSets("miraidon").map((set) => set.name), ["One"]);
  assert.deepEqual(store.listSets("koraidon").map((set) => set.name), ["Two"]);
});

test("falls back to in-memory storage when persistent storage throws", () => {
  const storage = {
    getItem() {
      throw new Error("private browsing");
    },
    setItem() {
      throw new Error("private browsing");
    },
  };
  const store = createSavedSetStore(storage);

  store.saveSet("miraidon", "Private", sideState);
  assert.deepEqual(store.listSets("miraidon").map((set) => set.name), ["Private"]);
});

test("ignores blank pokemon ids and set names", () => {
  const store = createSavedSetStore(memoryStorage());

  assert.equal(store.saveSet("", "Specs", sideState), null);
  assert.equal(store.saveSet("miraidon", "   ", sideState), null);
  assert.deepEqual(store.listSets(""), []);
  assert.equal(store.deleteSet("miraidon", "missing"), false);
});

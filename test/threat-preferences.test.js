import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_THREAT_COUNT,
  THREAT_COUNT_OPTIONS,
  THREAT_PREFERENCES_STORAGE_KEY,
  createThreatPreferencesStore,
} from "../src/data/threat-preferences.js";

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

test("persists one shared popular-threat count from the dropdown choices", () => {
  const storage = memoryStorage();
  const store = createThreatPreferencesStore(storage);

  assert.deepEqual(THREAT_COUNT_OPTIONS, [10, 20, 30, 40, 50]);
  assert.equal(store.readThreatCount(), DEFAULT_THREAT_COUNT);
  assert.equal(store.writeThreatCount("40"), 40);
  assert.equal(createThreatPreferencesStore(storage).readThreatCount(), 40);
  assert.deepEqual(JSON.parse(storage.getItem(THREAT_PREFERENCES_STORAGE_KEY)), {
    version: 1,
    threatCount: 40,
  });
});

test("falls back to the default for values outside the shared dropdown", () => {
  const store = createThreatPreferencesStore();

  assert.equal(store.writeThreatCount(12), DEFAULT_THREAT_COUNT);
  assert.equal(store.writeThreatCount("not a number"), DEFAULT_THREAT_COUNT);
});

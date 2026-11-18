import test from "node:test";
import assert from "node:assert/strict";

import { createStorageStore } from "../src/data/storage-store.js";

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

const teamOptions = {
  key: "pokecal.test.v1",
  createEmpty: () => ({ version: 1, teams: {} }),
  isValid: (value) => value?.version === 1 && value.teams,
};

test("generic storage wrapper persists versioned JSON and falls back to memory", () => {
  const storage = memoryStorage();
  const store = createStorageStore(storage, {
    key: "pokecal.test.v1",
    createEmpty: () => ({ version: 1, teams: {} }),
    isValid: (value) => value?.version === 1 && value.teams,
  });

  store.write({ version: 1, teams: { attacker: { activeIndex: 0 } } });
  assert.deepEqual(store.read(), { version: 1, teams: { attacker: { activeIndex: 0 } } });

  const failingStore = createStorageStore(
    {
      getItem() {
        throw new Error("private browsing");
      },
      setItem() {
        throw new Error("private browsing");
      },
    },
    {
      key: "pokecal.test.v1",
      createEmpty: () => ({ version: 1, teams: {} }),
      isValid: (value) => value?.version === 1 && value.teams,
    },
  );

  failingStore.write({ version: 1, teams: { defender: { activeIndex: 1 } } });
  assert.deepEqual(failingStore.read(), { version: 1, teams: { defender: { activeIndex: 1 } } });
});

test("generic storage wrapper keeps persisting after a parse failure", () => {
  const storage = memoryStorage();
  const options = {
    key: "pokecal.test.v1",
    createEmpty: () => ({ version: 1, teams: {} }),
    isValid: (value) => value?.version === 1 && value.teams,
  };
  storage.setItem(options.key, "\u0000garbage");
  const store = createStorageStore(storage, options);

  assert.deepEqual(store.read(), { version: 1, teams: {} });
  store.write({ version: 1, teams: { attacker: { activeIndex: 2 } } });
  assert.deepEqual(JSON.parse(storage.getItem(options.key)), {
    version: 1,
    teams: { attacker: { activeIndex: 2 } },
  });
  assert.deepEqual(createStorageStore(storage, options).read(), {
    version: 1,
    teams: { attacker: { activeIndex: 2 } },
  });
});

test("a failing corrupt-value backup does not break reads or writes", () => {
  const values = new Map([["pokecal.test.v1", "{"]]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem(key, value) {
      if (key.endsWith(".corrupt")) throw new Error("quota");
      values.set(key, value);
    },
  };
  const store = createStorageStore(storage, {
    key: "pokecal.test.v1",
    createEmpty: () => ({ version: 1, teams: {} }),
  });

  assert.deepEqual(store.read(), { version: 1, teams: {} });
  store.write({ version: 1, teams: { defender: {} } });
  assert.equal(values.get("pokecal.test.v1"), JSON.stringify({ version: 1, teams: { defender: {} } }));
});

test("without storage the store keeps its value in memory", () => {
  const store = createStorageStore(null, teamOptions);
  assert.deepEqual(store.read(), { version: 1, teams: {} });
  store.write({ version: 1, teams: { attacker: {} } });
  assert.deepEqual(store.read(), { version: 1, teams: { attacker: {} } });
});

test("reads and writes are copies, so callers cannot change the stored value by mutation", () => {
  const store = createStorageStore(memoryStorage(), teamOptions);
  const value = { version: 1, teams: { attacker: { activeIndex: 0 } } };
  store.write(value);
  value.teams.attacker.activeIndex = 5;
  const read = store.read();
  read.teams.attacker.activeIndex = 3;
  assert.deepEqual(store.read(), { version: 1, teams: { attacker: { activeIndex: 0 } } });
});

test("a stored value that fails validation, or whose check throws, reads as empty", () => {
  const storage = memoryStorage();
  storage.setItem(teamOptions.key, JSON.stringify({ version: 2, teams: {} }));
  assert.deepEqual(createStorageStore(storage, teamOptions).read(), { version: 1, teams: {} });
  storage.setItem(teamOptions.key, "null");
  const throwing = createStorageStore(storage, { ...teamOptions, isValid: (value) => value.version === 1 });
  assert.deepEqual(throwing.read(), { version: 1, teams: {} });
  assert.equal(storage.getItem(`${teamOptions.key}.corrupt`), null);
});

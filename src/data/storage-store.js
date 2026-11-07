function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

// Persists one versioned JSON value under `key`. Storage exceptions (access denied, quota)
// switch the store to an in-memory value for the rest of the session. A stored value that is
// not valid JSON is only a data problem: it reads as empty, is copied to `<key>.corrupt` for
// recovery, and the next write overwrites it, so the key keeps persisting.
export function createStorageStore(
  storage,
  { key, createEmpty, clone = cloneJson, isValid = () => true },
) {
  let useMemory = !storage;
  let memoryValue = createEmpty();

  function read() {
    if (useMemory) return clone(memoryValue);
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      useMemory = true;
      return clone(memoryValue);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw || "null");
    } catch {
      backupCorruptValue(raw);
      return createEmpty();
    }
    try {
      return isValid(parsed) ? clone(parsed) : createEmpty();
    } catch {
      return createEmpty();
    }
  }

  function backupCorruptValue(raw) {
    try {
      storage.setItem(`${key}.corrupt`, String(raw));
    } catch {
      // Best effort only; the bad value is replaced on the next write either way.
    }
  }

  function write(value) {
    const nextValue = clone(value);
    if (useMemory) {
      memoryValue = nextValue;
      return;
    }
    try {
      storage.setItem(key, JSON.stringify(nextValue));
    } catch {
      useMemory = true;
      memoryValue = nextValue;
    }
  }

  return { read, write };
}

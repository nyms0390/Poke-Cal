import { normalizeId } from "./catalog.js";
import { formatSetPaste } from "./set-paste.js";

export const SAVED_SETS_STORAGE_KEY = "pokecal.sets.v1";

function emptyBlob() {
  return { version: 1, sets: {} };
}

function cloneBlob(blob) {
  return {
    version: 1,
    sets: Object.fromEntries(
      Object.entries(blob?.sets ?? {}).map(([pokemonId, sets]) => [
        pokemonId,
        Object.fromEntries(Object.entries(sets ?? {})),
      ]),
    ),
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createStorageStore(
  storage,
  { key, createEmpty, clone = cloneJson, isValid = () => true },
) {
  let useMemory = !storage;
  let memoryValue = createEmpty();

  function read() {
    if (useMemory) return clone(memoryValue);
    try {
      const parsed = JSON.parse(storage.getItem(key) || "null");
      return isValid(parsed) ? clone(parsed) : createEmpty();
    } catch {
      useMemory = true;
      return clone(memoryValue);
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

export function createSavedSetStore(storage = null) {
  const storageStore = createStorageStore(storage, {
    key: SAVED_SETS_STORAGE_KEY,
    createEmpty: emptyBlob,
    clone: cloneBlob,
    isValid: (value) => value?.version === 1 && value.sets,
  });

  function listSets(pokemonId) {
    const id = normalizeId(pokemonId);
    if (!id) return [];
    const sets = storageStore.read().sets[id] ?? {};
    return Object.entries(sets)
      .map(([name, text]) => ({ name, text }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function saveSet(pokemonId, name, sideState) {
    const id = normalizeId(pokemonId);
    const setName = String(name ?? "").trim();
    if (!id || !setName) return null;

    const blob = storageStore.read();
    blob.sets[id] = { ...(blob.sets[id] ?? {}), [setName]: formatSetPaste(sideState) };
    storageStore.write(blob);
    return { name: setName, text: blob.sets[id][setName] };
  }

  function deleteSet(pokemonId, name) {
    const id = normalizeId(pokemonId);
    const setName = String(name ?? "").trim();
    if (!id || !setName) return false;

    const blob = storageStore.read();
    if (!blob.sets[id] || !(setName in blob.sets[id])) return false;
    delete blob.sets[id][setName];
    if (Object.keys(blob.sets[id]).length === 0) delete blob.sets[id];
    storageStore.write(blob);
    return true;
  }

  return { listSets, saveSet, deleteSet };
}

const defaultStore = createSavedSetStore();

export function listSets(pokemonId) {
  return defaultStore.listSets(pokemonId);
}

export function saveSet(pokemonId, name, sideState) {
  return defaultStore.saveSet(pokemonId, name, sideState);
}

export function deleteSet(pokemonId, name) {
  return defaultStore.deleteSet(pokemonId, name);
}

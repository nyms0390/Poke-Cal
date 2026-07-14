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

export function createSavedSetStore(storage = null) {
  let useMemory = !storage;
  let memoryBlob = emptyBlob();

  function readBlob() {
    if (useMemory) return cloneBlob(memoryBlob);
    try {
      const parsed = JSON.parse(storage.getItem(SAVED_SETS_STORAGE_KEY) || "null");
      return parsed?.version === 1 && parsed.sets ? cloneBlob(parsed) : emptyBlob();
    } catch {
      useMemory = true;
      return cloneBlob(memoryBlob);
    }
  }

  function writeBlob(blob) {
    const nextBlob = cloneBlob(blob);
    if (useMemory) {
      memoryBlob = nextBlob;
      return;
    }
    try {
      storage.setItem(SAVED_SETS_STORAGE_KEY, JSON.stringify(nextBlob));
    } catch {
      useMemory = true;
      memoryBlob = nextBlob;
    }
  }

  function listSets(pokemonId) {
    const id = normalizeId(pokemonId);
    if (!id) return [];
    const sets = readBlob().sets[id] ?? {};
    return Object.entries(sets)
      .map(([name, text]) => ({ name, text }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function saveSet(pokemonId, name, sideState) {
    const id = normalizeId(pokemonId);
    const setName = String(name ?? "").trim();
    if (!id || !setName) return null;

    const blob = readBlob();
    blob.sets[id] = { ...(blob.sets[id] ?? {}), [setName]: formatSetPaste(sideState) };
    writeBlob(blob);
    return { name: setName, text: blob.sets[id][setName] };
  }

  function deleteSet(pokemonId, name) {
    const id = normalizeId(pokemonId);
    const setName = String(name ?? "").trim();
    if (!id || !setName) return false;

    const blob = readBlob();
    if (!blob.sets[id] || !(setName in blob.sets[id])) return false;
    delete blob.sets[id][setName];
    if (Object.keys(blob.sets[id]).length === 0) delete blob.sets[id];
    writeBlob(blob);
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

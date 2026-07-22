import { createStorageStore } from "./saved-sets.js";

export const THREAT_PREFERENCES_STORAGE_KEY = "pokecal.threat-preferences.v1";
export const THREAT_COUNT_OPTIONS = [10, 20, 30, 40, 50];
export const DEFAULT_THREAT_COUNT = 20;

function emptyPreferences() {
  return { version: 1, threatCount: DEFAULT_THREAT_COUNT };
}

function normalizeThreatCount(value) {
  const count = Number(value);
  return THREAT_COUNT_OPTIONS.includes(count) ? count : DEFAULT_THREAT_COUNT;
}

export function createThreatPreferencesStore(storage = null) {
  const storageStore = createStorageStore(storage, {
    key: THREAT_PREFERENCES_STORAGE_KEY,
    createEmpty: emptyPreferences,
    isValid: (value) => value?.version === 1 &&
      THREAT_COUNT_OPTIONS.includes(value.threatCount),
  });

  function readThreatCount() {
    return normalizeThreatCount(storageStore.read().threatCount);
  }

  function writeThreatCount(value) {
    const threatCount = normalizeThreatCount(value);
    storageStore.write({ version: 1, threatCount });
    return threatCount;
  }

  return { readThreatCount, writeThreatCount };
}

import { normalizeId } from "./catalog.js";
import { createStorageStore } from "./saved-sets.js";

export const ACTIVE_SET_STORAGE_KEY = "pokecal.active-set.v1";

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const MOVE_SLOTS = 4;

function emptyBlob() {
  return { version: 1, set: null };
}

function clampSp(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(32, Math.trunc(number)));
}

function normalizeActiveSet(value) {
  const pokemonId = normalizeId(value?.pokemonId);
  if (!pokemonId) return null;
  const moveOptionsBySlot = Array.isArray(value?.moveOptionsBySlot)
    ? Array.from({ length: MOVE_SLOTS }, (_, index) => Object.fromEntries(
      Object.entries(value.moveOptionsBySlot[index] ?? {}).filter(([key, option]) =>
        ["hitCount", "targetMoved", "conditionOverride", "faintedAllyCount", "hitsReceived", "stockpileCount", "beatUpPartyCount", "allOut"].includes(key) &&
          (typeof option === "string" || typeof option === "number" || typeof option === "boolean"))
        .map(([key, option]) => [key, String(option)]),
    )) : undefined;
  return {
    pokemonId,
    nature: String(value?.nature ?? ""),
    sp: Object.fromEntries(STAT_KEYS.map((stat) => [stat, clampSp(value?.sp?.[stat])])),
    abilityId: normalizeId(value?.abilityId),
    itemId: normalizeId(value?.itemId),
    teraType: "",
    moveIds: Array.from({ length: MOVE_SLOTS }, (_, index) => normalizeId(value?.moveIds?.[index])),
    ...(moveOptionsBySlot ? { moveOptionsBySlot } : {}),
  };
}

export function createActiveSetStore(storage = null) {
  const storageStore = createStorageStore(storage, {
    key: ACTIVE_SET_STORAGE_KEY,
    createEmpty: emptyBlob,
    isValid: (value) => value?.version === 1 && (value.set === null || value.set?.pokemonId),
  });

  function readSet() {
    return normalizeActiveSet(storageStore.read().set);
  }

  function writeSet(value) {
    const set = normalizeActiveSet(value);
    storageStore.write({ version: 1, set });
    return set;
  }

  function clearSet() {
    storageStore.write(emptyBlob());
  }

  return { readSet, writeSet, clearSet };
}

export function activeSetFromState(state, fallback = null) {
  const pokemonId = normalizeId(state?.pokemon?.id ?? state?.pokemonId);
  if (!pokemonId) return null;
  const previous = normalizeId(fallback?.pokemonId) === pokemonId ? fallback : null;
  const has = (key) => Object.prototype.hasOwnProperty.call(state, key);
  const moveIds = Array.isArray(state.selectedMoveIds)
    ? state.selectedMoveIds
    : Array.isArray(state.moves)
      ? state.moves.map((move) => move?.id)
      : previous?.moveIds;

  return normalizeActiveSet({
    pokemonId,
    nature: state.nature ?? previous?.nature,
    sp: Object.fromEntries(STAT_KEYS.map((stat) => [
      stat,
      state.sp && Object.prototype.hasOwnProperty.call(state.sp, stat)
        ? state.sp[stat]
        : previous?.sp?.[stat],
    ])),
    abilityId: has("ability") ? state.ability?.id : previous?.abilityId,
    itemId: has("item") ? state.item?.id : previous?.itemId,
    teraType: "",
    moveIds,
    moveOptionsBySlot: has("moveOptionsBySlot") ? state.moveOptionsBySlot : previous?.moveOptionsBySlot,
  });
}

export function applyActiveSet(state, activeSet, { abilityLookup, itemLookup } = {}) {
  const set = normalizeActiveSet(activeSet);
  if (!state?.pokemon || normalizeId(state.pokemon.id) !== set?.pokemonId) return state;

  const next = {
    ...state,
    nature: set.nature || state.nature,
    sp: { ...state.sp, ...set.sp },
  };
  if (Object.prototype.hasOwnProperty.call(state, "ability")) {
    next.ability = set.abilityId ? abilityLookup?.get(set.abilityId) ?? state.ability : null;
  }
  if (Object.prototype.hasOwnProperty.call(state, "item")) {
    next.item = set.itemId ? itemLookup?.get(set.itemId) ?? state.item : null;
  }
  if (Object.prototype.hasOwnProperty.call(state, "teraType")) next.teraType = set.teraType;
  if (Array.isArray(state.selectedMoveIds)) next.selectedMoveIds = [...set.moveIds];
  if (Array.isArray(state.moveOptionsBySlot) && set.moveOptionsBySlot) {
    next.moveOptionsBySlot = set.moveOptionsBySlot.map((options) => ({ ...options }));
    for (const key of ["selectedHitCounts", "targetMovedOverrides", "conditionOverrides"]) {
      if (Array.isArray(state[key])) next[key] = state[key].map(() => null);
    }
  }
  return next;
}

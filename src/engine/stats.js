import { natureMultiplier } from "./natures.js";
import { STAT_KEYS } from "./constants.js";

export function totalBaseStats(baseStats) {
  return STAT_KEYS.reduce((total, key) => total + baseStats[key], 0);
}

export function calculateStat({ base, stat, sp = 0, nature = "Hardy", stage = 0 }) {
  if (!STAT_KEYS.includes(stat)) throw new RangeError(`Unsupported stat: ${stat}`);
  if (!Number.isInteger(base) || base < 1) throw new RangeError("Base stat must be positive.");
  if (!Number.isInteger(sp) || sp < 0 || sp > 32) throw new RangeError("SP must be 0-32.");
  if (!Number.isInteger(stage) || stage < -6 || stage > 6) {
    throw new RangeError("Stage must be -6 to +6.");
  }

  if (stat === "hp") return base + sp + 75;

  const trained = Math.floor((base + sp + 20) * natureMultiplier(nature, stat));
  return applyStage(trained, stage);
}

/**
 * Engine-boundary coercion for user-supplied SP: numeric strings are accepted, fractions are
 * truncated, the result is clamped to 0-32 and anything non-numeric becomes 0.
 * calculateStat itself stays strict.
 */
export function normalizeSp(value) {
  return clampInteger(value, 0, 32);
}

/** Engine-boundary coercion for stat stages: integer, clamped to -6..+6, non-numeric → 0. */
export function normalizeStage(value) {
  return clampInteger(value, -6, 6);
}

function clampInteger(value, min, max) {
  const number = Number(value ?? 0);
  if (Number.isNaN(number)) return 0;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

export function applyStage(value, stage) {
  if (stage >= 0) return Math.floor((value * (2 + stage)) / 2);
  return Math.floor((value * 2) / (2 - stage));
}

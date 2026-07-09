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

export function applyStage(value, stage) {
  if (stage >= 0) return Math.floor((value * (2 + stage)) / 2);
  return Math.floor((value * 2) / (2 - stage));
}

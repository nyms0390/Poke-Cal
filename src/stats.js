const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

export function totalBaseStats(baseStats) {
  return STAT_KEYS.reduce((total, key) => total + baseStats[key], 0);
}

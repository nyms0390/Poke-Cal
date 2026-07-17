import { STAT_KEYS } from "../engine/constants.js";
import { calculateStat } from "../engine/stats.js";
import { createSideState } from "./battle-state.js";

export function createBuilderState(pokemon, usageDefaults, { threatCount = 20 } = {}) {
  if (!pokemon || !usageDefaults) return { user: null, threatCount };

  return {
    user: {
      ...createSideState(pokemon, usageDefaults),
      teraType: usageDefaults.teraType ?? "",
    },
    threatCount,
  };
}

export function finalStats(state) {
  const user = state?.user;
  if (!user?.pokemon) return null;

  return Object.fromEntries(STAT_KEYS.map((stat) => [
    stat,
    calculateStat({
      base: user.pokemon.baseStats[stat],
      stat,
      sp: user.sp?.[stat] ?? 0,
      nature: user.nature,
    }),
  ]));
}

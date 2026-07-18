import { STAT_KEYS } from "../engine/constants.js";
import { calculateStat } from "../engine/stats.js";
import { createSideState } from "./battle-state.js";

export function createBuilderState(pokemon, usageDefaults, { threatCount = 20 } = {}) {
  if (!pokemon || !usageDefaults) return { user: null, threatCount };

  return {
    user: {
      ...createSideState(pokemon, usageDefaults),
      teraType: "",
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

export function partitionBulkMatchups(matchups) {
  return matchups.reduce((groups, matchup) => {
    const koText = String(matchup.damage?.koText ?? "");
    const group = /(?:[3-5]HKO|not a KO|survives with)/i.test(koText) ? "detail" : "primary";
    groups[group].push(matchup);
    return groups;
  }, { primary: [], detail: [] });
}

export function significantBreakPoints(currentKoText, points) {
  let currentMilestone = koMilestone(currentKoText);
  return points.filter((point) => {
    if (point.requiresPlusNature) return true;
    const nextMilestone = koMilestone(point.achieves);
    if (nextMilestone === currentMilestone) return false;
    currentMilestone = nextMilestone;
    return true;
  });
}

function koMilestone(koText) {
  const text = String(koText ?? "");
  if (/not a KO|survives with/i.test(text)) return "not-ko";
  const tier = /(OHKO|[2-5]HKO)/i.exec(text)?.[1]?.toUpperCase() ?? text;
  return `${/guaranteed/i.test(text) ? "guaranteed" : "possible"}-${tier}`;
}

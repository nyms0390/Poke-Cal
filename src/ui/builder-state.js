import { STAT_KEYS } from "../engine/constants.js";
import { calculateStat } from "../engine/stats.js";
import { createSideState } from "./battle-state.js";

const ANALYSIS_TABS = ["bulk", "break"];
const THREAT_SP_GROUPS = {
  hp: "bulk",
  atk: "offense",
  def: "bulk",
  spa: "offense",
  spd: "bulk",
};

export function createBuilderState(
  pokemon,
  usageDefaults,
  { threatCount = 20, analysisTab = "bulk" } = {},
) {
  threatCount = normalizeThreatCount(threatCount);
  analysisTab = ANALYSIS_TABS.includes(analysisTab) ? analysisTab : "bulk";
  if (!pokemon || !usageDefaults) return { user: null, threatCount, analysisTab };

  return {
    user: {
      ...createSideState(pokemon, usageDefaults),
      teraType: "",
    },
    threatCount,
    analysisTab,
  };
}

export function selectBuilderAnalysis(state, analysisTab) {
  if (!ANALYSIS_TABS.includes(analysisTab) || state?.analysisTab === analysisTab) return state;
  return { ...state, analysisTab };
}

export function normalizeThreatCount(value) {
  if (String(value ?? "").trim() === "") return 20;
  const count = Number(value);
  if (!Number.isFinite(count)) return 20;
  return Math.max(0, Math.min(50, Math.trunc(count)));
}

export function applyThreatControl(threat, { kind, stat, index, value }) {
  if (!threat) return threat;
  if (kind === "nature") return { ...threat, nature: value };
  if (kind === "ability") return { ...threat, ability: value };
  if (kind === "item") return { ...threat, item: value };
  if (kind === "teraType") return { ...threat, teraType: value };
  if (kind === "sp") {
    const group = THREAT_SP_GROUPS[stat];
    if (!group) return threat;
    const number = Number(value);
    const sp = Number.isFinite(number) ? Math.max(0, Math.min(32, Math.trunc(number))) : 0;
    return {
      ...threat,
      spPresets: {
        ...threat.spPresets,
        [group]: { ...threat.spPresets?.[group], [stat]: sp },
      },
    };
  }
  if (kind === "move") {
    if (!Number.isInteger(index) || index < 0 || index >= threat.moves.length) return threat;
    return {
      ...threat,
      moves: threat.moves.map((move, moveIndex) => moveIndex === index ? value : move),
    };
  }
  return threat;
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

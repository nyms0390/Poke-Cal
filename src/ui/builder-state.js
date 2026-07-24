import { STAT_KEYS } from "../engine/constants.js";
import { calculateStat } from "../engine/stats.js";
import { createSideState } from "./battle-state.js";
import { createAmbientFieldState } from "./field-state.js";

const ANALYSIS_TABS = ["bulk", "break"];
const ANALYSIS_SORTS = ["breakpoint", "default"];
const BUILDER_SP_BUDGET = 66;
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
  {
    threatCount = 20,
    analysisTab = "bulk",
    analysisSort = "breakpoint",
    field,
  } = {},
) {
  threatCount = normalizeThreatCount(threatCount);
  analysisTab = ANALYSIS_TABS.includes(analysisTab) ? analysisTab : "bulk";
  analysisSort = ANALYSIS_SORTS.includes(analysisSort) ? analysisSort : "breakpoint";
  const ambientField = createAmbientFieldState(field);
  if (!pokemon || !usageDefaults) {
    return { user: null, field: ambientField, threatCount, analysisTab, analysisSort };
  }

  return {
    user: {
      ...createSideState(pokemon, usageDefaults),
      teraType: "",
    },
    field: ambientField,
    threatCount,
    analysisTab,
    analysisSort,
  };
}

export function selectBuilderAnalysis(state, analysisTab) {
  if (!ANALYSIS_TABS.includes(analysisTab) || state?.analysisTab === analysisTab) return state;
  return { ...state, analysisTab };
}

export function selectBuilderSort(state, analysisSort) {
  if (!ANALYSIS_SORTS.includes(analysisSort) || state?.analysisSort === analysisSort) return state;
  return { ...state, analysisSort };
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

export function canApplySpTargets(sp, targets) {
  const nextSp = { ...sp, ...targets };
  return STAT_KEYS.reduce((total, stat) => total + Number(nextSp[stat] ?? 0), 0) <=
    BUILDER_SP_BUDGET;
}

export function availableBulkSpBudget(sp) {
  return Math.max(0, BUILDER_SP_BUDGET -
    Number(sp?.atk ?? 0) -
    Number(sp?.spa ?? 0) -
    Number(sp?.spe ?? 0));
}

export function partitionBulkCoverageGroups(groups) {
  return groups.reduce((sections, group) => {
    sections[group.coverage.status].push(group);
    return sections;
  }, { possible: [], covered: [], unreachable: [] });
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

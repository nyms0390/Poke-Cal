import { koHitCount } from "../data/bulk-points.js";
import { STAT_KEYS } from "../engine/constants.js";
import { calculateStat } from "../engine/stats.js";
import { normalizeId } from "../identifiers.js";
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
    threatStatus = "",
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
    return {
      user: null,
      field: ambientField,
      threatCount,
      threatStatus,
      analysisTab,
      analysisSort,
    };
  }

  return {
    user: {
      ...createSideState(pokemon, usageDefaults),
      teraType: "",
    },
    field: ambientField,
    threatCount,
    threatStatus,
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

export function applyGlobalThreatStatus(threats = [], value = "") {
  return threats.map((threat) => applyThreatControl(threat, { kind: "status", value }));
}

export function applyThreatControl(threat, { kind, stat, index, value }) {
  if (!threat) return threat;
  if (kind === "nature") return { ...threat, nature: value };
  if (kind === "ability") return { ...threat, ability: value };
  if (kind === "item") return { ...threat, item: value };
  if (kind === "status") {
    return value === "soak"
      ? { ...threat, status: "", soaked: true }
      : { ...threat, status: value, soaked: false };
  }
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
      stage: stat === "hp" ? 0 : user.stages?.[stat] ?? 0,
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

export function breakCoverage(userState, analyses) {
  const supported = analyses.filter(({ damage }) => Number.isFinite(damage?.maxPct));
  if (supported.some(({ damage }) =>
    /guaranteed/i.test(damage.koText) && koHitCount(damage.koText) === 1)) {
    return { status: "covered" };
  }

  const possible = supported.some(({ move, damage, points, attackStat }) => {
    const currentHits = koHitCount(damage.koText);
    if (currentHits < 1) return false;
    attackStat ??= move.overrideOffensiveStat ?? (move.category === "Physical" ? "atk" : "spa");
    return points.some(({ sp, achieves }) =>
      /guaranteed/i.test(achieves) &&
      koHitCount(achieves) > 0 &&
      koHitCount(achieves) <= Math.max(1, currentHits - 1) &&
      canApplySpTargets(userState.sp, { [attackStat]: sp }));
  });
  return { status: possible ? "possible" : "unreachable" };
}

export function partitionBulkCoverageGroups(groups) {
  return groups.reduce((sections, group) => {
    sections[group.coverage.status].push(group);
    return sections;
  }, { possible: [], covered: [], unreachable: [] });
}

export function detachFamilyForms(families) {
  return families.flatMap(({ forms }) =>
    forms.map((form) => ({
      ...form,
      relatedForms: forms,
    })));
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

// Per-move-slot attacker settings. The damage engine never reads them from a defender state,
// so they do not affect the defensive (bulk) analysis and are left out of its signature.
const ATTACKER_SLOT_KEYS = [
  "selectedMoveIds",
  "selectedHitCounts",
  "targetMovedOverrides",
  "critMoves",
  "conditionOverrides",
  "moveOptionsBySlot",
  "singleTargetMoves",
];

// Value-based cache key. Catalog Pokémon objects are large and immutable, so they are
// represented by their id; every other value (abilities, items, moves, SP, field) is
// serialized in full so any change to an analysis input changes the key.
export function analysisSignature(value) {
  return JSON.stringify(value, (key, entry) =>
    key === "pokemon" && entry && typeof entry === "object"
      ? `pokemon:${normalizeId(entry.id ?? entry.name)}`
      : entry);
}

export function bulkAnalysisContextSignature(user, field) {
  return analysisSignature({
    analysis: "bulk",
    user: withoutKeys(user, ATTACKER_SLOT_KEYS),
    field,
    budget: availableBulkSpBudget(user?.sp),
  });
}

// Zero-bulk baselines and coverage tables are evaluated from zero defensive SP, so they
// survive HP/Def/SpD edits.
export function bulkTableContextSignature(user, field) {
  const defender = withoutKeys(user, ATTACKER_SLOT_KEYS);
  return analysisSignature({
    analysis: "bulk-table",
    user: defender ? { ...defender, sp: { ...defender.sp, hp: 0, def: 0, spd: 0 } } : defender,
    field,
  });
}

export function breakAnalysisContextSignature(user, field) {
  return analysisSignature({ analysis: "break", user, field });
}

// Only the threat fields each analysis feeds into calculateDamage: bulk uses the first two
// moves and offensive SP; break uses the defensive SP preset and none of the threat's moves.
export function threatAnalysisSignature(threat, analysis) {
  const { pokemon, nature, ability, item, teraType, status, soaked, moves, spPresets } = threat ?? {};
  return analysisSignature({
    pokemon,
    nature,
    ability,
    item,
    teraType,
    status,
    soaked,
    ...(analysis === "bulk"
      ? { moves: (moves ?? []).slice(0, 2), offense: spPresets?.offense }
      : { bulk: spPresets?.bulk }),
  });
}

// Two-level memo: results are grouped by a shared context key (user, field, budget) and keyed
// per item (threat) inside it, so editing one threat recomputes only that threat and returning
// to a recent context (for example toggling weather back) reuses its results.
export function createAnalysisMemo({ contextLimit = 4, itemLimit = 512 } = {}) {
  const contexts = new Map();

  const touch = (map, key) => {
    const value = map.get(key);
    map.delete(key);
    map.set(key, value);
    return value;
  };
  const trim = (map, limit) => {
    while (map.size > limit) map.delete(map.keys().next().value);
  };
  const bucket = (contextKey) => {
    if (contexts.has(contextKey)) return touch(contexts, contextKey);
    const entries = new Map();
    contexts.set(contextKey, entries);
    trim(contexts, contextLimit);
    return entries;
  };

  return {
    get(contextKey, itemKey, compute) {
      const entries = bucket(contextKey);
      if (entries.has(itemKey)) return touch(entries, itemKey);
      const value = compute();
      entries.set(itemKey, value);
      trim(entries, itemLimit);
      return value;
    },
    has(contextKey, itemKey) {
      return contexts.get(contextKey)?.has(itemKey) ?? false;
    },
    peek(contextKey, itemKey) {
      return contexts.get(contextKey)?.get(itemKey);
    },
    clear() {
      contexts.clear();
    },
    get contextCount() {
      return contexts.size;
    },
  };
}

// Key for one rendered analysis panel; when it matches the panel's last render the DOM
// already shows these inputs and can be kept as is.
export function analysisRenderKey({ context, threatKeys = [], sort = "", locale = "" }) {
  return JSON.stringify([context, threatKeys, sort, locale]);
}

function withoutKeys(value, keys) {
  if (!value || typeof value !== "object") return value;
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";
import { calculateStat, normalizeSp } from "../engine/stats.js";
import { normalizeId } from "../identifiers.js";

export function compareKoTiers(left, right) {
  return koTierValue(left) - koTierValue(right);
}

export function rankBulkCoverageGroups(groups) {
  return [...groups].sort((left, right) => compareRanks(
    bulkCoverageRank(left),
    bulkCoverageRank(right),
  ));
}

export function zeroBulkState(userState) {
  return {
    ...userState,
    sp: {
      ...userState.sp,
      hp: 0,
      def: 0,
      spd: 0,
    },
  };
}

// With `hpMatches(hp)` (an HP number plan's `matches`) the result also says whether the most-bulk
// spread fits (`hpFits`) and, when it does not, offers the bulkiest fitting spread as `hpOption`
// with its cost: `bulkCostHp` is how much HP the most-bulk spread could lose and still take no
// more damage from equal physical and special hits than the fitting one.
export function generalBulkRecommendation(userState, { budget = 66, hpMatches = null } = {}) {
  if (!userState?.pokemon) return null;

  const currentSp = {
    hp: normalizeSp(userState.sp?.hp),
    def: normalizeSp(userState.sp?.def),
    spd: normalizeSp(userState.sp?.spd),
  };
  const currentTotal = currentSp.hp + currentSp.def + currentSp.spd;
  const targetTotal = Math.max(
    currentTotal,
    Math.min(96, Math.max(0, Math.trunc(Number(budget) || 0))),
  );
  let best = null;
  let bestFitting = null;

  for (let hpSp = currentSp.hp; hpSp <= 32; hpSp += 1) {
    for (let defSp = currentSp.def; defSp <= 32; defSp += 1) {
      const spdSp = targetTotal - hpSp - defSp;
      if (spdSp < currentSp.spd || spdSp > 32) continue;
      const stats = defensiveStats(userState, { hp: hpSp, def: defSp, spd: spdSp });
      const candidate = {
        sp: { hp: hpSp, def: defSp, spd: spdSp },
        addedSp: targetTotal - currentTotal,
        stats,
        score: mixedBulkScore(stats),
      };
      if (betterGeneralBulk(candidate, best)) best = candidate;
      if (hpMatches?.(stats.hp) && betterGeneralBulk(candidate, bestFitting)) bestFitting = candidate;
    }
  }

  if (!best) return null;
  const { score: _score, ...recommendation } = best;
  if (!hpMatches) return recommendation;
  const hpFits = Boolean(hpMatches(best.stats.hp));
  const hpOption = !hpFits && bestFitting
    ? {
      sp: bestFitting.sp,
      stats: bestFitting.stats,
      bulkCostHp: best.stats.hp * (1 - bestFitting.score / best.score),
    }
    : null;
  return { ...recommendation, hpFits, hpOption };
}

export function threatDamage(userState, scenario) {
  const result = damageResult(userState, scenario);
  if (!result.supported) {
    return { minPct: null, maxPct: null, koText: result.reason ?? "Unsupported", ko: null };
  }
  return {
    minPct: result.minPercent,
    maxPct: result.maxPercent,
    koText: result.ko.text,
    ko: firstKo(result.ko),
  };
}

/**
 * The first hit count with a KO chance, read from the engine's cumulative `ko.chances`:
 * `{ hits, chance }`, or `{ hits: null, chance: 0 }` when nothing KOs within the modeled hits.
 * Sturdy's "survives at full HP" counts as the hit that follows, since `chances` models it.
 */
export function firstKo(ko) {
  const first = (ko?.chances ?? []).find(({ chance }) => chance > 0);
  return first ? { hits: first.hits, chance: first.chance } : { hits: null, chance: 0 };
}

// Zero-bulk reference for one scenario. It ignores the user's HP/Def/SpD SP, so callers may
// memoize it across defensive SP edits (pass `options.baseline`).
export function bulkBaseline(userState, scenario, options) {
  const baselineState = zeroBulkState(userState);
  return {
    baselineDamage: threatDamage(baselineState, scenario),
    baselinePoints: bulkPoints(baselineState, scenario, options),
  };
}

export function bulkPointMatchups(userState, threats, options) {
  const field = options?.field ?? createField();
  const baselineFor = options?.baseline ?? ((scenario) => bulkBaseline(userState, scenario, options));
  return threats
    .flatMap((threat) => threat.moves.slice(0, 2).map((move) => ({ threat, move, field })))
    .map((scenario) => {
      const damage = threatDamage(userState, scenario);
      if (!Number.isFinite(damage.maxPct)) return null;
      const { baselineDamage, baselinePoints } = baselineFor(scenario);
      const points = bulkPoints(userState, scenario, options);
      return {
        scenario,
        baselineDamage,
        baselinePoints,
        damage,
        points,
        covered: koHitCount(damage) > koHitCount(baselineDamage),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.damage.maxPct - a.damage.maxPct ||
      a.scenario.threat.pokemon.name.localeCompare(b.scenario.threat.pokemon.name) ||
      a.scenario.move.name.localeCompare(b.scenario.move.name));
}

export function bulkCoverage(userState, matchups, { budget, tables } = {}) {
  const originHits = Math.min(...matchups.map(({ baselineDamage }) =>
    koHitCount(baselineDamage)));
  const targetHits = Math.min(6, originHits + 1);
  const currentHits = Math.min(...matchups.map(({ damage }) =>
    koHitCount(damage)));

  if (originHits === 6) {
    return { status: "covered", originHits, targetHits, currentHits, requiredSp: 0 };
  }

  const coverageTables = tables ?? matchups.map((matchup) =>
    bulkCoverageTable(userState, matchup));
  const requiredSp = minimumJointAllocation(coverageTables, targetHits, budget)?.totalSp ?? Infinity;
  // Possible means the SP still unassigned reaches the next tier on top of the current spread;
  // a tier that only moving defensive SP reaches is unreachable (see coverageRespread).
  const status = currentHits >= targetHits
    ? "covered"
    : Number.isFinite(requiredSp) &&
        reachableByAdding(coverageTables, targetHits, budget, currentDefensiveSp(userState))
      ? "possible"
      : "unreachable";
  return { status, originHits, targetHits, currentHits, requiredSp };
}

// An "unreachable" card can still have a re-spread: a joint HP/Def/SpD allocation within the bulk
// budget that reaches the next tier by taking SP away from a defensive stat the current spread has
// invested. This returns the one that keeps the most current SP, with any SP left in the budget
// given back to the stats it was taken from, and the worst KO text it leaves across the card's
// moves. Null when no allocation reaches the tier or no SP has to move.
export function coverageRespread(userState, matchups, coverage, { budget, tables } = {}) {
  if (coverage?.status !== "unreachable" || coverage.currentHits >= coverage.targetHits) return null;
  const coverageTables = tables ?? matchups.map((matchup) =>
    bulkCoverageTable(userState, matchup));
  const current = currentDefensiveSp(userState);
  const allocation = closestJointAllocation(
    coverageTables,
    coverage.targetHits,
    budget,
    current,
  );
  if (!allocation) return null;
  if (DEFENSIVE_STATS.every((stat) => allocation.sp[stat] >= current[stat])) return null;

  const sp = { ...allocation.sp };
  let leftover = Math.max(0, Math.trunc(Number(budget) || 0) - allocation.totalSp);
  const restoreOrder = [...DEFENSIVE_STATS].sort((left, right) =>
    (current[right] - sp[right]) - (current[left] - sp[left]));
  for (const stat of restoreOrder) {
    const restored = Math.min(leftover, Math.max(0, current[stat] - sp[stat]));
    sp[stat] += restored;
    leftover -= restored;
  }

  const state = { ...userState, sp: { ...userState.sp, ...sp } };
  const damages = matchups.map(({ scenario }) => threatDamage(state, scenario));
  return {
    sp,
    totalSp: DEFENSIVE_STATS.reduce((total, stat) => total + sp[stat], 0),
    movedFrom: DEFENSIVE_STATS.filter((stat) => sp[stat] < current[stat]),
    fromKoText: worstDamage(matchups.map(({ damage }) => damage)).koText,
    koText: worstDamage(damages).koText,
    maxPct: Math.max(...damages.map(({ maxPct }) => maxPct)),
  };
}

function worstDamage(damages) {
  return damages.reduce((left, right) => compareKoTiers(left, right) >= 0 ? left : right);
}

export function bulkCoverageTable(userState, { scenario }) {
  const baselineState = zeroBulkState(userState);
  const initial = damageResult(baselineState, scenario);
  const defenseStat = initial.defenseStat ?? defenseStatForMove(scenario.move);
  const tiers = Array.from({ length: 33 }, () => new Uint8Array(33));
  if (requiresFullCoverageGrid(baselineState, scenario, initial)) {
    fillFullCoverageGrid(tiers, baselineState, scenario, defenseStat);
    return { defenseStat, tiers };
  }

  const hpValues = Array.from({ length: 33 }, (_, hpSp) => calculateStat({
    base: baselineState.pokemon.baseStats.hp,
    stat: "hp",
    sp: hpSp,
    nature: baselineState.nature,
  }));
  for (let defSp = 0; defSp <= 32; defSp += 1) {
    const state = withAllocation(baselineState, 0, defSp, defenseStat);
    const result = damageResult(state, scenario);
    // Damage does not depend on the defender's HP here, so one calculation per defence value
    // serves the whole HP column. The first use can differ from later ones (resist berries,
    // Multiscale): a KO within n hits is possible exactly when the strongest first use plus
    // n - 1 strongest later uses reach the HP, which is when the engine's KO chance turns positive.
    const firstMax = result.supported ? maximumDamage(result.distribution) : 0;
    const repeatMax = result.supported
      ? maximumDamage(result.repeatDistribution ?? result.distribution)
      : 0;
    for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
      tiers[hpSp][defSp] = result.supported
        ? hitsToKo(hpValues[hpSp], firstMax, repeatMax)
        : 0;
    }
  }
  return { defenseStat, tiers };
}

function maximumDamage(distribution = []) {
  return distribution.reduce((maximum, { damage }) => Math.max(maximum, damage), 0);
}

// Fewest uses that can KO `hp` (1-5), or 6 when five uses cannot, matching koHitCount.
function hitsToKo(hp, firstMax, repeatMax) {
  if (firstMax >= hp) return 1;
  if (repeatMax <= 0) return 6;
  return Math.min(6, 1 + Math.ceil((hp - firstMax) / repeatMax));
}

// `budget` is the SP still available for HP + Def + SpD together (the builder passes
// 66 - Atk - SpA - Spe). Only HP and the attacked defence stat move here, so the SP already
// in the other defence stat is spent and cannot be offered again; each stat also caps at 32.
export function bulkPoints(userState, scenario, { budget = 66 } = {}) {
  const initial = damageResult(userState, scenario);
  if (!initial.supported) return [];

  const defenseStat = initial.defenseStat ?? defenseStatForMove(scenario.move);
  const otherDefenseStat = defenseStat === "def" ? "spd" : "def";
  const otherDefenseSp = normalizeSp(userState.sp?.[otherDefenseStat]);
  const maximumBudget = Math.max(0, Math.min(
    64,
    Math.trunc(Number(budget) || 0) - otherDefenseSp,
  ));
  const currentHpSp = normalizeSp(userState.sp?.hp);
  const currentDefSp = normalizeSp(userState.sp?.[defenseStat]);
  const currentTotalSp = currentHpSp + currentDefSp;
  if (currentTotalSp >= maximumBudget) return [];
  const allocations = new Map();
  const allocationAtCost = (totalSp) => {
    if (!allocations.has(totalSp)) {
      allocations.set(totalSp, bestAllocationAtCost(
        userState,
        scenario,
        totalSp,
        defenseStat,
        currentHpSp,
        currentDefSp,
      ));
    }
    return allocations.get(totalSp);
  };
  let previousTier = allocationAtCost(currentTotalSp)?.damage;
  const maximum = allocationAtCost(maximumBudget);
  if (!previousTier || !maximum ||
      koHitCount(maximum.damage) <= koHitCount(previousTier)) return [];

  const frontier = [];
  const maximumHits = koHitCount(maximum.damage);
  let targetHits = koHitCount(previousTier) + 1;

  while (targetHits <= maximumHits) {
    let lowerCost = currentTotalSp + 1;
    let upperCost = maximumBudget;
    while (lowerCost < upperCost) {
      const middleCost = Math.floor((lowerCost + upperCost) / 2);
      const middle = allocationAtCost(middleCost);
      if (middle && koHitCount(middle.damage) >= targetHits) upperCost = middleCost;
      else lowerCost = middleCost + 1;
    }
    const bestAtCost = allocationAtCost(lowerCost);
    if (!bestAtCost) break;

    frontier.push({
      hpSp: bestAtCost.hpSp,
      defSp: bestAtCost.defSp,
      totalSp: lowerCost,
      fromKoText: previousTier.koText,
      achieves: survivalText(bestAtCost.damage),
      koText: bestAtCost.damage.koText,
      ko: bestAtCost.damage.ko,
      maxPct: bestAtCost.damage.maxPct,
    });
    previousTier = bestAtCost.damage;
    targetHits = koHitCount(previousTier) + 1;
  }

  return frontier;
}

function bestAllocationAtCost(
  userState,
  scenario,
  totalSp,
  defenseStat,
  currentHpSp,
  currentDefSp,
) {
  const candidates = [];
  for (let hpSp = currentHpSp; hpSp <= 32; hpSp += 1) {
    const defSp = totalSp - hpSp;
    if (defSp < currentDefSp || defSp > 32) continue;
    const state = withAllocation(userState, hpSp, defSp, defenseStat);
    const damage = threatDamage(state, scenario);
    candidates.push({ hpSp, defSp, totalSp, damage });
  }
  return candidates.sort((a, b) =>
    compareKoTiers(a.damage, b.damage) ||
    a.damage.maxPct - b.damage.maxPct ||
    a.hpSp - b.hpSp)[0];
}

function defensiveStats(userState, sp) {
  return Object.fromEntries(["hp", "def", "spd"].map((stat) => [
    stat,
    calculateStat({
      base: userState.pokemon.baseStats[stat],
      stat,
      sp: sp[stat],
      nature: userState.nature ?? "Hardy",
    }),
  ]));
}

function mixedBulkScore({ hp, def, spd }) {
  // Inverse of equal-weight physical + special fractional damage, up to a constant.
  return (hp * def * spd) / (def + spd);
}

function betterGeneralBulk(candidate, current) {
  if (!current || candidate.score !== current.score) return !current || candidate.score > current.score;
  const candidateWorstBulk = candidate.stats.hp * Math.min(candidate.stats.def, candidate.stats.spd);
  const currentWorstBulk = current.stats.hp * Math.min(current.stats.def, current.stats.spd);
  if (candidateWorstBulk !== currentWorstBulk) return candidateWorstBulk > currentWorstBulk;
  const candidateGap = Math.abs(candidate.stats.def - candidate.stats.spd);
  const currentGap = Math.abs(current.stats.def - current.stats.spd);
  if (candidateGap !== currentGap) return candidateGap < currentGap;
  return candidate.sp.hp > current.sp.hp;
}

function damageResult(userState, { threat, move, field = createField() }) {
  return calculateDamage({
    attacker: threat.pokemon,
    defender: userState.pokemon,
    move,
    attackerState: threatState(threat, move),
    defenderState: withoutFocusSash({ ...userState, currentHpFraction: 1 }),
    field,
  });
}

/**
 * Bulk and Break points size SP against raw damage, so a held Focus Sash is left out: at full HP
 * it would turn every OHKO into a survival regardless of SP (docs/DECISIONS.md, 2026-11-18).
 */
export function withoutFocusSash(state) {
  return normalizeId(state?.item?.id ?? state?.item?.name) === "focussash" ? { ...state, item: null } : state;
}

/**
 * The ladder spread group a bulk point assumes for the attacker: the most used group for the
 * stat `move` attacks with, or null when the threat has none (no ladder spreads, or the user
 * edited its build).
 */
export function bulkAttackerSpread(threat, move) {
  const attackStat = move?.overrideOffensiveStat ?? (move?.category === "Physical" ? "atk" : "spa");
  return threat?.usageSpreads?.[attackStat] ?? null;
}

function threatState(threat, move) {
  return threatSideState(threat, bulkAttackerSpread(threat, move), {
    atk: threat.spPresets?.offense?.atk ?? 32,
    spa: threat.spPresets?.offense?.spa ?? 32,
  });
}

/**
 * Battle state for an opposing threat at full HP with no stages. `group` is the Smogon spread
 * group picked for the move (its nature and SP win); without one, `fallbackSp` fills the SP
 * the calculation reads (offense for Bulk points, bulk for Break points) and the rest stay 0.
 */
export function threatSideState(threat, group, fallbackSp = {}) {
  return {
    pokemon: threat.pokemon,
    nature: group?.nature ?? threat.nature ?? "Hardy",
    sp: group ? { ...group.sp } : { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...fallbackSp },
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: threat.ability ?? null,
    item: threat.item ?? null,
    teraType: threat.teraType ?? "",
    status: threat.status ?? "",
    soaked: threat.soaked ?? false,
    currentHpFraction: 1,
    iceFaceIntact: true,
  };
}

function withAllocation(userState, hpSp, defSp, defenseStat) {
  return {
    ...userState,
    sp: { ...userState.sp, hp: hpSp, [defenseStat]: defSp },
  };
}

function defenseStatForMove(move) {
  return move.overrideDefensiveStat ?? (move.category === "Physical" ? "def" : "spd");
}

// KO helpers take a damage summary (`{ ko, koText }` from threatDamage, yourDamage or a bulk point)
// and read its structured `ko`; plain English KO text (or a summary without `ko`) falls back to
// parsing the text.
function structuredKo(value) {
  return value && typeof value === "object" && "ko" in value ? value.ko : undefined;
}

function koTextOf(value) {
  return value && typeof value === "object" ? value.koText ?? value.achieves : value;
}

/** Whether the first KO the summary reaches is guaranteed (a guaranteed OHKO … 5HKO). */
export function koIsGuaranteed(input) {
  const ko = structuredKo(input);
  if (ko !== undefined) return Boolean(ko?.hits) && ko.chance >= 1;
  return /guaranteed/i.test(String(koTextOf(input) ?? ""));
}

function koTierValue(input) {
  const ko = structuredKo(input);
  if (ko !== undefined) {
    if (!ko?.hits) return 0;
    // Chances compare at the 0.1% the KO text shows, so a tier never "improves" invisibly.
    return (6 - ko.hits) * 2 + (ko.chance >= 1 ? 1 : Math.max(0, Math.round(ko.chance * 1000) / 1000));
  }
  const value = String(koTextOf(input) ?? "");
  if (/not a KO|survives with/i.test(value)) return 0;

  const label = /(OHKO|([2-5])HKO)/i.exec(value);
  if (!label) return 0;
  const hits = label[1].toUpperCase() === "OHKO" ? 1 : Number(label[2]);
  const tierBase = (6 - hits) * 2;
  if (/guaranteed/i.test(value)) return tierBase + 1;
  const chance = Number(/([\d.]+)%/.exec(value)?.[1] ?? 0);
  return tierBase + Math.max(0, Math.min(100, chance)) / 100;
}

export function koHitCount(input) {
  const ko = structuredKo(input);
  if (ko !== undefined) return ko === null ? 0 : ko.hits ?? 6;
  const value = String(koTextOf(input) ?? "");
  if (/not a KO|survives with/i.test(value)) return 6;

  const label = /(OHKO|([2-5])HKO)/i.exec(value);
  if (!label) return 0;
  return label[1].toUpperCase() === "OHKO" ? 1 : Number(label[2]);
}

const DEFENSIVE_STATS = ["hp", "def", "spd"];

function minimumJointAllocation(tables, targetHits, budget) {
  const maximumBudget = Math.max(0, Math.min(96, Math.trunc(Number(budget) || 0)));

  for (let totalSp = 0; totalSp <= maximumBudget; totalSp += 1) {
    for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
      for (let defSp = 0; defSp <= 32; defSp += 1) {
        const spdSp = totalSp - hpSp - defSp;
        if (spdSp < 0 || spdSp > 32) continue;
        if (coversAll(tables, targetHits, hpSp, defSp, spdSp)) {
          return { totalSp, sp: { hp: hpSp, def: defSp, spd: spdSp } };
        }
      }
    }
  }
  return null;
}

// The covering allocation within `budget` that keeps the most SP where `current` has it, then
// the cheapest of those, so a re-spread moves as little SP as it can.
function closestJointAllocation(tables, targetHits, budget, current) {
  const maximumBudget = Math.max(0, Math.min(96, Math.trunc(Number(budget) || 0)));
  let best = null;
  for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
    for (let defSp = 0; defSp <= 32; defSp += 1) {
      for (let spdSp = 0; spdSp <= 32; spdSp += 1) {
        const totalSp = hpSp + defSp + spdSp;
        if (totalSp > maximumBudget) break;
        if (!coversAll(tables, targetHits, hpSp, defSp, spdSp)) continue;
        const sp = { hp: hpSp, def: defSp, spd: spdSp };
        const kept = DEFENSIVE_STATS.reduce((total, stat) =>
          total + Math.min(sp[stat], current[stat]), 0);
        if (!best || kept > best.kept || (kept === best.kept && totalSp < best.totalSp)) {
          best = { totalSp, sp, kept };
        }
      }
    }
  }
  return best && { totalSp: best.totalSp, sp: best.sp };
}

function reachableByAdding(tables, targetHits, budget, current) {
  const maximumBudget = Math.max(0, Math.min(96, Math.trunc(Number(budget) || 0)));
  for (let hpSp = current.hp; hpSp <= 32; hpSp += 1) {
    for (let defSp = current.def; defSp <= 32; defSp += 1) {
      for (let spdSp = current.spd; spdSp <= 32; spdSp += 1) {
        if (hpSp + defSp + spdSp > maximumBudget) break;
        if (coversAll(tables, targetHits, hpSp, defSp, spdSp)) return true;
      }
    }
  }
  return false;
}

function currentDefensiveSp(userState) {
  return Object.fromEntries(DEFENSIVE_STATS.map((stat) => [stat, normalizeSp(userState.sp?.[stat])]));
}

function coversAll(tables, targetHits, hpSp, defSp, spdSp) {
  return tables.every(({ defenseStat, tiers }) =>
    tiers[hpSp][defenseStat === "def" ? defSp : spdSp] >= targetHits);
}

function fillFullCoverageGrid(tiers, userState, scenario, defenseStat) {
  for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
    for (let defSp = 0; defSp <= 32; defSp += 1) {
      const state = withAllocation(userState, hpSp, defSp, defenseStat);
      tiers[hpSp][defSp] = koHitCount(threatDamage(state, scenario));
    }
  }
}

// The fast table assumes every use deals the same damage after the first. Sturdy, Ice Face,
// HP-based moves and recovery between hits (Leftovers, Sitrus Berry, Grassy Terrain) break that,
// so those scenarios ask the engine for every cell instead.
function requiresFullCoverageGrid(userState, scenario, result) {
  const abilityId = normalizeId(userState.ability?.id ?? userState.ability?.name);
  const moveId = normalizeId(scenario.move.id ?? scenario.move.name);
  return ["sturdy", "iceface"].includes(abilityId) ||
    ["endeavor", "superfang", "ruination", "naturesmadness"].includes(moveId) ||
    hasRecovery(result);
}

// Healing depends on item, ability, field and the attacker (Unnerve), never on SP, so the
// zero-bulk calculation answers for the whole grid.
function hasRecovery(result) {
  return Boolean(result?.supported && result.recovers);
}

function bulkCoverageRank({ coverage }) {
  return [
    coverage.originHits,
    Number.isFinite(coverage.requiredSp) ? coverage.requiredSp : Infinity,
  ];
}

function compareRanks([leftTier, leftSp], [rightTier, rightSp]) {
  return leftTier - rightTier || leftSp - rightSp;
}

function survivalText(damage) {
  const hits = koHitCount(damage);
  if (hits === 6) return "not KO'd within 5 hits";
  if (hits === 1 && damage.ko.chance >= 1) return "cannot survive 1 hit";
  if (hits === 1) return `survives 1 hit (${((1 - damage.ko.chance) * 100).toFixed(1)}% chance)`;
  return `survives 1 hit (guaranteed) · ${damage.koText}`;
}

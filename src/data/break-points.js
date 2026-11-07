import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";
import { NATURES } from "../engine/natures.js";
import { compareKoTiers, koHitCount, threatSideState } from "./bulk-points.js";

export function rankBreakPointPokemonGroups(groups) {
  return groups.map((group) => ({
    ...group,
    analyses: [...(group.analyses ?? [])].sort(compareDamagePercentage),
  })).sort((left, right) => compareRanks(
    breakPointPokemonRank(left),
    breakPointPokemonRank(right),
  ));
}

export function yourDamage(userState, move, scenario) {
  return yourDamageAnalysis(userState, move, scenario).damage;
}

export function yourDamageAnalysis(userState, move, scenario) {
  const result = damageResult(userState, move, scenario);
  if (!result.supported) {
    return {
      attackStat: null,
      damage: {
        minPct: null,
        maxPct: null,
        koText: result.reason ?? "Unsupported",
      },
    };
  }
  return {
    attackStat: result.attackStat ?? (move.category === "Physical" ? "atk" : "spa"),
    damage: {
      minPct: result.minPercent,
      maxPct: result.maxPercent,
      koText: result.ko.text,
    },
  };
}

export function breakPoints(userState, move, scenario) {
  const initialResult = damageResult(userState, move, scenario);
  if (!initialResult.supported) return [];

  const attackStat = initialResult.attackStat ?? (move.category === "Physical" ? "atk" : "spa");
  const currentSp = Math.max(0, Math.min(32, Math.trunc(userState.sp?.[attackStat] ?? 0)));
  let best = yourDamage(withOffense(userState, attackStat, currentSp), move, scenario);
  const points = [];

  for (let sp = currentSp + 1; sp <= 32; sp += 1) {
    const damage = yourDamage(withOffense(userState, attackStat, sp), move, scenario);
    if (compareKoTiers(damage.koText, best.koText) <= 0) continue;
    points.push(point(sp, damage, false));
    best = damage;
  }

  const maximumCurrentNature = yourDamage(withOffense(userState, attackStat, 32), move, scenario);
  const plusNature = plusNatureFor(attackStat, userState.nature);
  if (plusNature) {
    let exceedsMaximum = false;
    let bestGuaranteedHits = koHitCount(initialResult.ko.text);
    if (bestGuaranteedHits === 1 && !/guaranteed/i.test(initialResult.ko.text)) {
      bestGuaranteedHits = 2;
    }
    for (let sp = currentSp; sp <= 32; sp += 1) {
      const plusState = {
        ...withOffense(userState, attackStat, sp),
        nature: plusNature,
      };
      const damage = yourDamage(plusState, move, scenario);
      const firstBeyondMaximum = !exceedsMaximum &&
        compareKoTiers(damage.koText, maximumCurrentNature.koText) > 0;
      const hits = koHitCount(damage.koText);
      const improvesGuaranteedHits = /guaranteed/i.test(damage.koText) &&
        hits > 0 && hits < bestGuaranteedHits;
      if (!firstBeyondMaximum && !improvesGuaranteedHits) continue;
      points.push(point(sp, damage, true));
      if (firstBeyondMaximum) exceedsMaximum = true;
      if (improvesGuaranteedHits) bestGuaranteedHits = hits;
    }
  }

  return points.sort((a, b) => a.sp - b.sp || Number(a.requiresPlusNature) - Number(b.requiresPlusNature));
}

function point(sp, damage, requiresPlusNature) {
  return {
    sp,
    achieves: damage.koText,
    minPct: damage.minPct,
    maxPct: damage.maxPct,
    ...(requiresPlusNature ? { requiresPlusNature: true } : {}),
  };
}

function damageResult(userState, move, { threat, field = createField(), critical = false, moveOptions = {} }) {
  return calculateDamage({
    attacker: userState.pokemon,
    defender: threat.pokemon,
    move,
    attackerState: { ...userState, currentHpFraction: 1 },
    defenderState: threatState(threat, move),
    field,
    critical,
    moveOptions,
  });
}

/**
 * The ladder spread group a break point assumes for the target: the most used group for its HP
 * and the defense `move` hits, or null when the threat has none (no ladder spreads, or the
 * user edited its build).
 */
export function breakTargetSpread(threat, move) {
  const defenseStat = move?.overrideDefensiveStat ?? (move?.category === "Physical" ? "def" : "spd");
  return threat?.usageSpreads?.[defenseStat] ?? null;
}

function threatState(threat, move) {
  return threatSideState(threat, breakTargetSpread(threat, move), {
    hp: threat.spPresets?.bulk?.hp ?? 0,
    def: threat.spPresets?.bulk?.def ?? 0,
    spd: threat.spPresets?.bulk?.spd ?? 0,
  });
}

function plusNatureFor(stat, currentNature) {
  if (NATURES[currentNature]?.up === stat) return "";
  if (stat === "atk") return "Adamant";
  if (stat === "spa") return "Modest";
  return "";
}

function withOffense(userState, stat, sp) {
  return {
    ...userState,
    sp: { ...userState.sp, [stat]: sp },
  };
}

function breakPointPokemonRank(group) {
  return breakPointAnalysisRank(group.analyses?.[0]);
}

function breakPointAnalysisRank(analysis) {
  const currentHits = koHitCount(analysis?.damage?.koText);
  if (currentHits < 1) return [Infinity, Infinity];
  const targetHits = Math.max(1, currentHits - 1);
  const targetSp = Math.min(...(analysis?.points ?? [])
    .filter(({ achieves }) => /guaranteed/i.test(achieves) && koHitCount(achieves) <= targetHits)
    .map(({ sp }) => Number(sp))
    .filter(Number.isFinite));
  return Number.isFinite(targetSp) ? [currentHits, targetSp] : [Infinity, Infinity];
}

function compareDamagePercentage(left, right) {
  const leftDamage = maximumDamagePercentage(left);
  const rightDamage = maximumDamagePercentage(right);
  if (leftDamage === rightDamage) return 0;
  return leftDamage > rightDamage ? -1 : 1;
}

function maximumDamagePercentage(analysis) {
  const value = Number(analysis?.damage?.maxPct);
  return Number.isFinite(value) ? value : -Infinity;
}

function compareRanks(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

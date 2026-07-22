import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";
import { NATURES } from "../engine/natures.js";
import { compareKoTiers, koHitCount } from "./bulk-points.js";

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
  const result = damageResult(userState, move, scenario);
  if (!result.supported) {
    return {
      minPct: null,
      maxPct: null,
      koText: result.reason ?? "Unsupported",
    };
  }
  return {
    minPct: result.minPercent,
    maxPct: result.maxPercent,
    koText: result.ko.text,
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
    for (let sp = currentSp; sp <= 32; sp += 1) {
      const plusState = {
        ...withOffense(userState, attackStat, sp),
        nature: plusNature,
      };
      const damage = yourDamage(plusState, move, scenario);
      if (compareKoTiers(damage.koText, maximumCurrentNature.koText) <= 0) continue;
      points.push(point(sp, damage, true));
      break;
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

function damageResult(userState, move, { threat }) {
  return calculateDamage({
    attacker: userState.pokemon,
    defender: threat.pokemon,
    move,
    attackerState: { ...userState, currentHpFraction: 1 },
    defenderState: threatState(threat),
    field: createField(),
  });
}

function threatState(threat) {
  return {
    pokemon: threat.pokemon,
    nature: threat.nature ?? "Hardy",
    sp: {
      hp: threat.spPresets?.bulk?.hp ?? 0,
      atk: 0,
      def: threat.spPresets?.bulk?.def ?? 0,
      spa: 0,
      spd: threat.spPresets?.bulk?.spd ?? 0,
      spe: 0,
    },
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: threat.ability ?? null,
    item: threat.item ?? null,
    teraType: threat.teraType ?? "",
    status: "",
    currentHpFraction: 1,
    iceFaceIntact: true,
  };
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
  const analyses = group.analyses ?? [];
  const maximumDamage = Math.max(...analyses.map(maximumDamagePercentage), -Infinity);
  let best = [Infinity, Infinity];
  for (const analysis of analyses) {
    if (maximumDamagePercentage(analysis) !== maximumDamage) continue;
    best = bestRank(best, breakPointAnalysisRank(analysis));
  }
  return best;
}

function breakPointAnalysisRank(analysis) {
  const targets = [];
  const currentHits = guaranteedKoHitCount(analysis?.damage?.koText);
  if (Number.isFinite(currentHits)) targets.push({ hits: currentHits, sp: 0 });
  for (const point of analysis?.points ?? []) {
    const hits = guaranteedKoHitCount(point?.achieves);
    const sp = Number(point?.sp);
    if (Number.isFinite(hits) && Number.isFinite(sp)) targets.push({ hits, sp });
  }
  const best = targets.sort((left, right) => left.hits - right.hits || left.sp - right.sp)[0];
  return best ? [best.hits, best.sp] : [Infinity, Infinity];
}

function bestRank(current, candidate) {
  return compareRanks(candidate, current) < 0 ? candidate : current;
}

function guaranteedKoHitCount(text) {
  if (!/guaranteed/i.test(String(text ?? ""))) return Infinity;
  const hits = koHitCount(text);
  return hits >= 1 ? hits : Infinity;
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

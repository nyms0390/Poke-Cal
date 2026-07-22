import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";

export function compareKoTiers(left, right) {
  return koTierValue(left) - koTierValue(right);
}

export function rankBulkPokemonGroups(groups) {
  return [...groups].sort((left, right) =>
    compareMaximumDamage(left, right) ||
    compareRanks(
      bulkPokemonRank(left),
      bulkPokemonRank(right),
    ));
}

export function threatDamage(userState, scenario) {
  const result = damageResult(userState, scenario);
  if (!result.supported) {
    return { minPct: null, maxPct: null, koText: result.reason ?? "Unsupported" };
  }
  return {
    minPct: result.minPercent,
    maxPct: result.maxPercent,
    koText: result.ko.text,
  };
}

export function bulkPointMatchups(userState, threats, options) {
  return threats
    .flatMap((threat) => threat.moves.slice(0, 2).map((move) => ({ threat, move })))
    .map((scenario) => {
      const damage = threatDamage(userState, scenario);
      if (!Number.isFinite(damage.maxPct)) return null;
      const points = bulkPoints(userState, scenario, options);
      return { scenario, damage, points };
    })
    .filter(Boolean)
    .sort((a, b) => b.damage.maxPct - a.damage.maxPct ||
      a.scenario.threat.pokemon.name.localeCompare(b.scenario.threat.pokemon.name) ||
      a.scenario.move.name.localeCompare(b.scenario.move.name));
}

export function bulkPoints(userState, scenario, { budget = 64 } = {}) {
  const initial = damageResult(userState, scenario);
  if (!initial.supported) return [];

  const defenseStat = initial.defenseStat ?? defenseStatForMove(scenario.move);
  const maximumBudget = Math.max(0, Math.min(64, Math.trunc(Number(budget) || 0)));
  const currentHpSp = clampSp(userState.sp?.hp);
  const currentDefSp = clampSp(userState.sp?.[defenseStat]);
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
      koHitCount(maximum.damage.koText) <= koHitCount(previousTier.koText)) return [];

  const frontier = [];
  const maximumHits = koHitCount(maximum.damage.koText);
  let targetHits = koHitCount(previousTier.koText) + 1;

  while (targetHits <= maximumHits) {
    let lowerCost = currentTotalSp + 1;
    let upperCost = maximumBudget;
    while (lowerCost < upperCost) {
      const middleCost = Math.floor((lowerCost + upperCost) / 2);
      const middle = allocationAtCost(middleCost);
      if (middle && koHitCount(middle.damage.koText) >= targetHits) upperCost = middleCost;
      else lowerCost = middleCost + 1;
    }
    const bestAtCost = allocationAtCost(lowerCost);
    if (!bestAtCost) break;

    frontier.push({
      hpSp: bestAtCost.hpSp,
      defSp: bestAtCost.defSp,
      totalSp: lowerCost,
      fromKoText: previousTier.koText,
      achieves: survivalText(bestAtCost.damage.koText),
      koText: bestAtCost.damage.koText,
      maxPct: bestAtCost.damage.maxPct,
    });
    previousTier = bestAtCost.damage;
    targetHits = koHitCount(previousTier.koText) + 1;
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
    compareKoTiers(a.damage.koText, b.damage.koText) ||
    a.damage.maxPct - b.damage.maxPct ||
    a.hpSp - b.hpSp)[0];
}

function clampSp(value) {
  const sp = Number(value);
  if (!Number.isFinite(sp)) return 0;
  return Math.max(0, Math.min(32, Math.trunc(sp)));
}

function damageResult(userState, { threat, move }) {
  return calculateDamage({
    attacker: threat.pokemon,
    defender: userState.pokemon,
    move,
    attackerState: threatState(threat),
    defenderState: { ...userState, currentHpFraction: 1 },
    field: createField(),
  });
}

function threatState(threat) {
  return {
    pokemon: threat.pokemon,
    nature: threat.nature ?? "Hardy",
    sp: {
      hp: 0,
      atk: threat.spPresets?.offense?.atk ?? 32,
      def: 0,
      spa: threat.spPresets?.offense?.spa ?? 32,
      spd: 0,
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

function withAllocation(userState, hpSp, defSp, defenseStat) {
  return {
    ...userState,
    sp: { ...userState.sp, hp: hpSp, [defenseStat]: defSp },
  };
}

function defenseStatForMove(move) {
  return move.overrideDefensiveStat ?? (move.category === "Physical" ? "def" : "spd");
}

function koTierValue(text) {
  const value = String(text ?? "");
  if (/not a KO|survives with/i.test(value)) return 0;

  const label = /(OHKO|([2-5])HKO)/i.exec(value);
  if (!label) return 0;
  const hits = label[1].toUpperCase() === "OHKO" ? 1 : Number(label[2]);
  const tierBase = (6 - hits) * 2;
  if (/guaranteed/i.test(value)) return tierBase + 1;
  const chance = Number(/([\d.]+)%/.exec(value)?.[1] ?? 0);
  return tierBase + Math.max(0, Math.min(100, chance)) / 100;
}

export function koHitCount(text) {
  const value = String(text ?? "");
  if (/not a KO|survives with/i.test(value)) return 6;

  const label = /(OHKO|([2-5])HKO)/i.exec(value);
  if (!label) return 0;
  return label[1].toUpperCase() === "OHKO" ? 1 : Number(label[2]);
}

function bulkPokemonRank(group) {
  let best = [Infinity, Infinity];
  for (const matchup of group.matchups ?? []) {
    const point = matchup.points?.[0];
    const hits = koHitCount(point?.fromKoText ?? matchup.damage?.koText);
    const sp = Number(point?.totalSp);
    if (!point || hits < 1 || !Number.isFinite(sp)) continue;
    const candidate = [hits, sp];
    if (compareRanks(candidate, best) < 0) best = candidate;
  }
  return best;
}

function compareMaximumDamage(left, right) {
  const leftDamage = maximumDamagePercentage(left);
  const rightDamage = maximumDamagePercentage(right);
  if (leftDamage === rightDamage) return 0;
  return leftDamage > rightDamage ? -1 : 1;
}

function maximumDamagePercentage(group) {
  return Math.max(...(group.matchups ?? [])
    .map(({ damage }) => Number(damage?.maxPct))
    .filter(Number.isFinite), -Infinity);
}

function compareRanks([leftTier, leftSp], [rightTier, rightSp]) {
  return leftTier - rightTier || leftSp - rightSp;
}

function survivalText(koText) {
  if (/not a KO/i.test(koText)) return "not KO'd within 5 hits";
  if (/guaranteed OHKO/i.test(koText)) return "cannot survive 1 hit";
  const ohkoChance = Number(/([\d.]+)% chance to OHKO/i.exec(koText)?.[1]);
  if (Number.isFinite(ohkoChance)) {
    return `survives 1 hit (${(100 - ohkoChance).toFixed(1)}% chance)`;
  }
  return `survives 1 hit (guaranteed) · ${koText}`;
}

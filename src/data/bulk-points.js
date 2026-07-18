import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";

export function compareKoTiers(left, right) {
  return koTierValue(left) - koTierValue(right);
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

export function bulkPoints(userState, scenario, { budget = 64 } = {}) {
  const initial = damageResult(userState, scenario);
  if (!initial.supported) return [];

  const defenseStat = initial.defenseStat ?? defenseStatForMove(scenario.move);
  const maximumBudget = Math.max(0, Math.min(64, Math.trunc(Number(budget) || 0)));
  let previousTier = null;
  const frontier = [];

  for (let totalSp = 0; totalSp <= maximumBudget; totalSp += 1) {
    const candidates = [];
    for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
      const defSp = totalSp - hpSp;
      if (defSp < 0 || defSp > 32) continue;
      const state = withAllocation(userState, hpSp, defSp, defenseStat);
      const damage = threatDamage(state, scenario);
      candidates.push({ hpSp, defSp, totalSp, damage });
    }
    candidates.sort((a, b) =>
      compareKoTiers(a.damage.koText, b.damage.koText) ||
      a.damage.maxPct - b.damage.maxPct ||
      a.hpSp - b.hpSp);
    const bestAtCost = candidates[0];
    if (!bestAtCost) continue;

    if (previousTier === null) {
      previousTier = bestAtCost.damage;
      continue;
    }
    if (survivalHits(bestAtCost.damage.koText) <= survivalHits(previousTier.koText)) continue;

    frontier.push({
      hpSp: bestAtCost.hpSp,
      defSp: bestAtCost.defSp,
      totalSp,
      fromKoText: previousTier.koText,
      achieves: survivalText(bestAtCost.damage.koText),
      koText: bestAtCost.damage.koText,
      maxPct: bestAtCost.damage.maxPct,
    });
    previousTier = bestAtCost.damage;
  }

  return frontier;
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

function survivalHits(text) {
  const value = String(text ?? "");
  if (/not a KO|survives with/i.test(value)) return 6;

  const label = /(OHKO|([2-5])HKO)/i.exec(value);
  if (!label) return 0;
  return label[1].toUpperCase() === "OHKO" ? 1 : Number(label[2]);
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

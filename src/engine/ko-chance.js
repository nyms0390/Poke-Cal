function normalizeChance(chance) {
  return chance >= 1 - Number.EPSILON ? 1 : chance;
}

function hkoLabel(hits) {
  return hits === 1 ? "OHKO" : `${hits}HKO`;
}

// Convolve independent weighted damage distributions without enumerating every roll path.
export function convolveDistributions(distributions) {
  let totals = new Map([[0, 1]]);
  for (const distribution of distributions) {
    const next = new Map();
    for (const [total, probability] of totals) {
      for (const entry of distribution) {
        const nextTotal = total + entry.damage;
        next.set(nextTotal, (next.get(nextTotal) ?? 0) + probability * entry.chance);
      }
    }
    totals = next;
  }
  return [...totals].map(([damage, chance]) => ({ damage, chance }));
}

/**
 * Calculate exact KO probabilities from either uniform damage rolls or a weighted
 * full-move damage distribution. firstRollDistribution can model a one-time first-turn
 * effect such as Sturdy or Ice Face. hitsPerTurn is for callers whose input represents
 * one hit rather than one complete move.
 */
export function koChance({ rolls, rollDistribution, firstRollDistribution, targetHp, maxHits = 5, hitsPerTurn = 1, recovery = null }) {
  const moveDistribution = Array.isArray(rollDistribution) && rollDistribution.length > 0
    ? rollDistribution
    : (rolls ?? []).map((damage) => ({ damage, chance: 1 / rolls.length }));
  if (moveDistribution.length === 0 || targetHp <= 0) return [];
  if (recovery && (recovery.perTurn > 0 || recovery.pinchHeal > 0)) {
    return koChanceWithRecovery({ moveDistribution, firstRollDistribution, targetHp, maxHits, hitsPerTurn, recovery });
  }

  let totals = new Map([[0, 1]]);
  const results = [];
  const rollsPerTurn = Math.max(1, Math.floor(hitsPerTurn));
  let convolutionCount = 0;

  for (let hits = 1; hits <= maxHits; hits += 1) {
    for (let roll = 0; roll < rollsPerTurn; roll += 1) {
      const activeDistribution = convolutionCount === 0 && firstRollDistribution?.length
        ? firstRollDistribution
        : moveDistribution;
      const next = new Map();
      for (const [total, probability] of totals) {
        for (const entry of activeDistribution) {
          const nextTotal = total + entry.damage;
          next.set(nextTotal, (next.get(nextTotal) ?? 0) + probability * entry.chance);
        }
      }
      totals = next;
      convolutionCount += 1;
    }

    const chance = normalizeChance([...totals]
      .filter(([total]) => total >= targetHp)
      .reduce((sum, [, probability]) => sum + probability, 0));
    results.push({ hits, chance });
    if (chance === 1) break;
  }

  return results;
}

/**
 * KO probabilities when the target heals between hits. `recovery.pinchHeal` is a one-time
 * heal (Sitrus Berry) once HP falls to half or less after a move; `recovery.perTurn` is
 * end-of-turn healing (Leftovers, Black Sludge, Grassy Terrain). HP never exceeds maxHp.
 */
function koChanceWithRecovery({ moveDistribution, firstRollDistribution, targetHp, maxHits, hitsPerTurn, recovery }) {
  const maxHp = Math.max(targetHp, Math.trunc(recovery.maxHp ?? targetHp));
  const perTurn = Math.max(0, Math.trunc(recovery.perTurn ?? 0));
  const pinchHeal = Math.max(0, Math.trunc(recovery.pinchHeal ?? 0));
  // State key = remaining HP × 2 + (pinch berry already used ? 1 : 0).
  let states = new Map([[targetHp * 2 + (pinchHeal > 0 ? 0 : 1), 1]]);
  let knockedOut = 0;
  const results = [];
  const rollsPerTurn = Math.max(1, Math.floor(hitsPerTurn));
  let convolutionCount = 0;

  for (let hits = 1; hits <= maxHits; hits += 1) {
    for (let roll = 0; roll < rollsPerTurn; roll += 1) {
      const activeDistribution = convolutionCount === 0 && firstRollDistribution?.length
        ? firstRollDistribution
        : moveDistribution;
      const next = new Map();
      for (const [key, probability] of states) {
        const hp = Math.floor(key / 2);
        const used = key % 2 === 1;
        for (const entry of activeDistribution) {
          const weight = probability * entry.chance;
          let remaining = hp - entry.damage;
          if (remaining <= 0) {
            knockedOut += weight;
            continue;
          }
          let nowUsed = used;
          if (!used && remaining <= maxHp / 2) {
            remaining = Math.min(maxHp, remaining + pinchHeal);
            nowUsed = true;
          }
          const nextKey = remaining * 2 + (nowUsed ? 1 : 0);
          next.set(nextKey, (next.get(nextKey) ?? 0) + weight);
        }
      }
      states = next;
      convolutionCount += 1;
    }
    if (perTurn > 0) {
      const healed = new Map();
      for (const [key, probability] of states) {
        const hp = Math.min(maxHp, Math.floor(key / 2) + perTurn);
        const nextKey = hp * 2 + (key % 2);
        healed.set(nextKey, (healed.get(nextKey) ?? 0) + probability);
      }
      states = healed;
    }
    const chance = normalizeChance(knockedOut);
    results.push({ hits, chance });
    if (chance === 1) break;
  }
  return results;
}

export function koText(result, maxHits = 5) {
  const entries = Array.isArray(result) ? result : result ? [result] : [];
  const displayMaxHits = Array.isArray(result) && entries.length > 0 ? entries.length : maxHits;
  const ko = entries.find(({ chance }) => chance > 0);
  if (!ko) return `not a KO within ${displayMaxHits} hits`;
  if (ko.chance === 1) return `guaranteed ${hkoLabel(ko.hits)}`;
  return `${(ko.chance * 100).toFixed(1)}% chance to ${hkoLabel(ko.hits)}`;
}

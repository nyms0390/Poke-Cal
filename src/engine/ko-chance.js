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
 * full-move damage distribution. hitsPerTurn is for callers whose input represents
 * one hit rather than one complete move.
 */
export function koChance({ rolls, rollDistribution, targetHp, maxHits = 5, hitsPerTurn = 1 }) {
  const moveDistribution = Array.isArray(rollDistribution) && rollDistribution.length > 0
    ? rollDistribution
    : (rolls ?? []).map((damage) => ({ damage, chance: 1 / rolls.length }));
  if (moveDistribution.length === 0 || targetHp <= 0) return [];

  let totals = new Map([[0, 1]]);
  const results = [];
  const rollsPerTurn = Math.max(1, Math.floor(hitsPerTurn));

  for (let hits = 1; hits <= maxHits; hits += 1) {
    for (let roll = 0; roll < rollsPerTurn; roll += 1) {
      const next = new Map();
      for (const [total, probability] of totals) {
        for (const entry of moveDistribution) {
          const nextTotal = total + entry.damage;
          next.set(nextTotal, (next.get(nextTotal) ?? 0) + probability * entry.chance);
        }
      }
      totals = next;
    }

    const chance = normalizeChance([...totals]
      .filter(([total]) => total >= targetHp)
      .reduce((sum, [, probability]) => sum + probability, 0));
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

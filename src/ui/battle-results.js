export function mostEffectiveMoveIndex(results) {
  if (results.length === 0) return -1;

  let bestIndex = 0;
  let bestDamage = Number.NEGATIVE_INFINITY;
  for (const [index, result] of results.entries()) {
    const damage = result?.supported ? Number(result.maxPercent) : Number.NEGATIVE_INFINITY;
    if (damage > bestDamage) {
      bestIndex = index;
      bestDamage = damage;
    }
  }
  return bestIndex;
}

export function expandedMoveIndexAfterClick(currentIndex, clickedIndex) {
  return currentIndex === clickedIndex ? null : clickedIndex;
}

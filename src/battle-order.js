import { calculateStat } from "./damage.js";
import { formatMovePriority } from "./catalog.js";

export function compareMoveOrder({ attacker, defender, attackerMove, defenderMove, trickRoom = false }) {
  const attackerPriority = Number(attackerMove?.priority ?? 0);
  const defenderPriority = Number(defenderMove?.priority ?? 0);
  const attackerSpeed = finalSpeed(attacker);
  const defenderSpeed = finalSpeed(defender);

  if (attackerPriority !== defenderPriority) {
    const firstSide = attackerPriority > defenderPriority ? "attacker" : "defender";
    return {
      firstSide,
      attackerPriority,
      defenderPriority,
      attackerSpeed,
      defenderSpeed,
      reason: `${sideName(firstSide)} moves first by priority (${formatMovePriority(attackerPriority)} vs ${formatMovePriority(defenderPriority)}).`,
    };
  }

  if (attackerSpeed === defenderSpeed) {
    return {
      firstSide: "tie",
      attackerPriority,
      defenderPriority,
      attackerSpeed,
      defenderSpeed,
      reason: `Same priority (${formatMovePriority(attackerPriority)}) and Speed tie at ${attackerSpeed}.`,
    };
  }

  const firstSide = trickRoom
    ? attackerSpeed < defenderSpeed ? "attacker" : "defender"
    : attackerSpeed > defenderSpeed ? "attacker" : "defender";

  return {
    firstSide,
    attackerPriority,
    defenderPriority,
    attackerSpeed,
    defenderSpeed,
    reason: trickRoom
      ? `${sideName(firstSide)} moves first in Trick Room (${Math.min(attackerSpeed, defenderSpeed)} Speed).`
      : `${sideName(firstSide)} moves first by Speed (${Math.max(attackerSpeed, defenderSpeed)} Speed).`,
  };
}

export function finalSpeed(state) {
  if (!state?.pokemon) return 0;
  const baseSpeed = state.pokemon.baseStats?.spe ?? state.pokemon.baseSpeed;
  let speed = calculateStat({
    base: baseSpeed,
    stat: "spe",
    sp: state.sp?.spe ?? 0,
    nature: state.nature,
    stage: state.stages?.spe ?? 0,
  });

  speed = Math.floor(speed * Number(state.speedMultiplier ?? 1));
  if (state.tailwind) speed *= 2;
  if (state.paralyzed) speed = Math.floor(speed / 2);
  return Math.max(1, Math.min(10000, speed));
}

function sideName(side) {
  return side === "attacker" ? "Attacker" : "Defender";
}


import { formatMovePriority } from "./catalog.js";
import { finalSpeed } from "./speed.js";

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

function sideName(side) {
  return side === "attacker" ? "Attacker" : "Defender";
}

import { normalizeId } from "../identifiers.js";
import { finalSpeed } from "./speed.js";

export function formatMovePriority(priority) {
  const value = Number(priority ?? 0);
  return value > 0 ? `+${value}` : String(value);
}

export function compareMoveOrder({ attacker, defender, attackerMove, defenderMove, field = {}, trickRoom = field.trickRoom ?? false }) {
  const attackerPriority = Number(attackerMove?.priority ?? 0);
  const defenderPriority = Number(defenderMove?.priority ?? 0);
  const neutralizingGasActive = hasAbility(attacker, "neutralizinggas") || hasAbility(defender, "neutralizinggas");
  const weatherSuppressed = !neutralizingGasActive && (
    hasWeatherSuppressingAbility(attacker) || hasWeatherSuppressingAbility(defender)
  );
  const speedField = weatherSuppressed ? { ...field, weather: "" } : field;
  const speedOptions = { suppressAbility: neutralizingGasActive };
  const attackerSpeed = finalSpeed(attacker, speedField, speedOptions);
  const defenderSpeed = finalSpeed(defender, speedField, speedOptions);

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

function hasAbility(state, abilityId) {
  return normalizeId(state?.ability?.id ?? state?.ability?.name) === abilityId;
}

function hasWeatherSuppressingAbility(state) {
  return ["cloudnine", "airlock"].includes(normalizeId(state?.ability?.id ?? state?.ability?.name));
}

function sideName(side) {
  return side === "attacker" ? "Attacker" : "Defender";
}

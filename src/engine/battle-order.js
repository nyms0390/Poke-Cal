import { normalizeId } from "../identifiers.js";
import { isGrounded } from "./field.js";
import { finalSpeed } from "./speed.js";

export function formatMovePriority(priority) {
  const value = Number(priority ?? 0);
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Move priority after Showdown's ModifyPriority handlers: Gale Wings (+1 Flying moves at full
 * HP, Gen 7+), Prankster (+1 Status moves), Triage (+3 moves with the `heal` flag) and Grassy
 * Glide (+1 in Grassy Terrain while the user is grounded).
 *
 * options: { suppressAbility } – ignore the user's ability (Neutralizing Gas).
 */
export function effectivePriority(move, state = {}, field = {}, { suppressAbility = false } = {}) {
  if (!move) return 0;
  let priority = Number(move.priority ?? 0);
  const moveId = normalizeId(move.id ?? move.name);
  if (moveId === "grassyglide" && normalizeId(field.terrain) === "grassyterrain" &&
    isGrounded(state?.pokemon, state ?? {}, field)) {
    priority += 1;
  }
  if (suppressAbility) return priority;
  const abilityId = normalizeId(state?.ability?.id ?? state?.ability?.name);
  if (abilityId === "galewings" && move.type === "Flying" && Number(state?.currentHpFraction ?? 1) >= 1) {
    priority += 1;
  } else if (abilityId === "prankster" && move.category === "Status") {
    priority += 1;
  } else if (abilityId === "triage" && move.flags?.heal) {
    priority += 3;
  }
  return priority;
}

/** Field and options for Speed comparisons between two sides (Neutralizing Gas, Cloud Nine). */
export function speedComparisonContext(attacker, defender, field = {}) {
  const neutralizingGasActive = hasAbility(attacker, "neutralizinggas") || hasAbility(defender, "neutralizinggas");
  const weatherSuppressed = !neutralizingGasActive && (
    hasWeatherSuppressingAbility(attacker) || hasWeatherSuppressingAbility(defender)
  );
  return {
    field: weatherSuppressed ? { ...field, weather: "" } : field,
    options: { suppressAbility: neutralizingGasActive, suppressWeather: weatherSuppressed },
  };
}

export function compareMoveOrder({ attacker, defender, attackerMove, defenderMove, field = {}, trickRoom = field.trickRoom ?? false }) {
  const { field: speedField, options: speedOptions } = speedComparisonContext(attacker, defender, field);
  const priorityOptions = { suppressAbility: speedOptions.suppressAbility };
  const attackerPriority = effectivePriority(attackerMove, attacker, field, priorityOptions);
  const defenderPriority = effectivePriority(defenderMove, defender, field, priorityOptions);
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

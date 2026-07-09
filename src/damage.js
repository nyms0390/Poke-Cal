import { NATURES, natureMultiplier, natureOptionLabel } from "./engine/natures.js";
import { TYPE_EFFECTIVENESS } from "./engine/type-chart.js";
import { calculateStat, applyStage } from "./engine/stats.js";
import { createField } from "./engine/field.js";
import {
  moveEffect,
  isPledgeMove,
  USER_HP_POWER_MOVE_IDS,
  TARGET_WEIGHT_POWER_MOVE_IDS,
  USER_TARGET_WEIGHT_POWER_MOVE_IDS,
} from "./engine/move-effects.js";
import { collectModifiers } from "./engine/modifiers.js";

export { NATURES, natureMultiplier, natureOptionLabel };
export { calculateStat, applyStage };

const DAMAGE_ROLLS = [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
const SPREAD_MOVE_TARGETS = new Set(["allAdjacent", "allAdjacentFoes"]);
const HISTORY_BASE_POWER_MOVE_IDS = new Set([
  "echoedvoice",
  "furycutter",
  "iceball",
  "lashout",
  "lastrespects",
  "ragefist",
  "retaliate",
  "rollout",
  "stompingtantrum",
  "temperflare",
]);
const UNAVAILABLE_CONTEXT_BASE_POWER_MOVE_IDS = new Set([
  "fusionbolt",
  "fusionflare",
  "gust",
  "round",
  "twister",
]);

const UNSUPPORTED_MOVE_IDS = new Set([
  "seismictoss",
  "nightshade",
  "electroball",
  "terablast",
]);

export function typeEffectiveness(moveType, defenderTypes = [], move = null, defenderState = {}) {
  const moveId = normalizeId(move?.id ?? move?.name);
  if (moveId === "thousandarrows" && defenderTypes.includes("Flying")) {
    if (defenderState.grounded !== true) return 1;
    return defenderTypes.reduce((multiplier, defenderType) => {
      if (defenderType === "Flying") return multiplier;
      return multiplier * (TYPE_EFFECTIVENESS[moveType]?.[defenderType] ?? 1);
    }, 1);
  }
  return defenderTypes.reduce((multiplier, defenderType) => {
    if (moveId === "freezedry" && defenderType === "Water") return multiplier * 2;
    return multiplier * (TYPE_EFFECTIVENESS[moveType]?.[defenderType] ?? 1);
  }, 1);
}

export function unsupportedMoveReason(move) {
  if (!move) return "Missing move data.";
  const moveId = normalizeId(move.id ?? move.name);
  if (move.category === "Status") return "Status moves do not deal direct damage.";
  if (moveId === "beatup" || moveId === "naturalgift") return "";
  if (TARGET_WEIGHT_POWER_MOVE_IDS.has(normalizeId(move.id ?? move.name))) return "";
  if (USER_TARGET_WEIGHT_POWER_MOVE_IDS.has(normalizeId(move.id ?? move.name))) return "";
  if (fixedDamageKind(move)) return "";
  if ((move.damage && typeof move.damage !== "number") || move.damageCallback || move.ohko) {
    return "Fixed-damage moves are not supported.";
  }
  if (!move.basePower) return "Variable or zero base power is not supported.";
  if (UNSUPPORTED_MOVE_IDS.has(move.id)) return "Custom damage behavior is not supported.";
  if (!["Physical", "Special"].includes(move.category)) return "Only Physical and Special moves are supported.";
  return "";
}

export function calculateDamage({
  attacker,
  defender,
  move,
  attackerState,
  defenderState,
  field = createField(),
  critical = false,
}) {
  const { format: battleFormat, pledgeCombo = false } = field;
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };

  const ctx = { move, attacker, defender, attackerState, defenderState, field };
  const moveType = effectiveMoveType(ctx);
  const typeMultiplier = typeEffectiveness(moveType, defender.types, move, defenderState);
  const defenderHp = calculatePokemonStat(defender, defenderState, "hp");
  const attackerMaxHp = calculatePokemonStat(attacker, attackerState, "hp");
  ctx.defenderHp = defenderHp;
  ctx.attackerMaxHp = attackerMaxHp;
  const effectiveCritical = critical && (move.ignoreAbility || !hasAnyAbility(defenderState, ["battlearmor", "shellarmor"]));
  if (typeMultiplier === 0) {
    return {
      supported: true,
      rolls: DAMAGE_ROLLS.map(() => 0),
      minDamage: 0,
      maxDamage: 0,
      minPercent: 0,
      maxPercent: 0,
      defenderHp,
      typeMultiplier,
      notes: ["Immune"],
    };
  }

  const fixedDamage = fixedDamageValue(ctx);
  if (fixedDamage !== null) {
    const damage = Math.max(1, fixedDamage);
    const rolls = DAMAGE_ROLLS.map(() => damage);
    return {
      supported: true,
      rolls,
      minDamage: damage,
      maxDamage: damage,
      minPercent: percent(damage, defenderHp),
      maxPercent: percent(damage, defenderHp),
      defenderHp,
      typeMultiplier,
      notes: ["Fixed damage"],
    };
  }

  const moveId = normalizeId(move.id ?? move.name);
  const dynamicPower = effectiveMovePower(ctx);
  if (dynamicPower === null) {
    let reason = "Natural Gift requires a held Berry.";
    if (USER_TARGET_WEIGHT_POWER_MOVE_IDS.has(moveId)) {
      reason = `${move.name} requires attacker and defender weights.`;
    } else if (TARGET_WEIGHT_POWER_MOVE_IDS.has(moveId)) {
      reason = `${move.name} requires defender weight.`;
    }
    return { supported: false, reason };
  }
  let isPhysical = move.category === "Physical";
  let attackStat = move.overrideOffensiveStat ?? (isPhysical ? "atk" : "spa");
  let defenseStat = move.overrideDefensiveStat ?? (isPhysical ? "def" : "spd");
  const offensiveStatHandler = moveEffect(moveId).offensiveStat;
  if (offensiveStatHandler) {
    ctx.physicalAttack = calculatePokemonStat(attacker, attackerState, "atk", {
      stagePolicy: criticalStagePolicy("attack", effectiveCritical),
    });
    ctx.specialAttack = calculatePokemonStat(attacker, attackerState, "spa", {
      stagePolicy: criticalStagePolicy("attack", effectiveCritical),
    });
    attackStat = offensiveStatHandler(ctx);
    isPhysical = attackStat === "atk";
    defenseStat = isPhysical ? "def" : "spd";
  }
  const attackSource = move.overrideOffensivePokemon === "target"
    ? { pokemon: defender, state: defenderState }
    : { pokemon: attacker, state: attackerState };
  const attack = calculatePokemonStat(attackSource.pokemon, attackSource.state, attackStat, {
    stagePolicy: criticalStagePolicy("attack", effectiveCritical),
  });
  const defense = calculatePokemonStat(defender, defenderState, defenseStat, {
    ignoreStage: move.ignoreDefensive,
    stagePolicy: criticalStagePolicy("defense", effectiveCritical),
  });
  const notes = [];
  if (moveType !== move.type) notes.push(`${move.name} is ${moveType} type`);
  let power = dynamicPower ?? move.basePower;
  ctx.power = power;
  if (dynamicPower !== undefined) {
    notes.push(`${move.name} power ${dynamicPower}`);
  } else if (HISTORY_BASE_POWER_MOVE_IDS.has(moveId) || UNAVAILABLE_CONTEXT_BASE_POWER_MOVE_IDS.has(moveId)) {
    notes.push(`${move.name} baseline power ${move.basePower}`);
  } else if (TARGET_WEIGHT_POWER_MOVE_IDS.has(moveId)) {
    notes.push(`${move.name} power ${power}`);
  }
  let attackModifier = 1;
  const powerModifiers = [];
  let damageModifier = 1;
  let stab = attacker.types.includes(moveType) ? 1.5 : 1;
  if (pledgeCombo && isPledgeMove(move)) {
    stab = Math.max(stab, 1.5);
    notes.push("Pledge combo STAB");
  }

  for (const modifier of collectModifiers({
    ...ctx,
    typeMultiplier,
    moveType,
    attackStat,
    isPhysical,
  })) {
    notes.push(modifier.label);
    if (modifier.kind === "attack") attackModifier *= modifier.value;
    if (modifier.kind === "power") powerModifiers.push(modifier.value);
    if (modifier.kind === "damage") damageModifier *= modifier.value;
    if (modifier.kind === "stab") stab = modifier.value;
  }

  const baseHitPowers = successiveHitBasePowers(ctx);
  const hitPowers = baseHitPowers.map((hitPower) => applyPowerModifiers(hitPower, powerModifiers));
  if (hitPowers.length > 1) notes.push(`${move.name} hits ${hitPowers.length} times at ${hitPowers.join("/")}`);
  power = hitPowers[0];
  const modifiedAttack = Math.max(1, Math.floor(attack * attackModifier));
  const criticalModifier = effectiveCritical
    ? hasAbility(attackerState, "sniper") ? 2.25 : 1.5
    : 1;
  const burnModifier =
    attackerState.burned && isPhysical && !hasAbility(attackerState, "guts") ? 0.5 : 1;
  const spreadModifier =
    battleFormat === "doubles" && SPREAD_MOVE_TARGETS.has(move.target) ? 0.75 : 1;
  if (spreadModifier !== 1) notes.push("Doubles spread move");
  const hitCounts = hitCountRange(ctx);
  if (hitPowers.length === 1 && (hitCounts.min > 1 || hitCounts.max > 1)) {
    notes.push(hitCounts.min === hitCounts.max
      ? `${move.name} hits ${hitCounts.max} times`
      : `${move.name} hits ${hitCounts.min}-${hitCounts.max} times`);
  }

  const damageForRoll = (roll) =>
    hitPowers.reduce((total, hitPower) => {
      let hitDamage = baseDamageForPower(hitPower, modifiedAttack, defense);
      hitDamage = Math.floor(hitDamage * criticalModifier);
      hitDamage = Math.floor(hitDamage * roll / 100);
      hitDamage = Math.floor(hitDamage * stab);
      hitDamage = Math.floor(hitDamage * typeMultiplier);
      hitDamage = Math.floor(hitDamage * burnModifier);
      hitDamage = Math.floor(hitDamage * spreadModifier);
      hitDamage = Math.floor(hitDamage * damageModifier);
      return total + Math.max(1, hitDamage);
    }, 0);
  const minHitRolls = DAMAGE_ROLLS.map((roll) => damageForRoll(roll) * hitCounts.min);
  const maxHitRolls = DAMAGE_ROLLS.map((roll) => damageForRoll(roll) * hitCounts.max);
  const rolls = hitCounts.min === hitCounts.max
    ? minHitRolls
    : [minHitRolls[0], ...maxHitRolls.slice(1)];

  return {
    supported: true,
    rolls,
    minDamage: Math.min(...rolls),
    maxDamage: Math.max(...rolls),
    minPercent: percent(Math.min(...rolls), defenderHp),
    maxPercent: percent(Math.max(...rolls), defenderHp),
    defenderHp,
    typeMultiplier,
    notes,
  };
}

export function koSummary({ minDamage, maxDamage, defenderHp }) {
  if (minDamage >= defenderHp) return "Guaranteed 1HKO";
  if (maxDamage >= defenderHp) return "Possible 1HKO";
  if (minDamage * 2 >= defenderHp) return "Guaranteed 2HKO";
  if (maxDamage * 2 >= defenderHp) return "Possible 2HKO";
  return "3HKO+";
}

export function formatDamageResult(result) {
  if (!result.supported) return result.reason ?? "No direct damage";
  return `${result.minPercent}% - ${result.maxPercent}%`;
}

function calculatePokemonStat(pokemon, state, stat, { ignoreStage = false, stagePolicy = sameStage } = {}) {
  const stages = state.stages ?? {};
  const stage = stat === "hp" || ignoreStage ? 0 : stagePolicy(stages[stat] ?? 0);
  return calculateStat({
    base: pokemon.baseStats[stat],
    stat,
    sp: state.sp?.[stat] ?? 0,
    nature: state.nature ?? "Hardy",
    stage,
  });
}

function criticalStagePolicy(role, effectiveCritical) {
  if (!effectiveCritical) return sameStage;
  if (role === "attack") return (stage) => Math.max(0, stage);
  return (stage) => Math.min(0, stage);
}

function sameStage(stage) {
  return stage;
}

// Thin lookup: only the numeric/"level" cases read move data directly; every other
// moveId-specific fixed-damage case is a registry entry (see src/engine/move-effects.js).
function fixedDamageKind(move) {
  if (typeof move?.damage === "number") return "numeric";
  if (move?.damage === "level") return "level";
  if (moveEffect(normalizeId(move?.id ?? move?.name)).fixedDamage) return "registry";
  return "";
}

function fixedDamageValue(ctx) {
  const { move } = ctx;
  const kind = fixedDamageKind(move);
  if (kind === "numeric") return move.damage;
  if (kind === "level") return 50;
  if (kind === "registry") return moveEffect(normalizeId(move.id ?? move.name)).fixedDamage(ctx);
  return null;
}

function hitCountRange(ctx) {
  const hits = moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).hits?.(ctx);
  if (hits !== undefined) {
    return Array.isArray(hits) ? { min: hits[0], max: hits[1] } : { min: hits, max: hits };
  }
  if (ctx.move.multihit === 2) return { min: 2, max: 2 };
  return { min: 1, max: 1 };
}

function successiveHitBasePowers(ctx) {
  const hitPowers = moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).hitPowers?.(ctx);
  return hitPowers ?? [ctx.power];
}

function applyPowerModifiers(power, modifiers) {
  return modifiers.reduce((modifiedPower, modifier) => Math.floor(modifiedPower * modifier), power);
}

function baseDamageForPower(power, attack, defense) {
  return Math.floor(
    Math.floor(Math.floor(Math.floor((2 * 50) / 5 + 2) * power * attack) / defense) / 50,
  ) + 2;
}

function effectiveMoveType(ctx) {
  return moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).moveType?.(ctx) ?? ctx.move.type;
}

function effectiveMovePower(ctx) {
  return moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).basePower?.(ctx);
}

function hasAbility(state, abilityId) {
  return normalizeId(state.ability?.id ?? state.ability?.name) === abilityId;
}

function hasAnyAbility(state, abilityIds) {
  const ability = normalizeId(state.ability?.id ?? state.ability?.name);
  return abilityIds.includes(ability);
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function percent(value, total) {
  return Math.floor((value * 1000) / total) / 10;
}

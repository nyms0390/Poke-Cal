import { NATURES, natureMultiplier, natureOptionLabel } from "./natures.js";
import { TYPE_EFFECTIVENESS } from "./type-chart.js";
import { calculateStat, applyStage } from "./stats.js";
import { createField } from "./field.js";
import {
  moveEffect,
  abilityTypeConversion,
  isPledgeMove,
  currentHp,
  USER_HP_POWER_MOVE_IDS,
  TARGET_WEIGHT_POWER_MOVE_IDS,
  USER_TARGET_WEIGHT_POWER_MOVE_IDS,
} from "./move-effects.js";
import { applyHitCountOverride, collectModifiers } from "./modifiers.js";
import { convolveDistributions, koChance, koText } from "./ko-chance.js";

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
  "counter",
  "mirrorcoat",
  "metalburst",
  "comeuppance",
  "futuresight",
  "bide",
]);
const UNSUPPORTED_MOVE_REASONS = {
  counter: "Requires the last damage received this turn.",
  mirrorcoat: "Requires the last damage received this turn.",
  metalburst: "Requires the last damage received this turn.",
  comeuppance: "Requires the last damage received this turn.",
  futuresight: "Requires delayed damage resolution and stored user state.",
  bide: "Requires stored damage taken over prior turns.",
};

export function typeEffectiveness(moveType, defenderTypes = [], move = null, defenderState = {}, attackerState = {}) {
  const moveId = normalizeId(move?.id ?? move?.name);
  if (hasScrappyBypass(moveType, defenderTypes, attackerState)) {
    return defenderTypes.reduce((multiplier, defenderType) => {
      if (defenderType === "Ghost") return multiplier;
      return multiplier * (TYPE_EFFECTIVENESS[moveType]?.[defenderType] ?? 1);
    }, 1);
  }
  if (["smackdown", "thousandarrows"].includes(moveId) && defenderTypes.includes("Flying")) {
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
  if (UNSUPPORTED_MOVE_IDS.has(moveId)) return UNSUPPORTED_MOVE_REASONS[moveId] ?? "Custom damage behavior is not supported.";
  if ((move.damage && typeof move.damage !== "number") || move.damageCallback || move.ohko) {
    return "Fixed-damage moves are not supported.";
  }
  if (!move.basePower && !moveEffect(moveId).basePower) return "Variable or zero base power is not supported.";
  if (!["Physical", "Special"].includes(move.category)) return "Only Physical and Special moves are supported.";
  return "";
}

/**
 * @param {object} input
 * @param {{singleTarget?: boolean}} [input.moveOptions] Override spread targeting for this move.
 */
export function calculateDamage({
  attacker,
  defender,
  move,
  attackerState,
  defenderState,
  field = createField(),
  critical = false,
  moveOptions = {},
}) {
  const weatherSuppressed = hasAnyAbility(attackerState, ["cloudnine", "airlock"]) ||
    hasAnyAbility(defenderState, ["cloudnine", "airlock"]);
  const effectiveField = {
    ...field,
    weather: weatherSuppressed ? "" : field.weather,
    weatherSuppressed,
  };
  const { format: battleFormat, pledgeCombo = false } = effectiveField;
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };

  const ctx = { move, attacker, defender, attackerState, defenderState, field: effectiveField, moveOptions };
  const moveType = effectiveMoveType(ctx);
  const defenderTypes = defenderState.teraType ? [defenderState.teraType] : defender.types;
  const typeMultiplier = typeEffectiveness(moveType, defenderTypes, move, defenderState, attackerState);
  const defenderMaxHp = calculatePokemonStat(defender, defenderState, "hp");
  const defenderCurrentHp = currentHp(defenderState, defenderMaxHp);
  const attackerMaxHp = calculatePokemonStat(attacker, attackerState, "hp");
  const attackerCurrentHp = currentHp(attackerState, attackerMaxHp);
  ctx.defenderHp = defenderCurrentHp;
  ctx.defenderMaxHp = defenderMaxHp;
  ctx.attackerHp = attackerCurrentHp;
  ctx.attackerMaxHp = attackerMaxHp;
  const moveId = normalizeId(move.id ?? move.name);
  const alwaysCritical = moveEffect(moveId).alwaysCrit === true;
  const effectiveCritical = (critical || alwaysCritical) &&
    (move.ignoreAbility || !hasAnyAbility(defenderState, ["battlearmor", "shellarmor"]));
  if (typeMultiplier === 0) {
    const rolls = DAMAGE_ROLLS.map(() => 0);
    return {
      supported: true,
      rolls,
      minDamage: 0,
      maxDamage: 0,
      minPercent: 0,
      maxPercent: 0,
      defenderHp: defenderMaxHp,
      defenderCurrentHp,
      typeMultiplier,
      ko: koSummaryForRolls(rolls, defenderCurrentHp),
      notes: ["Immune", ...fieldNotes(effectiveField, attackerState, defenderState), ...teraNotes(attackerState, defenderState)],
    };
  }

  const fixedDamage = fixedDamageValue(ctx);
  if (fixedDamage !== null) {
    const damage = Math.max(0, fixedDamage);
    const rolls = DAMAGE_ROLLS.map(() => damage);
    return {
      supported: true,
      rolls,
      minDamage: damage,
      maxDamage: damage,
      minPercent: percent(damage, defenderMaxHp),
      maxPercent: percent(damage, defenderMaxHp),
      defenderHp: defenderMaxHp,
      defenderCurrentHp,
      typeMultiplier,
      ko: koSummaryForRolls(rolls, defenderCurrentHp),
      notes: ["Fixed damage", ...fieldNotes(effectiveField, attackerState, defenderState), moveEffect(moveId).note?.(ctx), ...teraNotes(attackerState, defenderState)].filter(Boolean),
    };
  }

  const dynamicPower = effectiveMovePower(ctx);
  if (dynamicPower === null) {
    let reason = "Natural Gift requires a held Berry.";
    if (moveId === "fling") reason = "Fling requires a held item with fling power data.";
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
  const baseDefense = calculatePokemonStat(defender, defenderState, defenseStat, {
    ignoreStage: move.ignoreDefensive,
    stagePolicy: criticalStagePolicy("defense", effectiveCritical),
  });
  const sandstormSpDefenseBoost = hasSandstormSpDefenseBoost(defender, defenderState, defenseStat, effectiveField);
  const defense = sandstormSpDefenseBoost ? Math.floor(baseDefense * 1.5) : baseDefense;
  const notes = [...fieldNotes(effectiveField, attackerState, defenderState), ...teraNotes(attackerState, defenderState)];
  if (sandstormSpDefenseBoost) notes.push("Sandstorm Rock SpD boost");
  if (moveType !== move.type) notes.push(`${move.name} is ${moveType} type`);
  const moveNote = moveEffect(moveId).note?.(ctx);
  if (moveNote) notes.push(moveNote);
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
  let stab = stabMultiplier(attacker, attackerState, moveType);
  if (pledgeCombo && isPledgeMove(move)) {
    stab = Math.max(stab, 1.5);
    notes.push("Pledge combo STAB");
  }

  let hitCounts = hitCountRange(ctx);
  ctx.hitCountRange = hitCounts;
  const modifiers = collectModifiers({
    ...ctx,
    typeMultiplier,
    moveType,
    attackStat,
    isPhysical,
    critical: effectiveCritical,
  });
  for (const modifier of modifiers) {
    notes.push(modifier.label);
    if (modifier.kind === "attack") attackModifier *= modifier.value;
    if (modifier.kind === "power") powerModifiers.push(modifier.value);
    if (modifier.kind === "damage") damageModifier *= modifier.value;
    if (modifier.kind === "stab") stab = modifier.value;
    if (modifier.kind === "hits") hitCounts = applyHitCountOverride(hitCounts, modifier.value);
  }

  const selectedHitCount = Number(moveOptions.hitCount);
  if (Number.isFinite(selectedHitCount)) {
    const count = Math.max(hitCounts.min, Math.min(hitCounts.max, Math.trunc(selectedHitCount)));
    hitCounts = { min: count, max: count };
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
    attackerState.status === "burn" && isPhysical && !hasAbility(attackerState, "guts") && !moveEffect(moveId).ignoreBurn
      ? 0.5
      : 1;
  const spreadModifier =
    battleFormat === "doubles" && SPREAD_MOVE_TARGETS.has(move.target) && !moveOptions.singleTarget ? 0.75 : 1;
  if (spreadModifier !== 1) notes.push("Doubles spread move");
  if (hitPowers.length === 1 && (hitCounts.min > 1 || hitCounts.max > 1)) {
    notes.push(hitCounts.min === hitCounts.max
      ? `${move.name} hits ${hitCounts.max} times`
      : `${move.name} hits ${hitCounts.min}-${hitCounts.max} times`);
  }

  const damageForHit = (hitPower, roll) => {
    let hitDamage = baseDamageForPower(hitPower, modifiedAttack, defense);
    hitDamage = Math.floor(hitDamage * criticalModifier);
    hitDamage = Math.floor(hitDamage * roll / 100);
    hitDamage = Math.floor(hitDamage * stab);
    hitDamage = Math.floor(hitDamage * typeMultiplier);
    hitDamage = Math.floor(hitDamage * burnModifier);
    hitDamage = Math.floor(hitDamage * spreadModifier);
    hitDamage = Math.floor(hitDamage * damageModifier);
    return Math.max(1, hitDamage);
  };
  const damageForRoll = (roll) =>
    hitPowers.reduce((total, hitPower) => total + damageForHit(hitPower, roll), 0);
  const minHitRolls = DAMAGE_ROLLS.map((roll) => damageForRoll(roll) * hitCounts.min);
  const maxHitRolls = DAMAGE_ROLLS.map((roll) => damageForRoll(roll) * hitCounts.max);
  const rollDistribution = hitCounts.min === hitCounts.max
    ? fullMoveDistribution(hitPowers, hitCounts.min, damageForHit)
    : null;
  const rolls = hitCounts.min === hitCounts.max && hitCounts.min > 1
    ? rollDistribution.map(({ damage }) => damage)
    : hitCounts.min === hitCounts.max
      ? minHitRolls
      : [minHitRolls[0], ...maxHitRolls.slice(1)];

  return {
    supported: true,
    rolls,
    minDamage: Math.min(...rolls),
    maxDamage: Math.max(...rolls),
    minPercent: percent(Math.min(...rolls), defenderMaxHp),
    maxPercent: percent(Math.max(...rolls), defenderMaxHp),
    defenderHp: defenderMaxHp,
    defenderCurrentHp,
    typeMultiplier,
    ko: rollDistribution
      ? koSummaryForRolls(rolls, defenderCurrentHp, rollDistribution)
      : unavailableKoSummary("KO chance unavailable for variable hit count"),
    notes,
  };
}

function koSummaryForRolls(rolls, targetHp, rollDistribution) {
  const chances = koChance({ rolls, rollDistribution, targetHp });
  const firstKo = chances.find(({ chance }) => chance > 0);
  return {
    hits: firstKo?.hits ?? null,
    chance: firstKo?.chance ?? 0,
    text: koText(chances),
  };
}

function unavailableKoSummary(text) {
  return { hits: null, chance: null, text };
}

function fullMoveDistribution(hitPowers, hitCount, damageForHit) {
  const powers = hitPowers.length > 1
    ? hitPowers
    : Array.from({ length: hitCount }, () => hitPowers[0]);
  return convolveDistributions(powers.map((power) => DAMAGE_ROLLS.map((roll) => ({
    damage: damageForHit(power, roll),
    chance: 1 / DAMAGE_ROLLS.length,
  }))));
}

function stabMultiplier(attacker, attackerState, moveType) {
  const teraType = attackerState.teraType;
  const originalType = attacker.types.includes(moveType);
  if (!teraType) return originalType ? 1.5 : 1;
  if (moveType === teraType) return originalType ? 2 : 1.5;
  return originalType ? 1.5 : 1;
}

function teraNotes(attackerState, defenderState) {
  return [attackerState.teraType, defenderState.teraType]
    .filter(Boolean)
    .map((type) => `Tera (${type})`);
}

function fieldNotes(field, attackerState, defenderState) {
  const notes = [];
  if (field.weatherSuppressed) notes.push("Cloud Nine/Air Lock suppresses weather");
  if (
    !field.weatherSuppressed &&
    normalizeId(field.weather) === "raindance" &&
    (hasAnyAbility(attackerState, ["primordialsea"]) || hasAnyAbility(defenderState, ["primordialsea"]))
  ) {
    notes.push("Primordial Sea treated as Rain");
  }
  return notes;
}

function hasSandstormSpDefenseBoost(pokemon, state, stat, field) {
  if (stat !== "spd" || normalizeId(field.weather) !== "sandstorm") return false;
  const types = state.teraType ? [state.teraType] : pokemon.types ?? [];
  return types.includes("Rock");
}

export function koSummary({ minDamage, maxDamage, defenderHp, defenderCurrentHp = defenderHp }) {
  if (minDamage >= defenderCurrentHp) return "Guaranteed 1HKO";
  if (maxDamage >= defenderCurrentHp) return "Possible 1HKO";
  if (minDamage * 2 >= defenderCurrentHp) return "Guaranteed 2HKO";
  if (maxDamage * 2 >= defenderCurrentHp) return "Possible 2HKO";
  return "3HKO+";
}

export function formatDamageResult(result) {
  if (!result.supported) return result.reason ?? "No direct damage";
  return `${result.minDamage}–${result.maxDamage} (${result.minPercent}–${result.maxPercent}%)`;
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

export function hitCountRange(ctx) {
  const configuredHits = moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).hits;
  const hits = typeof configuredHits === "function" ? configuredHits(ctx) : configuredHits;
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
  return abilityTypeConversion(ctx)?.to ??
    moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).moveType?.(ctx) ??
    ctx.move.type;
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

function hasScrappyBypass(moveType, defenderTypes, attackerState) {
  if (!["Normal", "Fighting"].includes(moveType) || !defenderTypes.includes("Ghost")) return false;
  return hasAnyAbility(attackerState, ["scrappy", "mindseye"]);
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function percent(value, total) {
  return Math.floor((value * 1000) / total) / 10;
}

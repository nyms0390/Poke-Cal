import { normalizeId } from "../identifiers.js";
import { TYPE_EFFECTIVENESS } from "./type-chart.js";
import { calculateStat, normalizeSp, normalizeStage } from "./stats.js";
import { STAT_KEYS } from "./constants.js";
import { createField, isGrounded, normalizeField } from "./field.js";
import {
  moveEffect,
  abilityTypeConversion,
  isPledgeMove,
  currentHp,
  USER_HP_POWER_MOVE_IDS,
  TARGET_WEIGHT_POWER_MOVE_IDS,
  USER_TARGET_WEIGHT_POWER_MOVE_IDS,
} from "./move-effects.js";
import { applyHitCountOverride, applyModifier, chainModifiers, chainValue, collectModifiers } from "./modifiers.js";
import { convolveDistributions, koChance, koText } from "./ko-chance.js";
import { isGuaranteedCritical } from "./critical.js";

const SP_TOTAL_LIMIT = 66;
const DAMAGE_ROLLS = [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
const SPREAD_MOVE_TARGETS = new Set(["allAdjacent", "allAdjacentFoes"]);
const SPREAD_MODIFIER = 3072;
// Final ("damage") modifiers without an explicit order sit between Friend Guard and Expert Belt.
const DEFAULT_FINAL_MODIFIER_ORDER = 45;
const ABILITY_SUPPRESSING_ATTACKER_ABILITIES = new Set(["moldbreaker", "teravolt", "turboblaze"]);
const HISTORY_BASE_POWER_MOVE_IDS = new Set([
  "echoedvoice",
  "furycutter",
  "iceball",
  "retaliate",
  "rollout",
]);
const UNAVAILABLE_CONTEXT_BASE_POWER_MOVE_IDS = new Set([
  "fusionbolt",
  "fusionflare",
  "gust",
  "twister",
]);
const TYPE_CHANGE_ABILITIES = new Set(["libero", "protean"]);

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

export function typeEffectiveness(moveType, defenderTypes = [], move = null, defenderState = {}, attackerState = {}, options = {}) {
  const multiplier = singleTypeEffectiveness(moveType, defenderTypes, move, defenderState, attackerState, options);
  // Immunity comes from the move's own type only (Showdown runImmunity), so a 0 stays 0.
  const extraType = moveEffect(normalizeId(move?.id ?? move?.name)).additionalEffectivenessType;
  if (!extraType || multiplier === 0) return multiplier;
  return defenderTypes.reduce(
    (total, defenderType) => total * (TYPE_EFFECTIVENESS[extraType]?.[defenderType] ?? 1),
    multiplier,
  );
}

function singleTypeEffectiveness(moveType, defenderTypes, move, defenderState, attackerState, options) {
  const moveId = normalizeId(move?.id ?? move?.name);
  if (!options.suppressAttackerAbility && hasScrappyBypass(moveType, defenderTypes, attackerState)) {
    return defenderTypes.reduce((multiplier, defenderType) => {
      if (defenderType === "Ghost") return multiplier;
      return multiplier * (TYPE_EFFECTIVENESS[moveType]?.[defenderType] ?? 1);
    }, 1);
  }
  if (moveType === "Ground" && options.groundedTarget && defenderTypes.includes("Flying")) {
    return defenderTypes.reduce((multiplier, defenderType) => {
      if (defenderType === "Flying") return multiplier;
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
  // Showdown move text can use `damage` for a battle message on powered moves.
  if ((move.damage && typeof move.damage !== "number" && !move.basePower) || move.damageCallback || move.ohko) {
    return "Fixed-damage moves are not supported.";
  }
  if (!move.basePower && !moveEffect(moveId).basePower) return "Variable or zero base power is not supported.";
  if (!["Physical", "Special"].includes(move.category)) return "Only Physical and Special moves are supported.";
  return "";
}

/**
 * @param {object} input
 * @param {{singleTarget?: boolean}} [input.moveOptions] Override spread targeting for this move.
 * Supported results carry `warnings` (machine-readable, e.g. an SP total above 66) whose
 * messages are also appended to `notes`; the damage is still calculated.
 */
export function calculateDamage(input = {}) {
  const result = calculateDamageUnchecked(input ?? {});
  if (!result.supported) return result;
  const warnings = spTotalWarnings(input ?? {});
  return {
    ...result,
    notes: [...result.notes, ...warnings.map(({ message }) => message)],
    warnings,
  };
}

/** Champions caps a Pokémon's SP at 66 in total; over-limit spreads are calculated with a warning. */
export function spTotalWarnings({ attackerState, defenderState } = {}) {
  return [["attacker", "Attacker", attackerState], ["defender", "Defender", defenderState]]
    .map(([side, label, state]) => ({ side, label, total: spTotal(state?.sp) }))
    .filter(({ total }) => total > SP_TOTAL_LIMIT)
    .map(({ side, label, total }) => ({
      code: "sp-total-exceeded",
      side,
      total,
      limit: SP_TOTAL_LIMIT,
      message: `${label} SP total ${total} exceeds ${SP_TOTAL_LIMIT}`,
    }));
}

function spTotal(sp) {
  return STAT_KEYS.reduce((total, stat) => total + normalizeSp(sp?.[stat]), 0);
}

function calculateDamageUnchecked({
  attacker,
  defender,
  move,
  attackerState,
  defenderState,
  field,
  critical = false,
  moveOptions,
} = {}) {
  // Validate before anything reads move/state fields, so bad input returns a reason instead of throwing.
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };
  if (!attacker?.baseStats || !defender?.baseStats) {
    return { supported: false, reason: "Missing attacker or defender data." };
  }
  attackerState = attackerState ?? {};
  defenderState = defenderState ?? {};
  field = createField(field ?? {});
  moveOptions = moveOptions ?? {};
  const neutralizingGasActive = hasAnyAbility(attackerState, ["neutralizinggas"]) ||
    hasAnyAbility(defenderState, ["neutralizinggas"]);
  const suppressAttackerAbility = neutralizingGasActive;
  // Mold Breaker-style abilities and ability-ignoring moves only bypass "breakable" abilities.
  const moldBreakerActive = Boolean(move.ignoreAbility) ||
    attackerAbilitySuppressesDefenderAbility(attackerState, suppressAttackerAbility);
  const abilityBroken = moldBreakerActive && isBreakableAbility(defenderState.ability);
  const suppressDefenderAbility = neutralizingGasActive || abilityBroken;
  attackerState = normalizeStatusForAbility(attackerState, suppressAttackerAbility);
  defenderState = normalizeStatusForAbility(defenderState, suppressDefenderAbility);
  const weatherSuppressed = !neutralizingGasActive && (
    hasAnyAbility(attackerState, ["cloudnine", "airlock"]) ||
    hasAnyAbility(defenderState, ["cloudnine", "airlock"])
  );
  const effectiveField = {
    ...field,
    weather: weatherSuppressed ? "" : field.weather,
    weatherSuppressed,
  };
  const megaSolActive = !suppressAttackerAbility && !weatherSuppressed && hasAbility(attackerState, "megasol");
  const moveField = megaSolActive
    ? { ...effectiveField, weather: "SunnyDay", megaSolActive: true }
    : effectiveField;
  const { format: battleFormat, pledgeCombo = false } = effectiveField;

  const ctx = {
    move,
    attacker,
    defender,
    attackerState,
    defenderState,
    field: moveField,
    ambientField: effectiveField,
    moveOptions,
    suppressAttackerAbility,
    suppressDefenderAbility,
  };
  const moveType = effectiveMoveType(ctx);
  const attackerTypeChange = typeChangeForMove({
    pokemon: attacker,
    state: attackerState,
    moveType,
    suppressAbility: suppressAttackerAbility,
  });
  const attackerTypes = effectivePokemonTypes(attacker, attackerState, effectiveField, suppressAttackerAbility, {
    moveType,
    activateTypeChange: true,
  });
  const defenderTypes = defenderState.teraType
    ? [defenderState.teraType]
    : effectivePokemonTypes(defender, defenderState, effectiveField, suppressDefenderAbility);
  const groundedTarget = Boolean(effectiveField.gravity) || defenderState.grounded === true;
  const rawTypeMultiplier = typeEffectiveness(moveType, defenderTypes, move, defenderState, attackerState, {
    suppressAttackerAbility,
    groundedTarget,
  });
  const defenderMaxHp = calculatePokemonStat(defender, defenderState, "hp");
  const defenderCurrentHp = currentHp(defenderState, defenderMaxHp);
  const attackerMaxHp = calculatePokemonStat(attacker, attackerState, "hp");
  const attackerCurrentHp = currentHp(attackerState, attackerMaxHp);
  ctx.defenderHp = defenderCurrentHp;
  ctx.defenderMaxHp = defenderMaxHp;
  ctx.attackerHp = attackerCurrentHp;
  ctx.attackerMaxHp = attackerMaxHp;
  const moveId = normalizeId(move.id ?? move.name);
  const alwaysCritical = isGuaranteedCritical({ move, attacker, attackerState, defenderState, suppressAttackerAbility });
  const abilityImmunity = abilityImmunityResult({ moveType, typeMultiplier: rawTypeMultiplier, move, defender, defenderTypes, defenderState, suppressDefenderAbility, groundedTarget });
  const itemImmunity = abilityImmunity ? null : itemImmunityResult({ moveType, move, defenderState, groundedTarget });
  const teraShell = teraShellTypeMultiplier(rawTypeMultiplier, defenderState, suppressDefenderAbility);
  const typeMultiplier = abilityImmunity || itemImmunity ? 0 : teraShell ?? rawTypeMultiplier;
  ctx.typeMultiplier = typeMultiplier;
  const effectiveCritical = (critical || alwaysCritical) &&
    (suppressDefenderAbility || !hasAnyAbility(defenderState, ["battlearmor", "shellarmor"]));
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
      distribution: [{ damage: 0, chance: 1 }],
      typeMultiplier,
      critical: effectiveCritical,
      ko: koSummaryForRolls(rolls, defenderCurrentHp),
      notes: [
        abilityImmunity ? "Immune (ability)" : itemImmunity ? "Immune (item)" : "Immune",
        abilityImmunity?.label,
        itemImmunity?.label,
        ...fieldNotes(effectiveField, attackerState, defenderState),
        ...teraNotes(attackerState, defenderState),
        attackerTypeChange.note,
      ].filter(Boolean),
    };
  }

  const iceFaceActive = !suppressDefenderAbility && move.category === "Physical" &&
    hasAbility(defenderState, "iceface") && defenderState.iceFaceIntact !== false;
  const sturdyActive = isSturdyActive(defenderCurrentHp, defenderMaxHp, defenderState, suppressDefenderAbility);

  const fixedDamage = fixedDamageValue(ctx);
  if (fixedDamage !== null) {
    const rawDamage = Math.max(0, fixedDamage);
    const damage = iceFaceActive ? 0 : rawDamage;
    const rolls = DAMAGE_ROLLS.map(() => damage);
    const baseDistribution = [{ damage: rawDamage, chance: 1 }];
    const firstDistribution = [{
      damage: iceFaceActive ? 0 : sturdyActive ? Math.min(rawDamage, defenderMaxHp - 1) : rawDamage,
      chance: 1,
    }];
    const sturdyText = sturdyActive && !iceFaceActive && rawDamage >= defenderMaxHp
      ? sturdySurvivalKo()
      : null;
    const recalculatedKo = moveEffect(moveId).recalculatesFixedDamage
      ? koSummaryForRecalculatedFixedDamage(ctx, firstDistribution[0].damage)
      : null;
    return {
      supported: true,
      rolls,
      minDamage: damage,
      maxDamage: damage,
      minPercent: percent(damage, defenderMaxHp),
      maxPercent: percent(damage, defenderMaxHp),
      distribution: firstDistribution,
      defenderHp: defenderMaxHp,
      defenderCurrentHp,
      typeMultiplier,
      critical: effectiveCritical,
      ko: sturdyText ?? recalculatedKo ??
        koSummaryForRolls(rolls, defenderCurrentHp, baseDistribution, firstDistribution),
      notes: [
        "Fixed damage",
        iceFaceActive ? "Ice Face intact (first hit negated)" : null,
        megaSolActive ? "Mega Sol treats this move as Sunny Day" : null,
        ...fieldNotes(effectiveField, attackerState, defenderState),
        moveEffect(moveId).note?.(ctx),
        ...teraNotes(attackerState, defenderState),
        attackerTypeChange.note,
      ].filter(Boolean),
    };
  }

  const dynamicPower = effectiveMovePower(ctx);
  if (dynamicPower === null) {
    let reason = "Natural Gift requires a held Berry.";
    if (moveId === "fling") reason = "Fling requires a held item with fling power data.";
    if (moveId === "spitup") reason = "Spit Up fails without Stockpile.";
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
  const attackerHasUnaware = !suppressAttackerAbility && hasAbility(attackerState, "unaware");
  const defenderHasUnaware = !suppressDefenderAbility && hasAbility(defenderState, "unaware");
  const offensiveStatHandler = moveEffect(moveId).offensiveStat;
  if (offensiveStatHandler) {
    ctx.physicalAttack = calculatePokemonStat(attacker, attackerState, "atk", {
      ignoreStage: defenderHasUnaware,
      stagePolicy: criticalStagePolicy("attack", effectiveCritical),
    });
    ctx.specialAttack = calculatePokemonStat(attacker, attackerState, "spa", {
      ignoreStage: defenderHasUnaware,
      stagePolicy: criticalStagePolicy("attack", effectiveCritical),
    });
    attackStat = offensiveStatHandler(ctx);
    isPhysical = attackStat === "atk";
    defenseStat = isPhysical ? "def" : "spd";
  }
  const attackSource = move.overrideOffensivePokemon === "target"
    ? { pokemon: defender, state: defenderState }
    : { pokemon: attacker, state: attackerState };
  // Showdown reads attack boosts through the move user's ModifyBoost event, so only the target's
  // Unaware ignores them — including Foul Play, where the boosts are the target's own.
  const attackIgnoresStage = defenderHasUnaware;
  const attack = calculatePokemonStat(attackSource.pokemon, attackSource.state, attackStat, {
    ignoreStage: attackIgnoresStage,
    stagePolicy: criticalStagePolicy("attack", effectiveCritical),
  });
  const baseDefense = calculatePokemonStat(defender, defenderState, defenseStat, {
    ignoreStage: move.ignoreDefensive || attackerHasUnaware,
    stagePolicy: criticalStagePolicy("defense", effectiveCritical),
  });
  const sandstormSpDefenseBoost = hasSandstormSpDefenseBoost(defender, defenderState, defenseStat, effectiveField, defenderTypes);
  const snowDefenseBoost = hasSnowDefenseBoost(defender, defenderState, defenseStat, effectiveField, defenderTypes);
  const defense = sandstormSpDefenseBoost || snowDefenseBoost ? Math.floor(baseDefense * 1.5) : baseDefense;
  const notes = [
    ...fieldNotes(effectiveField, attackerState, defenderState),
    ...forecastNotes(attacker, attackerState, attackerTypes, suppressAttackerAbility),
    ...forecastNotes(defender, defenderState, defenderTypes, suppressDefenderAbility),
    ...teraNotes(attackerState, defenderState),
    attackerTypeChange.note,
  ];
  if (iceFaceActive) notes.push("Ice Face intact (first hit negated)");
  if (megaSolActive) notes.push("Mega Sol treats this move as Sunny Day");
  if (teraShell !== null) notes.push("Tera Shell");
  if (abilityBroken && attackerAbilitySuppressesDefenderAbility(attackerState, suppressAttackerAbility)) notes.push(attackerState.ability.name);
  if (attackerHasUnaware || defenderHasUnaware) notes.push("Unaware");
  if (sandstormSpDefenseBoost) notes.push("Sandstorm Rock SpD boost");
  if (snowDefenseBoost) notes.push("Snow Ice Def boost");
  if (moveType !== move.type) notes.push(`${move.name} is ${moveType} type`);
  const moveNote = moveEffect(moveId).note?.(ctx);
  if (moveNote) notes.push(moveNote);
  let power = dynamicPower ?? move.basePower;
  if (teraPowerFloorApplies({ move, moveType, attackerState, power, hasPowerCallback: dynamicPower !== undefined })) {
    power = 60;
    notes.push(`Tera ${moveType} raises ${move.name} to 60 power`);
  }
  ctx.power = power;
  if (dynamicPower !== undefined) {
    notes.push(`${move.name} power ${dynamicPower}`);
  } else if (HISTORY_BASE_POWER_MOVE_IDS.has(moveId) || UNAVAILABLE_CONTEXT_BASE_POWER_MOVE_IDS.has(moveId)) {
    notes.push(`${move.name} baseline power ${move.basePower}`);
  } else if (TARGET_WEIGHT_POWER_MOVE_IDS.has(moveId)) {
    notes.push(`${move.name} power ${power}`);
  }
  const attackModifiers = [];
  const defenseModifiers = [];
  const powerModifiers = [];
  const weatherModifiers = [];
  const finalModifiers = [];
  let hitDamageModifiers = null;
  let stab = stabMultiplier(attackerTypes, attackerState, moveType);
  if (pledgeCombo && isPledgeMove(move)) {
    stab = Math.max(stab, 1.5);
    notes.push("Pledge combo STAB");
  }

  let hitCounts = hitCountRange(ctx);
  ctx.hitCountRange = hitCounts;
  const hasExplicitHitCount = moveOptions.hitCount !== null && moveOptions.hitCount !== undefined;
  const selectedHitCount = Number(moveOptions.hitCount);
  const modifiers = collectModifiers({
    ...ctx,
    typeMultiplier,
    moveType,
    attackStat,
    defenseStat,
    isPhysical,
    critical: effectiveCritical,
  });
  for (const modifier of modifiers) {
    if (modifier.kind === "hits" && hasExplicitHitCount && Number.isFinite(selectedHitCount)) continue;
    notes.push(modifier.label);
    if (modifier.kind === "attack") attackModifiers.push(chainValue(modifier));
    if (modifier.kind === "defense") defenseModifiers.push(chainValue(modifier));
    if (modifier.kind === "power") powerModifiers.push(chainValue(modifier));
    if (modifier.kind === "weather") weatherModifiers.push(chainValue(modifier));
    if (modifier.kind === "damage") finalModifiers.push(modifier);
    if (modifier.kind === "stab") stab = modifier.value;
    if (modifier.kind === "hits") hitCounts = applyHitCountOverride(hitCounts, modifier.value);
    if (modifier.kind === "hitDamageModifiers") hitDamageModifiers = modifier.value;
  }

  if (hasExplicitHitCount && Number.isFinite(selectedHitCount)) {
    const count = Math.max(hitCounts.min, Math.min(hitCounts.max, Math.trunc(selectedHitCount)));
    hitCounts = { min: count, max: count };
  }

  const baseHitPowers = successiveHitBasePowers(ctx);
  const successiveHits = baseHitPowers.length > 1;
  const defaultHits = moveEffect(moveId).defaultHits;
  if (!hasExplicitHitCount && Number.isInteger(defaultHits)) hitCounts = { min: defaultHits, max: defaultHits };
  // Parental Bond: the child hit repeats the move at full power and quarters its base damage.
  const perHitDamageModifiers = hitDamageModifiers && baseHitPowers.length === 1 && hitCounts.min === 1 && hitCounts.max === 1
    ? hitDamageModifiers
    : null;
  const powerChain = chainModifiers(powerModifiers);
  const scaledHitPowers = perHitDamageModifiers ? perHitDamageModifiers.map(() => baseHitPowers[0]) : baseHitPowers;
  const hitPowers = (successiveHits ? scaledHitPowers.slice(0, hitCounts.max) : scaledHitPowers)
    .map((hitPower) => applyPowerModifiers(hitPower, powerChain));
  if (perHitDamageModifiers) {
    notes.push(`${move.name} hits ${hitPowers.length} times (child hit ×${perHitDamageModifiers[1] / 4096})`);
  } else if (hitPowers.length > 1) notes.push(`${move.name} hits ${hitPowers.length} times at ${hitPowers.join("/")}`);
  else if (baseHitPowers.length > 1) notes.push(`${move.name} hits 1 time at ${hitPowers[0]}`);
  power = hitPowers[0];
  const modifiedAttack = Math.max(1, applyModifier(attack, chainModifiers(attackModifiers)));
  const modifiedDefense = Math.max(1, applyModifier(defense, chainModifiers(defenseModifiers)));
  if (effectiveCritical && !suppressAttackerAbility && hasAbility(attackerState, "sniper")) {
    finalModifiers.push({ kind: "damage", value: 1.5, order: 15, label: "Sniper" });
    notes.push("Sniper");
  }
  const burned =
    attackerState.status === "burn" && isPhysical &&
      (suppressAttackerAbility || !hasAbility(attackerState, "guts")) && !moveEffect(moveId).ignoreBurn;
  const moveTarget = moveEffect(moveId).target?.(ctx) ?? move.target;
  const spreadHit =
    battleFormat === "doubles" && SPREAD_MOVE_TARGETS.has(moveTarget) && !moveOptions.singleTarget;
  const sourceDamageMultiplier = moveEffect(moveId).sourceDamageMultiplier?.(ctx) ?? 1;
  if (sourceDamageMultiplier !== 1) {
    notes.push(`${move.name} target-state damage ×${sourceDamageMultiplier}`);
    finalModifiers.push({ kind: "damage", value: sourceDamageMultiplier, order: 5 });
  }
  if (spreadHit) notes.push("Doubles spread move");
  if (!successiveHits && hitPowers.length === 1 &&
    (hitCounts.min > 1 || hitCounts.max > 1 || (hasExplicitHitCount && ctx.hitCountRange.max > 1))) {
    notes.push(hitCounts.min === hitCounts.max
      ? `${move.name} hits ${hitCounts.max} ${hitCounts.max === 1 ? "time" : "times"}`
      : `${move.name} hits ${hitCounts.min}-${hitCounts.max} times`);
  }

  // Showdown's modifyDamage order: base → spread → Parental Bond child → weather → crit →
  // random roll → STAB → type → burn → chained final modifiers, each step rounded.
  const weatherChain = chainModifiers(weatherModifiers);
  const stabModifier = Math.round(stab * 4096);
  const orderedFinalModifiers = [...finalModifiers]
    .sort((a, b) => (a.order ?? DEFAULT_FINAL_MODIFIER_ORDER) - (b.order ?? DEFAULT_FINAL_MODIFIER_ORDER));
  const firstHitFinalChain = chainModifiers(orderedFinalModifiers.map(chainValue));
  const laterHitFinalChain = chainModifiers(orderedFinalModifiers
    .filter((modifier) => !modifier.firstHitOnly)
    .map(chainValue));
  const firstHitDiffers = firstHitFinalChain !== laterHitFinalChain;

  const damageForHit = (hitPower, roll, hitIndex = 0, firstUse = true) => {
    let hitDamage = baseDamageForPower(hitPower, modifiedAttack, modifiedDefense);
    if (spreadHit) hitDamage = applyModifier(hitDamage, SPREAD_MODIFIER);
    if (perHitDamageModifiers) hitDamage = applyModifier(hitDamage, perHitDamageModifiers[hitIndex] ?? 4096);
    hitDamage = applyModifier(hitDamage, weatherChain);
    if (effectiveCritical) hitDamage = Math.floor(hitDamage * 1.5);
    hitDamage = Math.floor(hitDamage * roll / 100);
    hitDamage = applyModifier(hitDamage, stabModifier);
    hitDamage = Math.floor(hitDamage * typeMultiplier);
    if (burned) hitDamage = Math.floor(hitDamage / 2);
    hitDamage = applyModifier(hitDamage, firstUse && hitIndex === 0 ? firstHitFinalChain : laterHitFinalChain);
    return Math.max(1, hitDamage);
  };
  const damageForRollCount = (roll, hitCount, negateFirstHit = false) => {
    const powers = successiveHits
      ? hitPowers.slice(0, hitCount)
      : hitPowers.length > 1 ? hitPowers : Array.from({ length: hitCount }, () => hitPowers[0]);
    return powers.reduce((total, hitPower, index) =>
      total + (negateFirstHit && index === 0 ? 0 : damageForHit(hitPower, roll, index)), 0);
  };
  const minHitRolls = DAMAGE_ROLLS.map((roll) => damageForRollCount(roll, hitCounts.min, iceFaceActive));
  const maxHitRolls = DAMAGE_ROLLS.map((roll) => damageForRollCount(roll, hitCounts.max, iceFaceActive));
  // One use of the move: a weighted mixture over hit counts, each hit an independent roll.
  const hitWeights = hitCountWeights(move, ctx.hitCountRange, hitCounts);
  const accuracyChained = hitWeights.length > 1 && hitCountsAreAccuracyChained(move, hitCounts);
  if (accuracyChained) {
    notes.push(`${move.name} hit count assumes ${multiAccuracyPercent(move)}% accuracy for each hit after the first`);
  }
  const moveDistribution = (options) => mixHitCountDistributions(hitWeights.map(({ hits, chance }) => ({
    chance,
    distribution: fullMoveDistribution(successiveHits ? hitPowers.slice(0, hits) : hitPowers, hits, damageForHit, options),
  })));
  const baseRollDistribution = moveDistribution({ firstUse: false });
  const firstRollDistribution = iceFaceActive || sturdyActive || firstHitDiffers
    ? moveDistribution({
      negateFirstHit: iceFaceActive,
      firstHitCap: sturdyActive ? defenderMaxHp - 1 : null,
      firstUse: true,
    })
    : baseRollDistribution;
  const rolls = hitCounts.min === hitCounts.max && hitCounts.min > 1
    ? firstRollDistribution.map(({ damage }) => damage)
    : hitCounts.min === hitCounts.max
      ? minHitRolls
      : [minHitRolls[0], ...maxHitRolls.slice(1)];
  const maxActualHitCount = successiveHits ? hitCounts.max : hitPowers.length > 1 ? hitPowers.length : hitCounts.max;
  const sturdyAffectsKo = sturdyActive && maxActualHitCount === 1 && Math.max(...minHitRolls) >= defenderMaxHp;
  const sturdyText = sturdyAffectsKo && Math.min(...minHitRolls) >= defenderMaxHp
    ? sturdySurvivalKo()
    : null;
  const recovery = sturdyText
    ? null
    : defenderRecovery({ defender, defenderState, defenderTypes, defenderMaxHp, defenderCurrentHp, field: effectiveField, suppressDefenderAbility, attackerState, suppressAttackerAbility });
  let ko = sturdyText ??
    koSummaryForRolls(rolls, defenderCurrentHp, baseRollDistribution, firstRollDistribution, recovery);
  if (sturdyAffectsKo && !sturdyText) {
    ko = { ...ko, text: `${ko.text} (Sturdy)` };
  }
  if (recovery && ko.hits !== 1) {
    ko = { ...ko, text: `${ko.text} after ${recovery.labels.join(" and ")} recovery` };
  }

  return {
    supported: true,
    rolls,
    minDamage: Math.min(...rolls),
    maxDamage: Math.max(...rolls),
    minPercent: percent(Math.min(...rolls), defenderMaxHp),
    maxPercent: percent(Math.max(...rolls), defenderMaxHp),
    // Weighted damage of this use of the move (all hits, first-hit effects such as Multiscale,
    // Sturdy and Ice Face included; variable hit counts weighted as Showdown samples them).
    // `rolls` stays the per-roll display list; for multi-hit moves it is not a set of equally
    // likely outcomes, and for variable hit counts it spans the fewest to the most hits.
    distribution: sortedDistribution(firstRollDistribution),
    defenderHp: defenderMaxHp,
    defenderCurrentHp,
    typeMultiplier,
    attackStat,
    defenseStat,
    critical: effectiveCritical,
    ko,
    notes,
  };
}

function sortedDistribution(distribution) {
  return [...distribution].sort((a, b) => a.damage - b.damage);
}

/**
 * Probability that the target is left with HP after one use of the move. Uses the weighted
 * `distribution` when available and falls back to treating `rolls` as equally likely.
 */
export function survivalChance(result, targetHp = result?.defenderCurrentHp) {
  if (!result?.supported) return null;
  const distribution = Array.isArray(result.distribution) && result.distribution.length > 0
    ? result.distribution
    : (result.rolls ?? []).map((damage) => ({ damage, chance: 1 / result.rolls.length }));
  const chance = distribution
    .filter(({ damage }) => damage < targetHp)
    .reduce((sum, { chance: weight }) => sum + weight, 0);
  return chance >= 1 - Number.EPSILON ? 1 : chance;
}

function abilityImmunityResult({ moveType, typeMultiplier, move, defender, defenderTypes, defenderState, suppressDefenderAbility, groundedTarget = false }) {
  if (suppressDefenderAbility) return null;
  const abilityId = normalizeId(defenderState.ability?.id ?? defenderState.ability?.name);
  const abilityName = defenderState.ability?.name ?? defenderState.ability?.id;
  const moveId = normalizeId(move?.id ?? move?.name);
  const types = defenderTypes ?? (defenderState.teraType ? [defenderState.teraType] : defender?.types ?? []);
  if (abilityId === "levitate" && moveType === "Ground" && !groundedTarget && !types.includes("Flying") && !["smackdown", "thousandarrows"].includes(moveId)) {
    return { label: abilityName };
  }
  if (abilityId === "flashfire" && moveType === "Fire") return { label: abilityName };
  if (abilityId === "eartheater" && moveType === "Ground") return { label: abilityName };
  if (abilityId === "bulletproof" && move?.flags?.bullet) return { label: abilityName };
  if (abilityId === "soundproof" && move?.flags?.sound) return { label: abilityName };
  if (["voltabsorb", "motordrive", "lightningrod"].includes(abilityId) && moveType === "Electric") {
    return { label: abilityName };
  }
  if (["waterabsorb", "stormdrain"].includes(abilityId) && moveType === "Water") {
    return { label: abilityName };
  }
  if (abilityId === "dryskin" && moveType === "Water") return { label: abilityName };
  if (abilityId === "sapsipper" && moveType === "Grass") return { label: abilityName };
  if (abilityId === "wellbakedbody" && moveType === "Fire") return { label: abilityName };
  if (abilityId === "wonderguard" && typeMultiplier <= 1) return { label: abilityName };
  return null;
}

// Item immunities are not ability effects, so Mold Breaker and Neutralizing Gas do not bypass them.
function itemImmunityResult({ moveType, move, defenderState, groundedTarget }) {
  const itemId = normalizeId(defenderState.item?.id ?? defenderState.item?.name);
  const moveId = normalizeId(move?.id ?? move?.name);
  if (itemId === "airballoon" && moveType === "Ground" && !groundedTarget && moveId !== "thousandarrows") {
    return { label: defenderState.item?.name ?? "Air Balloon" };
  }
  return null;
}

// End-of-turn and pinch-berry healing the defender gets between hits (Leftovers, Black Sludge,
// Grassy Terrain, Sitrus Berry). Applied after each full move use in the KO calculation.
function defenderRecovery({ defender, defenderState, defenderTypes, defenderMaxHp, defenderCurrentHp, field, suppressDefenderAbility, attackerState, suppressAttackerAbility }) {
  const itemId = normalizeId(defenderState.item?.id ?? defenderState.item?.name);
  const itemName = defenderState.item?.name ?? defenderState.item?.id;
  const labels = [];
  let perTurn = 0;
  const sixteenth = Math.max(1, Math.floor(defenderMaxHp / 16));
  if (itemId === "leftovers" || (itemId === "blacksludge" && defenderTypes.includes("Poison"))) {
    perTurn += sixteenth;
    labels.push(itemName);
  }
  if (normalizeId(field.terrain) === "grassyterrain" && isGrounded(defender, defenderState, field)) {
    perTurn += sixteenth;
    labels.push("Grassy Terrain");
  }
  let pinchHeal = 0;
  const berriesBlocked = !suppressAttackerAbility && hasAnyAbility(attackerState, ["unnerve", "asoneglastrier", "asonespectrier"]);
  if (itemId === "sitrusberry" && !berriesBlocked && defenderCurrentHp > defenderMaxHp / 2) {
    const ripen = !suppressDefenderAbility && hasAbility(defenderState, "ripen");
    pinchHeal = Math.floor(defenderMaxHp / 4) * (ripen ? 2 : 1);
    labels.push(itemName);
  }
  if (!perTurn && !pinchHeal) return null;
  return { maxHp: defenderMaxHp, perTurn, pinchHeal, labels };
}

function teraShellTypeMultiplier(typeMultiplier, defenderState, suppressDefenderAbility) {
  if (suppressDefenderAbility || !hasAbility(defenderState, "terashell")) return null;
  if (Number(defenderState.currentHpFraction ?? 1) !== 1 || typeMultiplier <= 1) return null;
  return 0.5;
}

function isSturdyActive(defenderCurrentHp, defenderMaxHp, defenderState, suppressDefenderAbility) {
  return !suppressDefenderAbility && hasAbility(defenderState, "sturdy") && defenderCurrentHp === defenderMaxHp;
}

// Every roll would OHKO, Sturdy leaves 1 HP, and the next hit KOs.
function sturdySurvivalKo() {
  return {
    hits: null,
    chance: 0,
    text: "survives with Sturdy at full HP",
    chances: [{ hits: 1, chance: 0 }, { hits: 2, chance: 1 }],
  };
}

function koSummaryForRolls(rolls, targetHp, rollDistribution, firstRollDistribution, recovery = null) {
  const chances = koChance({ rolls, rollDistribution, firstRollDistribution, targetHp, recovery });
  const firstKo = chances.find(({ chance }) => chance > 0);
  return {
    hits: firstKo?.hits ?? null,
    chance: firstKo?.chance ?? 0,
    text: koText(chances),
    // Cumulative KO chance per hit count (up to 5 hits), for callers that need more than the first KO.
    chances,
  };
}

function koSummaryForRecalculatedFixedDamage(ctx, firstDamage, maxHits = 5) {
  let remainingHp = ctx.defenderHp;
  const chances = [];
  for (let hits = 1; hits <= maxHits; hits += 1) {
    const damage = hits === 1
      ? firstDamage
      : Math.max(0, fixedDamageValue({ ...ctx, defenderHp: remainingHp }));
    remainingHp = Math.max(0, remainingHp - damage);
    chances.push({ hits, chance: remainingHp === 0 ? 1 : 0 });
    if (remainingHp === 0) break;
  }
  const firstKo = chances.find(({ chance }) => chance > 0);
  return {
    hits: firstKo?.hits ?? null,
    chance: firstKo?.chance ?? 0,
    text: koText(chances),
    chances,
  };
}

// Showdown (gen 5+) samples 2-5 hit moves from [2×7, 3×7, 4×3, 5×3] out of 20.
const STANDARD_MULTIHIT_WEIGHTS = [
  { hits: 2, chance: 0.35 },
  { hits: 3, chance: 0.35 },
  { hits: 4, chance: 0.15 },
  { hits: 5, chance: 0.15 },
];

/**
 * Probability of each hit count for one use of the move, given the resolved hit-count range.
 * - Unmodified 2-5 hit moves: 35/35/15/15 (Showdown's sample table).
 * - Loaded Dice on a 2-5 hit move (range 4-5): Showdown rerolls 2-3 to 4 or 5, so 50/50.
 * - Population Bomb (multiaccuracy, range 1-10): every hit after the first checks accuracy
 *   and the move stops at the first miss; the damage calc assumes the first hit lands.
 * - Loaded Dice on Population Bomb (range 4-10): uniform, as Showdown's 10 - random(7).
 * - Skill Link / explicit hit counts collapse the range to one count.
 * Any other range falls back to uniform weights.
 */
export function hitCountWeights(move, baseRange, hitCounts) {
  const { min, max } = hitCounts;
  if (min === max) return [{ hits: min, chance: 1 }];
  if (baseRange?.min === 2 && baseRange?.max === 5 && min === 2 && max === 5) return STANDARD_MULTIHIT_WEIGHTS;
  if (hitCountsAreAccuracyChained(move, hitCounts)) {
    const accuracy = multiAccuracyPercent(move) / 100;
    return Array.from({ length: max - min + 1 }, (_, index) => {
      const hits = min + index;
      return { hits, chance: hits === max ? accuracy ** (hits - 1) : accuracy ** (hits - 1) * (1 - accuracy) };
    }).filter(({ chance }) => chance > 0);
  }
  return Array.from({ length: max - min + 1 }, (_, index) => ({ hits: min + index, chance: 1 / (max - min + 1) }));
}

function hitCountsAreAccuracyChained(move, hitCounts) {
  return Boolean(move?.multiaccuracy) && hitCounts.min === 1 && hitCounts.max > 1;
}

function multiAccuracyPercent(move) {
  const accuracy = Number(move?.accuracy);
  if (move?.accuracy === true || !Number.isFinite(accuracy)) return 100;
  return Math.max(0, Math.min(100, accuracy));
}

function mixHitCountDistributions(weighted) {
  if (weighted.length === 1 && weighted[0].chance === 1) return weighted[0].distribution;
  const totals = new Map();
  for (const { chance: weight, distribution } of weighted) {
    for (const { damage, chance } of distribution) totals.set(damage, (totals.get(damage) ?? 0) + weight * chance);
  }
  return [...totals].map(([damage, chance]) => ({ damage, chance }));
}

function fullMoveDistribution(hitPowers, hitCount, damageForHit, { negateFirstHit = false, firstHitCap = null, firstUse = true } = {}) {
  const powers = hitPowers.length > 1
    ? hitPowers
    : Array.from({ length: hitCount }, () => hitPowers[0]);
  return convolveDistributions(powers.map((power, index) => DAMAGE_ROLLS.map((roll) => ({
    damage: negateFirstHit && index === 0
      ? 0
      : index === 0 && Number.isFinite(firstHitCap)
        ? Math.min(damageForHit(power, roll, index, firstUse), firstHitCap)
        : damageForHit(power, roll, index, firstUse),
    chance: 1 / DAMAGE_ROLLS.length,
  }))));
}

function stabMultiplier(attackerTypes, attackerState, moveType) {
  const teraType = attackerState.teraType;
  const originalType = attackerTypes.includes(moveType);
  if (!teraType) return originalType ? 1.5 : 1;
  if (moveType === teraType) return originalType ? 2 : 1.5;
  return originalType ? 1.5 : 1;
}

function effectivePokemonTypes(pokemon, state, field, suppressAbility, { moveType, activateTypeChange = false } = {}) {
  // The attacker's pre-Tera types are still needed by the special Tera STAB rules;
  // defender Tera typing is selected by calculateDamage before this helper runs.
  if (state?.teraType) return pokemon.types ?? [];
  if (state?.soaked) return ["Water"];
  if (state?.typeChangeUsed && state?.typeChangeType) return [state.typeChangeType];
  if (
    activateTypeChange &&
    moveType &&
    !suppressAbility &&
    !state?.teraType &&
    !state?.typeChangeUsed &&
    TYPE_CHANGE_ABILITIES.has(normalizeId(state?.ability?.id ?? state?.ability?.name))
  ) return [moveType];
  if (!suppressAbility && hasAbility(state, "forecast")) {
    const forecastType = forecastTypeForWeather(field.weather);
    if (forecastType) return [forecastType];
  }
  return pokemon.types ?? [];
}

function forecastTypeForWeather(weather) {
  const weatherId = normalizeId(weather);
  if (weatherId === "sunnyday" || weatherId === "desolateland") return "Fire";
  if (weatherId === "raindance" || weatherId === "primordialsea") return "Water";
  if (weatherId === "snowscape" || weatherId === "hail") return "Ice";
  return "";
}

function forecastNotes(pokemon, state, types, suppressAbility) {
  if (suppressAbility || !hasAbility(state, "forecast")) return [];
  const originalTypes = pokemon.types ?? [];
  return types.length === 1 && originalTypes.join("/") !== types.join("/")
    ? [`Forecast ${types[0]} type`]
    : [];
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

function hasSnowDefenseBoost(pokemon, state, stat, field, effectiveTypes = null) {
  if (stat !== "def" || normalizeId(field.weather) !== "snowscape") return false;
  const types = effectiveTypes ?? (state.teraType ? [state.teraType] : pokemon.types ?? []);
  return types.includes("Ice");
}

function hasSandstormSpDefenseBoost(pokemon, state, stat, field, effectiveTypes = null) {
  if (stat !== "spd" || normalizeId(field.weather) !== "sandstorm") return false;
  const types = effectiveTypes ?? (state.teraType ? [state.teraType] : pokemon.types ?? []);
  return types.includes("Rock");
}

export function formatDamageResult(result) {
  if (!result.supported) return result.reason ?? "No direct damage";
  return `${result.minDamage}–${result.maxDamage} (${result.minPercent}–${result.maxPercent}%)`;
}

function calculatePokemonStat(pokemon, state, stat, { ignoreStage = false, stagePolicy = sameStage } = {}) {
  const stages = state.stages ?? {};
  const stage = stat === "hp" || ignoreStage ? 0 : stagePolicy(normalizeStage(stages[stat]));
  return calculateStat({
    base: pokemon.baseStats[stat],
    stat,
    sp: normalizeSp(state.sp?.[stat]),
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

function applyPowerModifiers(power, powerChain) {
  return Math.max(1, applyModifier(power, powerChain));
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

/** Resolve all ordinary move/item/weather/terrain conversions before Libero/Protean. */
export function resolveMoveType({ attacker, defender, move, attackerState = {}, defenderState = {}, field = createField(), suppressAttackerAbility = false }) {
  return effectiveMoveType({
    attacker,
    defender,
    move,
    attackerState,
    defenderState,
    field: normalizeField(field),
    suppressAttackerAbility,
  });
}

function typeChangeForMove({ pokemon, state, moveType, suppressAbility }) {
  if (!moveType || state?.teraType || state?.soaked || state?.typeChangeUsed || suppressAbility) {
    return { note: "" };
  }
  const ability = normalizeId(state?.ability?.id ?? state?.ability?.name);
  if (!TYPE_CHANGE_ABILITIES.has(ability)) return { note: "" };
  const originalTypes = pokemon?.types ?? [];
  if (originalTypes.length === 1 && originalTypes[0] === moveType) return { note: "" };
  const abilityName = state.ability?.name ?? state.ability?.id ?? ability;
  return { note: `${abilityName} changed type to ${moveType}` };
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

function normalizeStatusForAbility(state, suppressed) {
  if (suppressed || state?.status !== "burn" || !hasAbility(state, "waterbubble")) return state;
  return { ...state, status: "" };
}

// Showdown: a Terastallized user's moves of its Tera type below 60 BP become 60 BP, except
// priority moves, multi-hit moves, and 0/150 BP moves whose power comes from a callback.
function teraPowerFloorApplies({ move, moveType, attackerState, power, hasPowerCallback }) {
  if (!attackerState.teraType || attackerState.teraType === "Stellar" || attackerState.teraType !== moveType) return false;
  if (!(power < 60) || Number(move.priority ?? 0) > 0 || move.multihit) return false;
  if (hasPowerCallback && (move.basePower === 0 || move.basePower === 150)) return false;
  return true;
}

// Catalog abilities carry Showdown's `flags.breakable`; a bare { id, name } without flags is
// treated as breakable so callers that omit catalog metadata keep the old behaviour.
function isBreakableAbility(ability) {
  if (!ability) return false;
  if (!ability.flags) return true;
  return Boolean(ability.flags.breakable);
}

function attackerAbilitySuppressesDefenderAbility(attackerState, suppressAttackerAbility) {
  if (suppressAttackerAbility) return false;
  const ability = normalizeId(attackerState.ability?.id ?? attackerState.ability?.name);
  return ABILITY_SUPPRESSING_ATTACKER_ABILITIES.has(ability);
}

function hasScrappyBypass(moveType, defenderTypes, attackerState) {
  if (!["Normal", "Fighting"].includes(moveType) || !defenderTypes.includes("Ghost")) return false;
  return hasAnyAbility(attackerState, ["scrappy", "mindseye"]);
}

function percent(value, total) {
  return Math.floor((value * 1000) / total) / 10;
}

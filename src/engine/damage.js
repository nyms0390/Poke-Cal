import { normalizeId } from "../identifiers.js";
import { TYPE_EFFECTIVENESS } from "./type-chart.js";
import { calculateStat } from "./stats.js";
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

const DAMAGE_ROLLS = [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
const SPREAD_MOVE_TARGETS = new Set(["allAdjacent", "allAdjacentFoes"]);
const ABILITY_SUPPRESSING_ATTACKER_ABILITIES = new Set(["moldbreaker", "teravolt", "turboblaze"]);
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

export function typeEffectiveness(moveType, defenderTypes = [], move = null, defenderState = {}, attackerState = {}, options = {}) {
  const moveId = normalizeId(move?.id ?? move?.name);
  if (!options.suppressAttackerAbility && hasScrappyBypass(moveType, defenderTypes, attackerState)) {
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
  const neutralizingGasActive = hasAnyAbility(attackerState, ["neutralizinggas"]) ||
    hasAnyAbility(defenderState, ["neutralizinggas"]);
  const suppressAttackerAbility = neutralizingGasActive;
  const suppressDefenderAbility = neutralizingGasActive ||
    move.ignoreAbility ||
    attackerAbilitySuppressesDefenderAbility(attackerState, suppressAttackerAbility);
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
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };

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
  const attackerTypes = effectivePokemonTypes(attacker, attackerState, effectiveField, suppressAttackerAbility);
  const defenderTypes = defenderState.teraType
    ? [defenderState.teraType]
    : effectivePokemonTypes(defender, defenderState, effectiveField, suppressDefenderAbility);
  const rawTypeMultiplier = typeEffectiveness(moveType, defenderTypes, move, defenderState, attackerState, { suppressAttackerAbility });
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
  const abilityImmunity = abilityImmunityResult({ moveType, typeMultiplier: rawTypeMultiplier, move, defender, defenderState, suppressDefenderAbility });
  const teraShell = teraShellTypeMultiplier(rawTypeMultiplier, defenderState, suppressDefenderAbility);
  const typeMultiplier = abilityImmunity ? 0 : teraShell ?? rawTypeMultiplier;
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
      typeMultiplier,
      critical: effectiveCritical,
      ko: koSummaryForRolls(rolls, defenderCurrentHp),
      notes: [
        abilityImmunity ? "Immune (ability)" : "Immune",
        abilityImmunity?.label,
        ...fieldNotes(effectiveField, attackerState, defenderState),
        ...teraNotes(attackerState, defenderState),
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
      ? { hits: null, chance: 0, text: "survives with Sturdy at full HP" }
      : null;
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
      critical: effectiveCritical,
      ko: sturdyText ?? koSummaryForRolls(rolls, defenderCurrentHp, baseDistribution, firstDistribution),
      notes: [
        "Fixed damage",
        iceFaceActive ? "Ice Face intact (first hit negated)" : null,
        megaSolActive ? "Mega Sol treats this move as Sunny Day" : null,
        ...fieldNotes(effectiveField, attackerState, defenderState),
        moveEffect(moveId).note?.(ctx),
        ...teraNotes(attackerState, defenderState),
      ].filter(Boolean),
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
  const attackIgnoresStage = move.overrideOffensivePokemon === "target" ? attackerHasUnaware : defenderHasUnaware;
  const attack = calculatePokemonStat(attackSource.pokemon, attackSource.state, attackStat, {
    ignoreStage: attackIgnoresStage,
    stagePolicy: criticalStagePolicy("attack", effectiveCritical),
  });
  const baseDefense = calculatePokemonStat(defender, defenderState, defenseStat, {
    ignoreStage: move.ignoreDefensive || attackerHasUnaware,
    stagePolicy: criticalStagePolicy("defense", effectiveCritical),
  });
  const sandstormSpDefenseBoost = hasSandstormSpDefenseBoost(defender, defenderState, defenseStat, effectiveField);
  const defense = sandstormSpDefenseBoost ? Math.floor(baseDefense * 1.5) : baseDefense;
  const notes = [
    ...fieldNotes(effectiveField, attackerState, defenderState),
    ...forecastNotes(attacker, attackerState, attackerTypes, suppressAttackerAbility),
    ...forecastNotes(defender, defenderState, defenderTypes, suppressDefenderAbility),
    ...teraNotes(attackerState, defenderState),
  ];
  if (iceFaceActive) notes.push("Ice Face intact (first hit negated)");
  if (megaSolActive) notes.push("Mega Sol treats this move as Sunny Day");
  if (teraShell !== null) notes.push("Tera Shell");
  if (attackerAbilitySuppressesDefenderAbility(attackerState, suppressAttackerAbility)) notes.push(attackerState.ability.name);
  if (attackerHasUnaware || defenderHasUnaware) notes.push("Unaware");
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
  let defenseModifier = 1;
  const powerModifiers = [];
  let damageModifier = 1;
  let hitPowerMultipliers = null;
  let stab = stabMultiplier(attackerTypes, attackerState, moveType);
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
    defenseStat,
    isPhysical,
    critical: effectiveCritical,
  });
  for (const modifier of modifiers) {
    notes.push(modifier.label);
    if (modifier.kind === "attack") attackModifier *= modifier.value;
    if (modifier.kind === "defense") defenseModifier *= modifier.value;
    if (modifier.kind === "power") powerModifiers.push(modifier.value);
    if (modifier.kind === "damage") damageModifier *= modifier.value;
    if (modifier.kind === "stab") stab = modifier.value;
    if (modifier.kind === "hits") hitCounts = applyHitCountOverride(hitCounts, modifier.value);
    if (modifier.kind === "hitPowerMultipliers") hitPowerMultipliers = modifier.value;
  }

  const selectedHitCount = Number(moveOptions.hitCount);
  if (Number.isFinite(selectedHitCount)) {
    const count = Math.max(hitCounts.min, Math.min(hitCounts.max, Math.trunc(selectedHitCount)));
    hitCounts = { min: count, max: count };
  }

  const baseHitPowers = successiveHitBasePowers(ctx);
  const scaledHitPowers = hitPowerMultipliers && baseHitPowers.length === 1 && hitCounts.min === 1 && hitCounts.max === 1
    ? hitPowerMultipliers.map((multiplier) => Math.max(1, Math.floor(baseHitPowers[0] * multiplier)))
    : baseHitPowers;
  const hitPowers = scaledHitPowers.map((hitPower) => applyPowerModifiers(hitPower, powerModifiers));
  if (hitPowers.length > 1) notes.push(`${move.name} hits ${hitPowers.length} times at ${hitPowers.join("/")}`);
  power = hitPowers[0];
  const modifiedAttack = Math.max(1, Math.floor(attack * attackModifier));
  const modifiedDefense = Math.max(1, Math.floor(defense * defenseModifier));
  const criticalModifier = effectiveCritical
    ? !suppressAttackerAbility && hasAbility(attackerState, "sniper") ? 2.25 : 1.5
    : 1;
  const burnModifier =
    attackerState.status === "burn" && isPhysical &&
      (suppressAttackerAbility || !hasAbility(attackerState, "guts")) && !moveEffect(moveId).ignoreBurn
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
    let hitDamage = baseDamageForPower(hitPower, modifiedAttack, modifiedDefense);
    hitDamage = Math.floor(hitDamage * criticalModifier);
    hitDamage = Math.floor(hitDamage * roll / 100);
    hitDamage = Math.floor(hitDamage * stab);
    hitDamage = Math.floor(hitDamage * typeMultiplier);
    hitDamage = Math.floor(hitDamage * burnModifier);
    hitDamage = Math.floor(hitDamage * spreadModifier);
    hitDamage = Math.floor(hitDamage * damageModifier);
    return Math.max(1, hitDamage);
  };
  const damageForRollCount = (roll, hitCount, negateFirstHit = false) => {
    const powers = hitPowers.length > 1
      ? hitPowers
      : Array.from({ length: hitCount }, () => hitPowers[0]);
    return powers.reduce((total, hitPower, index) =>
      total + (negateFirstHit && index === 0 ? 0 : damageForHit(hitPower, roll)), 0);
  };
  const minHitRolls = DAMAGE_ROLLS.map((roll) => damageForRollCount(roll, hitCounts.min, iceFaceActive));
  const maxHitRolls = DAMAGE_ROLLS.map((roll) => damageForRollCount(roll, hitCounts.max, iceFaceActive));
  const baseRollDistribution = hitCounts.min === hitCounts.max
    ? fullMoveDistribution(hitPowers, hitCounts.min, damageForHit)
    : null;
  const firstRollDistribution = hitCounts.min === hitCounts.max && (iceFaceActive || sturdyActive)
    ? fullMoveDistribution(hitPowers, hitCounts.min, damageForHit, {
      negateFirstHit: iceFaceActive,
      firstHitCap: sturdyActive ? defenderMaxHp - 1 : null,
    })
    : baseRollDistribution;
  const rolls = hitCounts.min === hitCounts.max && hitCounts.min > 1
    ? firstRollDistribution.map(({ damage }) => damage)
    : hitCounts.min === hitCounts.max
      ? minHitRolls
      : [minHitRolls[0], ...maxHitRolls.slice(1)];
  const actualHitCount = hitPowers.length > 1 ? hitPowers.length : hitCounts.min;
  const sturdyAffectsKo = sturdyActive && actualHitCount === 1 && Math.max(...minHitRolls) >= defenderMaxHp;
  const sturdyText = sturdyAffectsKo && Math.min(...minHitRolls) >= defenderMaxHp
    ? { hits: null, chance: 0, text: "survives with Sturdy at full HP" }
    : null;
  let ko = sturdyText ??
    (baseRollDistribution
      ? koSummaryForRolls(rolls, defenderCurrentHp, baseRollDistribution, firstRollDistribution)
      : unavailableKoSummary("KO chance unavailable for variable hit count"));
  if (sturdyAffectsKo && !sturdyText) {
    ko = { ...ko, text: `${ko.text} (Sturdy)` };
  }

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
    attackStat,
    defenseStat,
    critical: effectiveCritical,
    ko,
    notes,
  };
}

function abilityImmunityResult({ moveType, typeMultiplier, move, defender, defenderState, suppressDefenderAbility }) {
  if (suppressDefenderAbility) return null;
  const abilityId = normalizeId(defenderState.ability?.id ?? defenderState.ability?.name);
  const abilityName = defenderState.ability?.name ?? defenderState.ability?.id;
  const moveId = normalizeId(move?.id ?? move?.name);
  const types = defenderState.teraType ? [defenderState.teraType] : defender?.types ?? [];
  if (abilityId === "levitate" && moveType === "Ground" && defenderState.grounded !== true && !types.includes("Flying") && !["smackdown", "thousandarrows"].includes(moveId)) {
    return { label: abilityName };
  }
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

function teraShellTypeMultiplier(typeMultiplier, defenderState, suppressDefenderAbility) {
  if (suppressDefenderAbility || !hasAbility(defenderState, "terashell")) return null;
  if (Number(defenderState.currentHpFraction ?? 1) !== 1 || typeMultiplier <= 1) return null;
  return 0.5;
}

function isSturdyActive(defenderCurrentHp, defenderMaxHp, defenderState, suppressDefenderAbility) {
  return !suppressDefenderAbility && hasAbility(defenderState, "sturdy") && defenderCurrentHp === defenderMaxHp;
}

function koSummaryForRolls(rolls, targetHp, rollDistribution, firstRollDistribution) {
  const chances = koChance({ rolls, rollDistribution, firstRollDistribution, targetHp });
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

function fullMoveDistribution(hitPowers, hitCount, damageForHit, { negateFirstHit = false, firstHitCap = null } = {}) {
  const powers = hitPowers.length > 1
    ? hitPowers
    : Array.from({ length: hitCount }, () => hitPowers[0]);
  return convolveDistributions(powers.map((power, index) => DAMAGE_ROLLS.map((roll) => ({
    damage: negateFirstHit && index === 0
      ? 0
      : index === 0 && Number.isFinite(firstHitCap)
        ? Math.min(damageForHit(power, roll), firstHitCap)
        : damageForHit(power, roll),
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

function effectivePokemonTypes(pokemon, state, field, suppressAbility) {
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

function hasSandstormSpDefenseBoost(pokemon, state, stat, field) {
  if (stat !== "spd" || normalizeId(field.weather) !== "sandstorm") return false;
  const types = state.teraType ? [state.teraType] : pokemon.types ?? [];
  return types.includes("Rock");
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

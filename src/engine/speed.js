import { normalizeId } from "../identifiers.js";
import { applyModifier, chainModifiers } from "./modifiers.js";
import { calculateStat } from "./stats.js";

const PARADOX_STATS = ["atk", "def", "spa", "spd", "spe"];
const PARADOX_STAT_LABELS = {
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const SPEED_CAP = 10000;
const RAIN = new Set(["raindance", "primordialsea"]);
const SUN = new Set(["sunnyday", "desolateland"]);

// Conditional ×2 Speed abilities. `weather`/`terrain` list the field ids that activate them;
// `umbrella` marks the ones Utility Umbrella blocks (Showdown uses pokemon.effectiveWeather()).
const DOUBLING_SPEED_ABILITIES = {
  swiftswim: { label: "Swift Swim", weather: RAIN, umbrella: true },
  chlorophyll: { label: "Chlorophyll", weather: SUN, umbrella: true },
  sandrush: { label: "Sand Rush", weather: new Set(["sandstorm"]) },
  slushrush: { label: "Slush Rush", weather: new Set(["snowscape", "snow", "hail"]) },
  surgesurfer: { label: "Surge Surfer", terrain: new Set(["electricterrain", "electric"]) },
};

/**
 * Pure stat-sheet Speed with optional generic modifiers. Kept for callers that pass raw numbers;
 * it routes through the same 4096-based chain as speedBreakdown().
 */
export function calculateSpeed({
  baseSpeed,
  sp = 0,
  nature = "Hardy",
  stage = 0,
  tailwind = false,
  status = "",
  speedMultiplier = 1,
  trickRoom = false,
}) {
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    throw new RangeError("Speed multiplier must be positive.");
  }

  const rawSpeed = baseSpeed + sp + 20;
  const natureSpeed = calculateStat({ base: baseSpeed, stat: "spe", sp, nature });
  const stagedSpeed = calculateStat({ base: baseSpeed, stat: "spe", sp, nature, stage });
  const modifiers = [];
  if (tailwind) modifiers.push({ label: "Tailwind", value4096: 8192 });
  if (speedMultiplier !== 1) modifiers.push({ label: "Speed modifier", value4096: to4096(speedMultiplier) });
  const modifiedSpeed = finishSpeed(stagedSpeed, modifiers, status === "paralysis");

  return {
    rawSpeed,
    natureSpeed,
    modifiedSpeed,
    effectiveOrder: trickRoom ? SPEED_CAP - modifiedSpeed : modifiedSpeed,
  };
}

/**
 * The single Speed engine shared by battle order, Speed-dependent move power and the Speed
 * tiers page. Mirrors Pokémon Showdown: staged stat → chained ModifySpe modifiers (Tailwind,
 * ability, item, then the manual modifier) applied once with pokeRound → paralysis halves
 * (floor) unless Quick Feet → cap 10000.
 *
 * state: { pokemon, sp: { spe }, nature, stages: { spe }, ability, item, status, tailwind,
 *          speedMultiplier (manual, chained separately; never replaces the item),
 *          itemConsumed, boosterEnergy, currentHpFraction }
 * field: { weather, terrain }
 * options: {
 *   suppressAbility  – Neutralizing Gas etc.: ignore the holder's ability,
 *   suppressWeather  – Cloud Nine / Air Lock on the field,
 *   itemConsumed     – the held item is gone (Unburden active, no item modifier),
 *   abilityActive    – assume a conditional Speed ability's trigger is met even without the
 *                      field state (Speed page "ability active" toggle),
 * }
 */
export function speedBreakdown(state, field = {}, options = {}) {
  if (!state?.pokemon) return null;
  const baseSpeed = state.pokemon.baseStats?.spe ?? state.pokemon.baseSpeed;
  const stagedSpeed = calculateStat({
    base: baseSpeed,
    stat: "spe",
    sp: state.sp?.spe ?? 0,
    nature: state.nature ?? "Hardy",
    stage: state.stages?.spe ?? 0,
  });
  const modifiers = speedModifiers(state, field, options);
  const paralysed = state.status === "paralysis";
  const quickFeet = !options.suppressAbility && abilityIdOf(state) === "quickfeet";
  const speed = finishSpeed(stagedSpeed, modifiers, paralysed && !quickFeet);
  return { stagedSpeed, modifiers, paralysisDrop: paralysed && !quickFeet, speed };
}

/** Ordered ModifySpe modifiers ({ label, value4096, source }) for one side. */
export function speedModifiers(state, field = {}, options = {}) {
  if (!state?.pokemon) return [];
  const suppressAbility = Boolean(options.suppressAbility);
  const weather = options.suppressWeather ? "" : normalizeId(field.weather);
  const terrain = normalizeId(field.terrain);
  const abilityId = suppressAbility ? "" : abilityIdOf(state);
  const itemId = itemIdOf(state);
  const itemConsumed = Boolean(options.itemConsumed ?? state.itemConsumed);
  const forced = Boolean(options.abilityActive ?? false);
  const modifiers = [];

  // Showdown resolves equal-priority ModifySpe handlers side condition → ability → item.
  if (state.tailwind) modifiers.push({ label: "Tailwind", value4096: 8192, source: "field" });

  const ability = abilitySpeedModifier(abilityId, state, {
    weather, terrain, itemId, itemConsumed, forced, field, suppressAbility,
  });
  if (ability) modifiers.push({ ...ability, source: "ability" });

  const unburdenActive = ability?.id === "unburden";
  if (!itemConsumed && !unburdenActive) {
    if (itemId === "choicescarf") modifiers.push({ label: "Choice Scarf", value4096: 6144, source: "item" });
    else if (itemId === "ironball") modifiers.push({ label: "Iron Ball", value4096: 2048, source: "item" });
  }

  const manual = Number(state.speedMultiplier ?? 1);
  if (!Number.isFinite(manual) || manual <= 0) throw new RangeError("Speed multiplier must be positive.");
  if (manual !== 1) modifiers.push({ label: `Speed modifier ×${manual}`, value4096: to4096(manual), source: "manual" });
  return modifiers;
}

/** True when the side's ability currently changes its Speed (for UI labels). */
export function speedAbilityActive(state, field = {}, options = {}) {
  return speedModifiers(state, field, options).some(({ source }) => source === "ability");
}

export function finalSpeedInField(state, field = {}, options = {}) {
  return speedBreakdown(state, field, options)?.speed ?? 0;
}

export function finalSpeed(state, field = {}, options = {}) {
  return finalSpeedInField(state, field, options);
}

export function paradoxBoost(pokemon, state = {}, field = {}, { suppressAbility = false } = {}) {
  if (suppressAbility) return null;
  const abilityId = normalizeId(state.ability?.id ?? state.ability?.name);
  const abilityName = state.ability?.name ?? state.ability?.id;
  const boosterEnergy = Boolean(state.boosterEnergy) || hasItem(state, "boosterenergy");
  const protosynthesisActive = abilityId === "protosynthesis" && (isSun(field.weather) || boosterEnergy);
  const quarkDriveActive = abilityId === "quarkdrive" && (normalizeId(field.terrain) === "electricterrain" || boosterEnergy);
  if (!protosynthesisActive && !quarkDriveActive) return null;

  const stat = highestParadoxStat(pokemon, state);
  if (!stat) return null;
  return {
    stat,
    value: stat === "spe" ? 1.5 : 1.3,
    label: `${abilityName} ${PARADOX_STAT_LABELS[stat]}`,
  };
}

function abilitySpeedModifier(abilityId, state, ctx) {
  if (!abilityId) return null;
  const doubling = DOUBLING_SPEED_ABILITIES[abilityId];
  if (doubling) {
    if (doubling.umbrella && ctx.itemId === "utilityumbrella" && !ctx.itemConsumed) return null;
    const met = ctx.forced ||
      (doubling.weather?.has(ctx.weather) ?? false) ||
      (doubling.terrain?.has(ctx.terrain) ?? false);
    return met ? { id: abilityId, label: doubling.label, value4096: 8192 } : null;
  }
  if (abilityId === "unburden") {
    // Showdown: volatile 'unburden' and no held item. Forcing the ability implies the item is gone.
    return ctx.itemConsumed || ctx.forced ? { id: abilityId, label: "Unburden", value4096: 8192 } : null;
  }
  if (abilityId === "quickfeet") {
    return state.status ? { id: abilityId, label: "Quick Feet", value4096: 6144 } : null;
  }
  const paradox = paradoxBoost(state.pokemon, state, weatherAwareField(ctx), {
    suppressAbility: ctx.suppressAbility,
  });
  if (paradox?.stat === "spe") return { id: abilityId, label: paradox.label, value4096: 6144 };
  return null;
}

function weatherAwareField(ctx) {
  return { ...ctx.field, weather: ctx.weather };
}

function finishSpeed(stagedSpeed, modifiers, paralysisDrop) {
  const chain = chainModifiers(modifiers.map(({ value4096 }) => value4096));
  let speed = applyModifier(stagedSpeed, chain);
  // Gen 7+ paralysis: onModifySpePriority -101, finalModify() first, then floor(spe * 50 / 100).
  if (paralysisDrop) speed = Math.floor((speed * 50) / 100);
  return Math.max(1, Math.min(SPEED_CAP, speed));
}

function to4096(multiplier) {
  return Math.round(multiplier * 4096);
}

function highestParadoxStat(pokemon, state) {
  const baseStats = pokemon?.baseStats ?? {};
  let winner = "";
  let winnerValue = -Infinity;
  for (const stat of PARADOX_STATS) {
    const base = baseStats[stat];
    if (!Number.isFinite(base)) continue;
    const value = calculateStat({
      base,
      stat,
      sp: state.sp?.[stat] ?? 0,
      nature: state.nature ?? "Hardy",
    });
    if (value > winnerValue) {
      winner = stat;
      winnerValue = value;
    }
  }
  return winner;
}

function abilityIdOf(state) {
  return normalizeId(state?.ability?.id ?? state?.ability?.name);
}

function itemIdOf(state) {
  return normalizeId(state?.item?.id ?? state?.item?.name);
}

function hasItem(state, itemId) {
  return itemIdOf(state) === itemId;
}

function isSun(weather) {
  return SUN.has(normalizeId(weather));
}

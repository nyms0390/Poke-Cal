import { normalizeId } from "../identifiers.js";
import { calculateStat } from "./stats.js";

const PARADOX_STATS = ["atk", "def", "spa", "spd", "spe"];
const PARADOX_STAT_LABELS = {
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

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
  let modifiedSpeed = calculateStat({ base: baseSpeed, stat: "spe", sp, nature, stage });
  modifiedSpeed = Math.floor(modifiedSpeed * speedMultiplier);

  if (tailwind) modifiedSpeed *= 2;
  if (status === "paralysis") modifiedSpeed = Math.floor(modifiedSpeed / 2);

  modifiedSpeed = Math.max(1, Math.min(10000, modifiedSpeed));

  return {
    rawSpeed,
    natureSpeed,
    modifiedSpeed,
    effectiveOrder: trickRoom ? 10000 - modifiedSpeed : modifiedSpeed,
  };
}

export function finalSpeed(state, field = {}, options = {}) {
  return finalSpeedInField(state, field, options);
}

export function finalSpeedInField(state, field = {}, { suppressAbility = false } = {}) {
  if (!state?.pokemon) return 0;
  const manualSpeedMultiplier = Number(state.speedMultiplier ?? 1);
  const speedMultiplier = hasItem(state, "choicescarf") && manualSpeedMultiplier !== 1.5
    ? manualSpeedMultiplier * 1.5
    : manualSpeedMultiplier;
  const paradox = paradoxBoost(state.pokemon, state, field, { suppressAbility });

  const speed = calculateSpeed({
    baseSpeed: state.pokemon.baseStats?.spe ?? state.pokemon.baseSpeed,
    sp: state.sp?.spe ?? 0,
    nature: state.nature,
    stage: state.stages?.spe ?? 0,
    speedMultiplier,
    tailwind: state.tailwind,
    status: state.status,
  }).modifiedSpeed;
  return paradox?.stat === "spe" ? Math.floor(speed * paradox.value) : speed;
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

function hasItem(state, itemId) {
  return normalizeId(state.item?.id ?? state.item?.name) === itemId;
}

function isSun(weather) {
  const weatherId = normalizeId(weather);
  return weatherId === "sunnyday" || weatherId === "desolateland";
}

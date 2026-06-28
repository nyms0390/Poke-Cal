import { calculateStat } from "./damage.js";

export function calculateSpeed({
  baseSpeed,
  sp = 0,
  nature = "Hardy",
  stage = 0,
  tailwind = false,
  paralyzed = false,
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
  if (paralyzed) modifiedSpeed = Math.floor(modifiedSpeed / 2);

  modifiedSpeed = Math.max(1, Math.min(10000, modifiedSpeed));

  return {
    rawSpeed,
    natureSpeed,
    modifiedSpeed,
    effectiveOrder: trickRoom ? 10000 - modifiedSpeed : modifiedSpeed,
  };
}

export function finalSpeed(state) {
  if (!state?.pokemon) return 0;
  const manualSpeedMultiplier = Number(state.speedMultiplier ?? 1);
  const speedMultiplier = hasItem(state, "choicescarf") && manualSpeedMultiplier !== 1.5
    ? manualSpeedMultiplier * 1.5
    : manualSpeedMultiplier;

  return calculateSpeed({
    baseSpeed: state.pokemon.baseStats?.spe ?? state.pokemon.baseSpeed,
    sp: state.sp?.spe ?? 0,
    nature: state.nature,
    stage: state.stages?.spe ?? 0,
    speedMultiplier,
    tailwind: state.tailwind,
    paralyzed: state.paralyzed,
  }).modifiedSpeed;
}

function hasItem(state, itemId) {
  return normalizeId(state.item?.id ?? state.item?.name) === itemId;
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

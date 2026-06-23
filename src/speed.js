const NATURE_MULTIPLIERS = {
  negative: 0.9,
  neutral: 1,
  positive: 1.1,
};

export function calculateSpeed({
  baseSpeed,
  sp = 0,
  nature = "neutral",
  stage = 0,
  tailwind = false,
  paralyzed = false,
  speedMultiplier = 1,
  trickRoom = false,
}) {
  if (!Number.isInteger(baseSpeed) || baseSpeed < 1) {
    throw new RangeError("Base Speed must be a positive integer.");
  }
  if (!Number.isInteger(sp) || sp < 0 || sp > 32) {
    throw new RangeError("SP must be an integer from 0 to 32.");
  }
  if (!Number.isInteger(stage) || stage < -6 || stage > 6) {
    throw new RangeError("Speed stage must be an integer from -6 to +6.");
  }
  if (!(nature in NATURE_MULTIPLIERS)) {
    throw new RangeError("Nature must be negative, neutral, or positive.");
  }
  if (!Number.isFinite(speedMultiplier) || speedMultiplier <= 0) {
    throw new RangeError("Speed multiplier must be positive.");
  }

  const rawSpeed = baseSpeed + sp + 20;
  const natureSpeed = Math.floor(rawSpeed * NATURE_MULTIPLIERS[nature]);
  let modifiedSpeed = applyStage(natureSpeed, stage);
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

function applyStage(speed, stage) {
  if (stage >= 0) return Math.floor((speed * (2 + stage)) / 2);
  return Math.floor((speed * 2) / (2 - stage));
}

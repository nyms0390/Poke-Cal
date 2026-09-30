import { normalizeId } from "../identifiers.js";
import { hitCountRange } from "../engine/damage.js";
import { moveEffect } from "../engine/move-effects.js";

const BOOLEAN_LABELS = {
  acrobatics: "battle.condition.noItem",
  hex: "battle.condition.targetStatus",
  infernalparade: "battle.condition.targetStatus",
  venoshock: "battle.condition.targetPoisoned",
  barbbarrage: "battle.condition.targetPoisoned",
  smellingsalts: "battle.condition.targetParalyzed",
  wakeupslap: "battle.condition.targetAsleep",
  facade: "battle.condition.userStatus",
  assurance: "battle.condition.targetDamaged",
  avalanche: "battle.condition.userDamagedByTarget",
  revenge: "battle.condition.userDamagedByTarget",
  lashout: "battle.condition.statsLowered",
  stompingtantrum: "battle.condition.previousFailed",
  temperflare: "battle.condition.previousFailed",
  round: "battle.condition.priorRound",
  earthquake: "battle.condition.targetDigging",
  surf: "battle.condition.targetDiving",
  whirlpool: "battle.condition.targetDiving",
  bodyslam: "battle.condition.targetMinimized",
  dragonrush: "battle.condition.targetMinimized",
  flyingpress: "battle.condition.targetMinimized",
  heatcrash: "battle.condition.targetMinimized",
  heavyslam: "battle.condition.targetMinimized",
  supercellslam: "battle.condition.targetMinimized",
};

const COUNT_CONTROLS = {
  lastrespects: { key: "faintedAllyCount", labelKey: "battle.condition.faintedAllies", min: 0, max: 5 },
  ragefist: { key: "hitsReceived", labelKey: "battle.condition.hitsReceived", min: 0, max: 6 },
  spitup: { key: "stockpileCount", labelKey: "battle.condition.stockpile", min: 0, max: 3 },
  beatup: { key: "beatUpPartyCount", labelKey: "battle.condition.eligibleAllies", min: 1, max: 6 },
};

const auto = { value: "auto", labelKey: "battle.auto" };
const yesNo = [auto, { value: "yes", labelKey: "battle.yes" }, { value: "no", labelKey: "battle.no" }];

export function moveConditionDescriptors(move, attackerState = {}) {
  if (!move) return [];
  const id = normalizeId(move.id ?? move.name);
  const effect = moveEffect(id);
  const controls = [];
  const hitRange = hitCountRange({ move, attackerState });
  if (hitRange.min !== hitRange.max) controls.push({
    key: "hitCount", labelKey: "battle.hits",
    choices: [auto, ...Array.from({ length: hitRange.max - hitRange.min + 1 }, (_, offset) => {
      const value = String(hitRange.min + offset);
      return { value, label: value };
    })],
  });
  if (effect.orderCondition) controls.push({ key: "targetMoved", labelKey: "battle.targetMoved", choices: yesNo });
  if (BOOLEAN_LABELS[id]) controls.push({ key: "conditionOverride", labelKey: BOOLEAN_LABELS[id], choices: yesNo });
  const count = COUNT_CONTROLS[id];
  if (count) controls.push({ key: count.key, labelKey: count.labelKey,
    choices: [auto, ...Array.from({ length: count.max - count.min + 1 }, (_, offset) => {
      const value = String(count.min + offset);
      return { value, label: value };
    })],
  });
  if (id === "ficklebeam") controls.push({ key: "allOut", labelKey: "battle.condition.fickleBeam",
    choices: [auto, { value: "yes", labelKey: "battle.condition.allOut" }, { value: "no", labelKey: "battle.condition.normal" }] });
  return controls;
}

export function moveConditionValue(state, index, descriptor) {
  const value = state?.moveOptionsBySlot?.[index]?.[descriptor.key];
  if (value !== undefined && value !== null) {
    return descriptor.choices.some((choice) => choice.value === String(value)) ? String(value) : "auto";
  }
  const old = descriptor.key === "hitCount" ? state?.selectedHitCounts?.[index]
    : descriptor.key === "targetMoved" ? state?.targetMovedOverrides?.[index]
      : descriptor.key === "conditionOverride" ? state?.conditionOverrides?.[index] : null;
  if (old === null || old === undefined) return "auto";
  const normalized = typeof old === "boolean" ? old ? "yes" : "no" : String(old);
  return descriptor.choices.some((choice) => choice.value === normalized) ? normalized : "auto";
}

export function moveOptionsForSlot(state, index, move) {
  const descriptors = moveConditionDescriptors(move, state);
  const options = {};
  for (const descriptor of descriptors) {
    const value = moveConditionValue(state, index, descriptor);
    if (value === "auto") continue;
    options[descriptor.key] = value === "yes" ? true : value === "no" ? false : Number(value);
  }
  return options;
}

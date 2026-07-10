// Registry of per-move special-case behavior. Replaces the `if (moveId === "...")` ladders
// that used to live in src/damage.js (effectiveMoveType, effectiveMovePower, fixedDamageKind,
// hitCountRange, successiveHitBasePowers, and the Photon Geyser inline branch).
//
// Every handler is optional. The base context is
//   ctx = { move, attacker, defender, attackerState, defenderState, field }
// A few handlers need one or two extra precomputed values that damage.js already has to hand
// (e.g. `defenderHp`, `power`, `physicalAttack`/`specialAttack`); damage.js spreads those onto
// ctx at the call site. See src/damage.js for exactly which handler gets which extra fields.
//
// Handler shapes:
//   moveType(ctx)     -> string | undefined        (undefined = fall back to move.type)
//   basePower(ctx)    -> number | null | undefined (undefined = fall back to move.basePower,
//                                                     null = required data missing)
//   hits(ctx)         -> [min, max] | number        (number = fixed hit count)
//   alwaysCrit        -> boolean                    (the move always critical-hits)
//   note(ctx)         -> string                     (post-use or other display note)
//   ignoreBurn        -> boolean                    (the physical burn penalty is ignored)
//   orderCondition    -> "before" | "after" | "history" (power-doubling assumption)
//   hitPowers(ctx)     -> number[]                  (per-hit power list, e.g. Triple Axel)
//   fixedDamage(ctx)  -> number                      (moveId-specific fixed damage amount;
//                                                     the generic numeric/"level" cases are
//                                                     handled directly in damage.js since they
//                                                     read move.damage, not a moveId)
//   offensiveStat(ctx) -> "atk" | "spa"              (Photon Geyser)

import { isGrounded } from "./field.js";
import { finalSpeed } from "./speed.js";

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const WEATHER_BALL_TYPES = {
  desolateland: "Fire",
  sunnyday: "Fire",
  primordialsea: "Water",
  raindance: "Water",
  sandstorm: "Rock",
  snowscape: "Ice",
  hail: "Ice",
};
const TERRAIN_PULSE_TYPES = {
  electricterrain: "Electric",
  grassyterrain: "Grass",
  mistyterrain: "Fairy",
  psychicterrain: "Psychic",
};

const PLEDGE_MOVE_IDS = new Set(["firepledge", "waterpledge", "grasspledge"]);
const USER_HP_POWER_MOVE_IDS = new Set(["dragonenergy", "eruption", "waterspout"]);
const TARGET_WEIGHT_POWER_MOVE_IDS = new Set(["grassknot", "lowkick"]);
const USER_TARGET_WEIGHT_POWER_MOVE_IDS = new Set(["heatcrash", "heavyslam"]);
const BOOSTABLE_STAGE_KEYS = ["atk", "def", "spa", "spd", "spe"];

export function isPledgeMove(move) {
  return PLEDGE_MOVE_IDS.has(normalizeId(move.id ?? move.name));
}

export function weatherBlockedByUmbrella(weather, item) {
  const weatherId = normalizeId(weather);
  if (normalizeId(item?.id ?? item?.name) !== "utilityumbrella") return false;
  return weatherId === "raindance" || weatherId === "primordialsea" ||
    weatherId === "sunnyday" || weatherId === "desolateland";
}

function beatUpBasePower(attacker, attackerState) {
  const baseAttack = attackerState.beatUpBaseAttack ?? attacker?.baseStats?.atk;
  if (!Number.isFinite(baseAttack)) return null;
  return Math.max(1, 5 + Math.floor(baseAttack / 10));
}

function eligibleBeatUpPartyCount(attackerState) {
  const count = attackerState.beatUpPartyCount ?? attackerState.partyMemberCount ?? attackerState.partyCount ?? 6;
  if (!Number.isFinite(count)) return 6;
  return Math.min(6, Math.max(1, Math.floor(count)));
}

export function currentHp(state, maxHp) {
  const fraction = Number(state.currentHpFraction ?? 1);
  if (!Number.isFinite(fraction)) return maxHp;
  return Math.min(maxHp, Math.max(1, Math.round(maxHp * fraction)));
}

function userHpScaledBasePower(basePower, attacker, attackerState, maxHp) {
  const hp = currentHp(attackerState, maxHp);
  return Math.max(1, Math.floor((basePower * hp) / maxHp));
}

function targetHpScaledBasePower(basePower, defenderHp, defenderMaxHp) {
  return Math.max(1, Math.floor((basePower * defenderHp) / defenderMaxHp));
}

function lowUserHpBasePower(attackerHp, attackerMaxHp) {
  const fraction = attackerHp / attackerMaxHp;
  if (fraction > 0.6875) return 20;
  if (fraction > 0.354) return 40;
  if (fraction > 0.208) return 80;
  if (fraction > 0.104) return 100;
  if (fraction > 0.042) return 150;
  return 200;
}

function positiveStageCount(state) {
  return BOOSTABLE_STAGE_KEYS.reduce((total, key) => total + Math.max(0, state.stages?.[key] ?? 0), 0);
}

function targetWeightKg(defender, defenderState) {
  const weight = defenderState.weightkg ?? defenderState.weightKg ?? defender?.weightkg ?? defender?.weightKg;
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function pokemonWeightKg(pokemon, state) {
  const weight = state.weightkg ?? state.weightKg ?? pokemon?.weightkg ?? pokemon?.weightKg;
  return Number.isFinite(weight) && weight > 0 ? weight : null;
}

function targetWeightBasePower(weightKg) {
  if (weightKg < 10) return 20;
  if (weightKg < 25) return 40;
  if (weightKg < 50) return 60;
  if (weightKg < 100) return 80;
  if (weightKg < 200) return 100;
  return 120;
}

function userTargetWeightBasePower(attackerWeightKg, defenderWeightKg) {
  if (attackerWeightKg >= defenderWeightKg * 5) return 120;
  if (attackerWeightKg >= defenderWeightKg * 4) return 100;
  if (attackerWeightKg >= defenderWeightKg * 3) return 80;
  if (attackerWeightKg >= defenderWeightKg * 2) return 60;
  return 40;
}

export const MOVE_EFFECTS = {
  // -- moveType overrides --------------------------------------------------
  hiddenpower: { moveType: (ctx) => ctx.move.hiddenPowerType || "Dark" },
  judgment: { moveType: (ctx) => ctx.attackerState.item?.onPlate },
  multiattack: { moveType: (ctx) => ctx.attackerState.item?.onMemory },
  technoblast: { moveType: (ctx) => ctx.attackerState.item?.onDrive },
  terablast: {
    moveType: (ctx) => ctx.attackerState.teraType || "Normal",
    offensiveStat: (ctx) => ctx.attackerState.teraType && ctx.physicalAttack > ctx.specialAttack ? "atk" : "spa",
  },
  revelationdance: {
    moveType: (ctx) => ctx.attacker.types.find((type) => type !== "Typeless") ?? ctx.move.type,
  },
  ragingbull: {
    moveType: (ctx) => {
      const attackerId = normalizeId(ctx.attacker.id ?? ctx.attacker.name);
      if (attackerId === "taurospaldeaaqua") return "Water";
      if (attackerId === "taurospaldeablaze") return "Fire";
      if (attackerId === "taurospaldeacombat") return "Fighting";
      return undefined;
    },
  },
  ivycudgel: {
    moveType: (ctx) => {
      const attackerId = normalizeId(ctx.attacker.id ?? ctx.attacker.name);
      if (attackerId.includes("wellspring")) return "Water";
      if (attackerId.includes("hearthflame")) return "Fire";
      if (attackerId.includes("cornerstone")) return "Rock";
      return undefined;
    },
  },

  // -- naturalgift: type + power both come from the held Berry -----------
  naturalgift: {
    moveType: (ctx) => ctx.attackerState.item?.naturalGift?.type,
    basePower: (ctx) => ctx.attackerState.item?.naturalGift?.basePower ?? null,
  },

  // -- weatherball / terrainpulse: type and power move together ----------
  weatherball: {
    moveType: (ctx) => {
      if (weatherBlockedByUmbrella(ctx.field.weather, ctx.attackerState.item)) return undefined;
      return WEATHER_BALL_TYPES[normalizeId(ctx.field.weather)];
    },
    basePower: (ctx) => {
      if (!WEATHER_BALL_TYPES[normalizeId(ctx.field.weather)]) return undefined;
      if (weatherBlockedByUmbrella(ctx.field.weather, ctx.attackerState.item)) return undefined;
      return ctx.move.basePower * 2;
    },
  },
  terrainpulse: {
    moveType: (ctx) => {
      if (!isGrounded(ctx.attacker, ctx.attackerState, ctx.field)) return undefined;
      return TERRAIN_PULSE_TYPES[normalizeId(ctx.field.terrain)];
    },
    basePower: (ctx) => {
      if (!TERRAIN_PULSE_TYPES[normalizeId(ctx.field.terrain)]) return undefined;
      if (!isGrounded(ctx.attacker, ctx.attackerState, ctx.field)) return undefined;
      return ctx.move.basePower * 2;
    },
  },

  // -- other terrain/weather power boosts ---------------------------------
  expandingforce: {
    basePower: (ctx) => {
      if (normalizeId(ctx.field.terrain) !== "psychicterrain" || !isGrounded(ctx.attacker, ctx.attackerState, ctx.field)) return undefined;
      return Math.floor(ctx.move.basePower * 1.5);
    },
  },
  risingvoltage: {
    basePower: (ctx) => {
      if (normalizeId(ctx.field.terrain) !== "electricterrain" || !isGrounded(ctx.defender, ctx.defenderState, ctx.field)) return undefined;
      return ctx.move.basePower * 2;
    },
  },
  psyblade: {
    basePower: (ctx) => {
      if (normalizeId(ctx.field.terrain) !== "electricterrain") return undefined;
      return Math.floor(ctx.move.basePower * 1.5);
    },
  },
  gravapple: {
    basePower: (ctx) => (ctx.field.gravity ? Math.floor(ctx.move.basePower * 1.5) : undefined),
  },

  // -- sun/rain-halved charge moves ---------------------------------------
  solarbeam: { basePower: solarPowerHandler },
  solarblade: { basePower: solarPowerHandler },

  // -- pledge combo: forced 150 power (STAB is handled separately in damage.js) --
  firepledge: { basePower: pledgePowerHandler },
  waterpledge: { basePower: pledgePowerHandler },
  grasspledge: { basePower: pledgePowerHandler },

  // -- beatup: power from base Attack, hit count from party size ---------
  beatup: {
    basePower: (ctx) => beatUpBasePower(ctx.attacker, ctx.attackerState),
    hits: (ctx) => eligibleBeatUpPartyCount(ctx.attackerState),
  },

  // -- current-HP-scaled power ---------------------------------------------
  dragonenergy: { basePower: userHpPowerHandler },
  eruption: { basePower: userHpPowerHandler },
  waterspout: { basePower: userHpPowerHandler },

  // -- target-HP-scaled power ----------------------------------------------
  hardpress: { basePower: (ctx) => targetHpScaledBasePower(100, ctx.defenderHp, ctx.defenderMaxHp) },
  crushgrip: { basePower: (ctx) => targetHpScaledBasePower(120, ctx.defenderHp, ctx.defenderMaxHp) },
  wringout: { basePower: (ctx) => targetHpScaledBasePower(120, ctx.defenderHp, ctx.defenderMaxHp) },
  brine: {
    basePower: (ctx) => Number(ctx.defenderState.currentHpFraction ?? 1) <= 0.5
      ? ctx.move.basePower * 2
      : undefined,
  },

  // -- low-user-HP and stat-stage-scaled power -----------------------------
  flail: { basePower: (ctx) => lowUserHpBasePower(ctx.attackerHp, ctx.attackerMaxHp) },
  reversal: { basePower: (ctx) => lowUserHpBasePower(ctx.attackerHp, ctx.attackerMaxHp) },
  storedpower: { basePower: (ctx) => 20 + 20 * positiveStageCount(ctx.attackerState) },
  powertrip: { basePower: (ctx) => 20 + 20 * positiveStageCount(ctx.attackerState) },
  punishment: { basePower: (ctx) => Math.min(200, 60 + 20 * positiveStageCount(ctx.defenderState)) },

  // -- context assumptions / item-derived power ----------------------------
  acrobatics: { basePower: (ctx) => !ctx.attackerState.item ? ctx.move.basePower * 2 : undefined },
  fling: { basePower: (ctx) => ctx.attackerState.item?.fling?.basePower ?? null },
  return: { basePower: () => 102, note: () => "Assumes maximum friendship (102 BP)" },
  frustration: { basePower: () => 102, note: () => "Assumes minimum friendship (102 BP)" },
  pikapapow: { basePower: () => 102, note: () => "Assumes maximum friendship (102 BP)" },
  veeveevolley: { basePower: () => 102, note: () => "Assumes maximum friendship (102 BP)" },
  spitup: { basePower: () => 300, note: () => "Assumes 3 Stockpile uses (300 BP)" },
  trumpcard: { basePower: () => 40, note: () => "Assumes 5+ PP remaining (40 BP)" },
  pursuit: { note: () => "×2 on switch not modeled" },
  ficklebeam: { basePower: () => 80, note: () => "Assumes the 80 BP outcome; 30% chance of 140 BP" },
  magnitude: { basePower: () => 70, note: () => "Assumes Magnitude 7 (70 BP)" },
  present: { basePower: () => 80, note: () => "Assumes the 80 BP outcome" },
  psywave: { fixedDamage: () => 50, note: () => "Assumes the level-50 average (50 damage)" },
  saltcure: { note: () => "Salt Cure residual: 1/8 max HP (1/4 vs Water/Steel) per turn" },
  endeavor: { fixedDamage: (ctx) => Math.max(0, ctx.defenderHp - ctx.attackerHp) },

  // -- target-weight-scaled power ------------------------------------------
  grassknot: { basePower: targetWeightPowerHandler },
  lowkick: { basePower: targetWeightPowerHandler },

  // -- user-versus-target-weight-ratio power -------------------------------
  heatcrash: { basePower: userTargetWeightPowerHandler },
  heavyslam: { basePower: userTargetWeightPowerHandler },

  // -- speed-scaled and order-conditional power ----------------------------
  gyroball: { basePower: gyroBallPower },
  electroball: { basePower: electroBallPower },
  boltbeak: { orderCondition: "before", basePower: orderConditionalPower, note: orderAssumptionNote },
  fishiousrend: { orderCondition: "before", basePower: orderConditionalPower, note: orderAssumptionNote },
  payback: { orderCondition: "after", basePower: orderConditionalPower, note: orderAssumptionNote },
  avalanche: { orderCondition: "history", basePower: orderConditionalPower, note: orderAssumptionNote },
  assurance: { orderCondition: "history", basePower: orderConditionalPower, note: orderAssumptionNote },
  revenge: { orderCondition: "history", basePower: orderConditionalPower, note: orderAssumptionNote },

  // -- status-conditional power --------------------------------------------
  hex: { basePower: (ctx) => ctx.defenderState.status ? ctx.move.basePower * 2 : undefined },
  venoshock: { basePower: (ctx) => ["poison", "toxic"].includes(ctx.defenderState.status) ? ctx.move.basePower * 2 : undefined },
  barbbarrage: { basePower: (ctx) => ["poison", "toxic"].includes(ctx.defenderState.status) ? ctx.move.basePower * 2 : undefined },
  infernalparade: { basePower: (ctx) => ctx.defenderState.status ? ctx.move.basePower * 2 : undefined },
  smellingsalts: { basePower: (ctx) => ctx.defenderState.status === "paralysis" ? ctx.move.basePower * 2 : undefined },
  wakeupslap: { basePower: (ctx) => ctx.defenderState.status === "sleep" ? ctx.move.basePower * 2 : undefined },
  facade: {
    basePower: (ctx) => ["burn", "poison", "toxic", "paralysis"].includes(ctx.attackerState.status)
      ? ctx.move.basePower * 2
      : undefined,
    ignoreBurn: true,
  },

  // -- fixed damage ---------------------------------------------------------
  superfang: { fixedDamage: (ctx) => Math.floor(ctx.defenderHp / 2) },
  ruination: { fixedDamage: (ctx) => Math.floor(ctx.defenderHp / 2) },
  naturesmadness: { fixedDamage: (ctx) => Math.floor(ctx.defenderHp / 2) },
  finalgambit: { fixedDamage: (ctx) => currentHp(ctx.attackerState, ctx.attackerMaxHp) },

  // -- variable/multi hit counts --------------------------------------------
  populationbomb: {
    hits: [1, 10],
  },

  // -- standard multi-hit moves -------------------------------------------
  bulletseed: { hits: [2, 5] },
  iciclespear: { hits: [2, 5] },
  bonerush: { hits: [2, 5] },
  rockblast: { hits: [2, 5] },
  watershuriken: { hits: [2, 5] },
  armthrust: { hits: [2, 5] },
  barrage: { hits: [2, 5] },
  cometpunch: { hits: [2, 5] },
  doubleslap: { hits: [2, 5] },
  furyattack: { hits: [2, 5] },
  furyswipes: { hits: [2, 5] },
  pinmissile: { hits: [2, 5] },
  spikecannon: { hits: [2, 5] },
  tailslap: { hits: [2, 5] },
  scaleshot: { hits: [2, 5], note: () => "-1 Def / +1 Spe after use" },
  surgingstrikes: { hits: 3, alwaysCrit: true },
  tripledive: { hits: 3 },

  // -- successive-hit power lists -------------------------------------------
  tripleaxel: { hitPowers: (ctx) => [ctx.power, ctx.power * 2, ctx.power * 3] },
  triplekick: { hitPowers: (ctx) => [ctx.power, ctx.power * 2, ctx.power * 3] },

  // -- dynamic offensive stat selection --------------------------------------
  photongeyser: {
    offensiveStat: (ctx) => (ctx.physicalAttack > ctx.specialAttack ? "atk" : "spa"),
  },
};

function solarPowerHandler(ctx) {
  if (!ctx.field.weather) return undefined;
  if (weatherBlockedByUmbrella(ctx.field.weather, ctx.attackerState.item)) return undefined;
  const weatherId = normalizeId(ctx.field.weather);
  if (weatherId === "sunnyday" || weatherId === "desolateland") return undefined;
  return Math.floor(ctx.move.basePower * 0.5);
}

function pledgePowerHandler(ctx) {
  return ctx.field.pledgeCombo ? 150 : undefined;
}

function userHpPowerHandler(ctx) {
  return userHpScaledBasePower(ctx.move.basePower, ctx.attacker, ctx.attackerState, ctx.attackerMaxHp);
}

function targetWeightPowerHandler(ctx) {
  const weight = targetWeightKg(ctx.defender, ctx.defenderState);
  return weight === null ? null : targetWeightBasePower(weight);
}

function userTargetWeightPowerHandler(ctx) {
  const attackerWeight = pokemonWeightKg(ctx.attacker, ctx.attackerState);
  const defenderWeight = pokemonWeightKg(ctx.defender, ctx.defenderState);
  return attackerWeight === null || defenderWeight === null
    ? null
    : userTargetWeightBasePower(attackerWeight, defenderWeight);
}

function gyroBallPower(ctx) {
  const userSpeed = Math.max(1, finalSpeed(ctx.attackerState));
  const targetSpeed = finalSpeed(ctx.defenderState);
  return Math.min(150, Math.floor((25 * targetSpeed) / userSpeed) + 1);
}

function electroBallPower(ctx) {
  const userSpeed = finalSpeed(ctx.attackerState);
  const targetSpeed = Math.max(1, finalSpeed(ctx.defenderState));
  const ratio = userSpeed / targetSpeed;
  if (ratio >= 4) return 150;
  if (ratio >= 3) return 120;
  if (ratio >= 2) return 80;
  if (ratio >= 1) return 60;
  return 40;
}

function targetMovedForOrder(ctx) {
  if (typeof ctx.moveOptions?.targetMoved === "boolean") return ctx.moveOptions.targetMoved;
  const opponentMove = ctx.moveOptions?.opponentMove;
  if (!opponentMove) return false;

  const attackerPriority = Number(ctx.move.priority ?? 0);
  const defenderPriority = Number(opponentMove.priority ?? 0);
  if (attackerPriority !== defenderPriority) return defenderPriority > attackerPriority;

  const attackerSpeed = finalSpeed(ctx.attackerState);
  const defenderSpeed = finalSpeed(ctx.defenderState);
  if (attackerSpeed === defenderSpeed) return false;
  return ctx.field.trickRoom ? defenderSpeed < attackerSpeed : defenderSpeed > attackerSpeed;
}

function orderConditionalPower(ctx) {
  const targetMoved = targetMovedForOrder(ctx);
  const condition = moveEffect(normalizeId(ctx.move.id ?? ctx.move.name)).orderCondition;
  const doubles = condition === "before" ? !targetMoved : targetMoved;
  return doubles ? ctx.move.basePower * 2 : undefined;
}

function orderAssumptionNote(ctx) {
  return `Assumes target ${targetMovedForOrder(ctx) ? "already moved" : "has not moved"}`;
}

export function moveEffect(moveId) {
  return MOVE_EFFECTS[moveId] ?? {};
}

export function isOrderConditionalMove(move) {
  return Boolean(moveEffect(normalizeId(move?.id ?? move?.name)).orderCondition);
}

export { USER_HP_POWER_MOVE_IDS, TARGET_WEIGHT_POWER_MOVE_IDS, USER_TARGET_WEIGHT_POWER_MOVE_IDS };

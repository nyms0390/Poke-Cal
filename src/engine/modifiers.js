// Ability/item damage-modifier registries. Replaces damage.js's activeModifiers().
//
// Producers receive
//   ctx = { move, attacker, defender, attackerState, defenderState, field,
//           typeMultiplier, moveType, attackStat, isPhysical, attackerPerspective }
// and return a modifier ({ kind, value, label }), an array of modifiers, or null/undefined.
// kind ∈ "power" | "attack" | "defense" | "damage" | "stab"
//
// `collectModifiers(ctx)` runs each registry once for the attacker's own ability/item
// (attackerPerspective: true) and once for the defender's (attackerPerspective: false) —
// mirroring the pre-registry code, which only ever read attackerState for offense-boosting
// effects and only ever read defenderState for defense-boosting effects (resist berries,
// Solid Rock / Prism Armor). Every producer below explicitly gates on `attackerPerspective`
// so a coincidentally-shared item/ability id on the other side can never double-fire.

import { weatherBlockedByUmbrella } from "./move-effects.js";

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const TYPE_BOOSTING_ITEMS = {
  blackbelt: "Fighting",
  blackglasses: "Dark",
  charcoal: "Fire",
  dragonfang: "Dragon",
  fairyfeather: "Fairy",
  hardstone: "Rock",
  magnet: "Electric",
  metalcoat: "Steel",
  miracleseed: "Grass",
  mysticwater: "Water",
  nevermeltice: "Ice",
  poisonbarb: "Poison",
  sharpbeak: "Flying",
  silkscarf: "Normal",
  silverpowder: "Bug",
  softsand: "Ground",
  spelltag: "Ghost",
  twistedspoon: "Psychic",
};
export const RESIST_BERRIES = {
  babiriberry: "Steel",
  chartiberry: "Rock",
  chilanberry: "Normal",
  chopleberry: "Fighting",
  cobaberry: "Flying",
  colburberry: "Dark",
  habanberry: "Dragon",
  kasibberry: "Ghost",
  kebiaberry: "Poison",
  occaberry: "Fire",
  passhoberry: "Water",
  payapaberry: "Psychic",
  rindoberry: "Grass",
  roseliberry: "Fairy",
  shucaberry: "Ground",
  tangaberry: "Bug",
  wacanberry: "Electric",
  yacheberry: "Ice",
};
export const TYPE_POWER_ABILITIES = {
  dragonsmaw: { type: "Dragon", value: 1.5 },
  rockypayload: { type: "Rock", value: 1.5 },
  steelworker: { type: "Steel", value: 1.5 },
  transistor: { type: "Electric", value: 1.3 },
};
export const MOVE_FLAG_POWER_ABILITIES = {
  ironfist: { flag: "punch", value: 1.2 },
  megalauncher: { flag: "pulse", value: 1.5 },
  sharpness: { flag: "slicing", value: 1.5 },
  strongjaw: { flag: "bite", value: 1.5 },
  toughclaws: { flag: "contact", value: 1.3 },
};

export const ITEM_MODIFIERS = {
  choiceband: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk" ? { kind: "attack", value: 1.5, label: "Choice Band" } : null,
  choicespecs: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "spa" ? { kind: "attack", value: 1.5, label: "Choice Specs" } : null,
  lifeorb: (ctx) => (ctx.attackerPerspective ? { kind: "damage", value: 1.3, label: "Life Orb" } : null),
  lightball: (ctx) =>
    ctx.attackerPerspective && normalizeId(ctx.attacker.name) === "pikachu"
      ? { kind: "attack", value: 2, label: "Light Ball" }
      : null,
  expertbelt: (ctx) =>
    ctx.attackerPerspective && ctx.typeMultiplier > 1 ? { kind: "damage", value: 1.2, label: "Expert Belt" } : null,
  muscleband: (ctx) =>
    ctx.attackerPerspective && ctx.isPhysical ? { kind: "power", value: 1.1, label: "Muscle Band" } : null,
  wiseglasses: (ctx) =>
    ctx.attackerPerspective && !ctx.isPhysical ? { kind: "power", value: 1.1, label: "Wise Glasses" } : null,
};

for (const [itemId, type] of Object.entries(TYPE_BOOSTING_ITEMS)) {
  ITEM_MODIFIERS[itemId] = (ctx) =>
    ctx.attackerPerspective && type === ctx.moveType
      ? { kind: "power", value: 1.2, label: ctx.attackerState.item.name }
      : null;
}

for (const [itemId, type] of Object.entries(RESIST_BERRIES)) {
  ITEM_MODIFIERS[itemId] = (ctx) => {
    if (ctx.attackerPerspective || type !== ctx.moveType) return null;
    if (itemId !== "chilanberry" && ctx.typeMultiplier <= 1) return null;
    return { kind: "damage", value: 0.5, label: ctx.defenderState.item.name };
  };
}

export const ABILITY_MODIFIERS = {
  hugepower: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 2, label: ctx.attackerState.ability.name }
      : null,
  purepower: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 2, label: ctx.attackerState.ability.name }
      : null,
  guts: (ctx) =>
    ctx.attackerPerspective && ctx.attackerState.burned && ctx.attackStat === "atk"
      ? { kind: "attack", value: 1.5, label: "Guts" }
      : null,
  technician: (ctx) =>
    ctx.attackerPerspective && ctx.move.basePower <= 60 ? { kind: "power", value: 1.5, label: "Technician" } : null,
  adaptability: (ctx) =>
    ctx.attackerPerspective && ctx.attacker.types.includes(ctx.moveType)
      ? { kind: "stab", value: 2, label: "Adaptability" }
      : null,
  reckless: (ctx) =>
    ctx.attackerPerspective && (ctx.move.recoil || ctx.move.hasCrashDamage)
      ? { kind: "power", value: 1.2, label: "Reckless" }
      : null,
  tintedlens: (ctx) =>
    ctx.attackerPerspective && ctx.typeMultiplier < 1 ? { kind: "damage", value: 2, label: "Tinted Lens" } : null,
  prismarmor: (ctx) =>
    !ctx.attackerPerspective && ctx.typeMultiplier > 1
      ? { kind: "damage", value: 0.75, label: ctx.defenderState.ability.name }
      : null,
  solidrock: (ctx) =>
    !ctx.attackerPerspective && ctx.typeMultiplier > 1
      ? { kind: "damage", value: 0.75, label: ctx.defenderState.ability.name }
      : null,
};

for (const [abilityId, info] of Object.entries(TYPE_POWER_ABILITIES)) {
  ABILITY_MODIFIERS[abilityId] = (ctx) =>
    ctx.attackerPerspective && info.type === ctx.moveType
      ? { kind: "attack", value: info.value, label: ctx.attackerState.ability.name }
      : null;
}

for (const [abilityId, info] of Object.entries(MOVE_FLAG_POWER_ABILITIES)) {
  ABILITY_MODIFIERS[abilityId] = (ctx) =>
    ctx.attackerPerspective && ctx.move.flags?.[info.flag]
      ? { kind: "power", value: info.value, label: ctx.attackerState.ability.name }
      : null;
}

// -- Generic (not item/ability-id-keyed) attacker-side modifiers ------------------------------

function plateModifier(ctx) {
  const item = ctx.attackerState.item;
  return item?.onPlate === ctx.moveType ? { kind: "power", value: 1.2, label: item.name } : null;
}

function weatherDamageValue(weather, move, moveType, item) {
  if (weatherBlockedByUmbrella(weather, item)) return 1;
  const weatherId = normalizeId(weather);
  if (normalizeId(move.id ?? move.name) === "hydrosteam" && (weatherId === "sunnyday" || weatherId === "desolateland")) {
    return 1.5;
  }
  if ((weatherId === "sunnyday" || weatherId === "desolateland") && moveType === "Fire") return 1.5;
  if ((weatherId === "sunnyday" || weatherId === "desolateland") && moveType === "Water") return 0.5;
  if ((weatherId === "raindance" || weatherId === "primordialsea") && moveType === "Water") return 1.5;
  if ((weatherId === "raindance" || weatherId === "primordialsea") && moveType === "Fire") return 0.5;
  return 1;
}

function weatherDamageLabel(weather, move) {
  if (normalizeId(move.id ?? move.name) === "hydrosteam") return "Hydro Steam in harsh sunlight";
  const weatherId = normalizeId(weather);
  if (weatherId === "sunnyday" || weatherId === "desolateland") return "Harsh sunlight";
  if (weatherId === "raindance" || weatherId === "primordialsea") return "Rain";
  return String(weather);
}

function weatherModifier(ctx) {
  const value = weatherDamageValue(ctx.field.weather, ctx.move, ctx.moveType, ctx.attackerState.item);
  if (value === 1) return null;
  return { kind: "damage", value, label: weatherDamageLabel(ctx.field.weather, ctx.move) };
}

// Collision Course / Electro Drift: +33% damage on a super-effective hit. Not an ability or
// item, but lived in the same flat function pre-migration; kept here as a generic check.
function superEffectiveMoveModifier(ctx) {
  const moveId = normalizeId(ctx.move.id ?? ctx.move.name);
  if ((moveId === "collisioncourse" || moveId === "electrodrift") && ctx.typeMultiplier > 1) {
    return { kind: "damage", value: 4 / 3, label: `${ctx.move.name} super-effective boost` };
  }
  return null;
}

// -- Terrain basics (field.js task P1-01) ----------------------------------------------------
// A Pokémon's `state.grounded` defaults to "auto" (undefined), which every existing terrain/
// gravity check in this codebase already treats as grounded — only an explicit `false`
// (Flying-type, Levitate, Air Balloon, etc.) opts a side out. Mirrored here for consistency.

function isGrounded(state) {
  return state?.grounded !== false;
}

// Electric/Grassy/Psychic Terrain boost matching-type moves ×1.3 for the grounded user.
// Misty Terrain has no offensive boost of its own (only the Dragon reduction below).
const TERRAIN_BOOST_TYPES = {
  electricterrain: "Electric",
  grassyterrain: "Grass",
  psychicterrain: "Psychic",
};

function terrainPowerModifier(ctx) {
  const boostType = TERRAIN_BOOST_TYPES[normalizeId(ctx.field.terrain)];
  if (!boostType || boostType !== ctx.moveType) return null;
  if (!isGrounded(ctx.attackerState)) return null;
  return { kind: "power", value: 1.3, label: `${ctx.field.terrain} boost` };
}

// Misty Terrain halves Dragon-type damage against grounded targets.
function mistyTerrainDragonModifier(ctx) {
  if (normalizeId(ctx.field.terrain) !== "mistyterrain") return null;
  if (ctx.moveType !== "Dragon") return null;
  if (!isGrounded(ctx.defenderState)) return null;
  return { kind: "damage", value: 0.5, label: "Misty Terrain weakens Dragon moves" };
}

// Grassy Terrain halves ground-shaking moves against grounded targets.
const GRASSY_TERRAIN_HALVED_MOVE_IDS = new Set(["earthquake", "bulldoze", "magnitude"]);

function grassyTerrainGroundMoveModifier(ctx) {
  if (normalizeId(ctx.field.terrain) !== "grassyterrain") return null;
  if (!GRASSY_TERRAIN_HALVED_MOVE_IDS.has(normalizeId(ctx.move.id ?? ctx.move.name))) return null;
  if (!isGrounded(ctx.defenderState)) return null;
  return { kind: "damage", value: 0.5, label: "Grassy Terrain weakens ground-shaking moves" };
}

// -- Side conditions (field.js task P0-03, wired up in P1-02) -------------------------------
// `field.attackerSide` boosts the attacker's own move (Helping Hand, Power Spot, Battery,
// Steely Spirit); `field.defenderSide` reduces incoming damage (screens, Friend Guard).
// Both read straight off `ctx.field` rather than an ability/item id, so they live in the
// generic producer lists below rather than ITEM_MODIFIERS/ABILITY_MODIFIERS.

function attackerSideConditionModifiers(ctx) {
  const side = ctx.field?.attackerSide;
  if (!side) return [];
  const modifiers = [];
  if (side.helpingHand) modifiers.push({ kind: "power", value: 1.5, label: "Helping Hand" });
  if (side.battery && !ctx.isPhysical) modifiers.push({ kind: "power", value: 1.3, label: "Battery" });
  if (side.powerSpot) modifiers.push({ kind: "power", value: 1.3, label: "Power Spot" });
  if (side.steelySpirit && ctx.moveType === "Steel") {
    modifiers.push({ kind: "power", value: 1.5, label: "Steely Spirit" });
  }
  return modifiers;
}

// Reflect/Light Screen/Aurora Veil never stack (Aurora Veil alone covers both categories) and
// are all skipped on a critical hit; Friend Guard is unrelated to crit and always applies.
function defenderSideConditionModifiers(ctx) {
  const side = ctx.field?.defenderSide;
  if (!side) return [];
  const modifiers = [];
  if (!ctx.critical) {
    const screenValue = ctx.field?.format === "doubles" ? 2 / 3 : 0.5;
    if (side.auroraVeil) {
      modifiers.push({ kind: "damage", value: screenValue, label: "Aurora Veil" });
    } else if (side.reflect && ctx.isPhysical) {
      modifiers.push({ kind: "damage", value: screenValue, label: "Reflect" });
    } else if (side.lightScreen && !ctx.isPhysical) {
      modifiers.push({ kind: "damage", value: screenValue, label: "Light Screen" });
    }
  }
  if (side.friendGuard) modifiers.push({ kind: "damage", value: 0.75, label: "Friend Guard" });
  return modifiers;
}

const GENERIC_ATTACKER_MODIFIERS = [
  weatherModifier,
  plateModifier,
  superEffectiveMoveModifier,
  terrainPowerModifier,
  mistyTerrainDragonModifier,
  grassyTerrainGroundMoveModifier,
  attackerSideConditionModifiers,
];

const GENERIC_DEFENDER_MODIFIERS = [defenderSideConditionModifiers];

function toList(result) {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

export function collectModifiers(ctx) {
  const attackerAbilityId = normalizeId(ctx.attackerState.ability?.id ?? ctx.attackerState.ability?.name);
  const attackerItemId = normalizeId(ctx.attackerState.item?.id ?? ctx.attackerState.item?.name);
  const defenderAbilityId = ctx.move.ignoreAbility
    ? ""
    : normalizeId(ctx.defenderState.ability?.id ?? ctx.defenderState.ability?.name);
  const defenderItemId = normalizeId(ctx.defenderState.item?.id ?? ctx.defenderState.item?.name);

  const attackerCtx = { ...ctx, attackerPerspective: true };
  const defenderCtx = { ...ctx, attackerPerspective: false };

  const modifiers = [];
  modifiers.push(...toList(ITEM_MODIFIERS[attackerItemId]?.(attackerCtx)));
  for (const producer of GENERIC_ATTACKER_MODIFIERS) {
    modifiers.push(...toList(producer(attackerCtx)));
  }
  modifiers.push(...toList(ITEM_MODIFIERS[defenderItemId]?.(defenderCtx)));
  for (const producer of GENERIC_DEFENDER_MODIFIERS) {
    modifiers.push(...toList(producer(defenderCtx)));
  }
  modifiers.push(...toList(ABILITY_MODIFIERS[defenderAbilityId]?.(defenderCtx)));
  modifiers.push(...toList(ABILITY_MODIFIERS[attackerAbilityId]?.(attackerCtx)));
  return modifiers;
}

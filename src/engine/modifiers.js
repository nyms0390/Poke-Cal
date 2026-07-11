// Ability/item damage-modifier registries. Replaces damage.js's activeModifiers().
//
// Producers receive
//   ctx = { move, attacker, defender, attackerState, defenderState, field,
//           typeMultiplier, moveType, attackStat, isPhysical, attackerPerspective }
// and return a modifier ({ kind, value, label }), an array of modifiers, or null/undefined.
// kind ∈ "power" | "attack" | "defense" | "damage" | "stab" | "hits"
//
// `collectModifiers(ctx)` runs each registry once for the attacker's own ability/item
// (attackerPerspective: true) and once for the defender's (attackerPerspective: false) —
// mirroring the pre-registry code, which only ever read attackerState for offense-boosting
// effects and only ever read defenderState for defense-boosting effects (resist berries,
// Solid Rock / Prism Armor). Every producer below explicitly gates on `attackerPerspective`
// so a coincidentally-shared item/ability id on the other side can never double-fire.

import { abilityTypeConversion, weatherBlockedByUmbrella } from "./move-effects.js";
import { isGrounded } from "./field.js";
import { paradoxBoost } from "./speed.js";

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function applyHitCountOverride(range, value) {
  if (value === "max") return { min: range.max, max: range.max };
  if (Array.isArray(value)) {
    return {
      min: Math.max(range.min, Math.min(range.max, value[0])),
      max: Math.max(range.min, Math.min(range.max, value[1])),
    };
  }
  if (Number.isFinite(value)) {
    const count = Math.max(range.min, Math.min(range.max, value));
    return { min: count, max: count };
  }
  return range;
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
  firemane: { type: "Fire", value: 1.5 },
  rockypayload: { type: "Rock", value: 1.5 },
  steelworker: { type: "Steel", value: 1.5 },
  steelyspirit: { type: "Steel", value: 1.5 },
  transistor: { type: "Electric", value: 1.3 },
};
export const MOVE_FLAG_POWER_ABILITIES = {
  ironfist: { flag: "punch", value: 1.2 },
  megalauncher: { flag: "pulse", value: 1.5 },
  sharpness: { flag: "slicing", value: 1.5 },
  strongjaw: { flag: "bite", value: 1.5 },
  toughclaws: { flag: "contact", value: 1.3 },
};
const FIELD_ABILITY_BOOST = 4915 / 4096;
const IMPLIED_FIELDS = {
  drizzle: { weather: "RainDance" },
  drought: { weather: "SunnyDay" },
  snowwarning: { weather: "Snowscape" },
  sandstream: { weather: "Sandstorm" },
  sandspit: { weather: "Sandstorm" },
  primordialsea: { weather: "RainDance", note: "Primordial Sea treated as Rain" },
  electricsurge: { terrain: "Electric Terrain" },
  grassysurge: { terrain: "Grassy Terrain" },
  mistysurge: { terrain: "Misty Terrain" },
  psychicsurge: { terrain: "Psychic Terrain" },
  orichalcumpulse: { weather: "SunnyDay" },
  hadronengine: { terrain: "Electric Terrain" },
  megasol: { weather: "SunnyDay" },
};

export function impliedField(ability) {
  const abilityId = normalizeId(ability?.id ?? ability?.name ?? ability);
  return IMPLIED_FIELDS[abilityId] ?? {};
}

export function impliedStageDefaults({ ownAbility, opposingAbility, stages = {} } = {}) {
  if ((stages.atk ?? 0) !== 0) return {};
  let atk = 0;
  if (normalizeId(ownAbility?.id ?? ownAbility?.name ?? ownAbility) === "intrepidsword") atk += 1;
  if (normalizeId(opposingAbility?.id ?? opposingAbility?.name ?? opposingAbility) === "intimidate") atk -= 1;
  return atk === 0 ? {} : { atk };
}

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
  loadeddice: (ctx) => {
    if (!ctx.attackerPerspective || ctx.hitCountRange?.max <= 1) return null;
    return {
      kind: "hits",
      value: [Math.max(4, ctx.hitCountRange.min), ctx.hitCountRange.max],
      label: "Loaded Dice",
    };
  },
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
    const ripen = hasActiveAbility(ctx.defenderState, "ripen", ctx.suppressDefenderAbility);
    return { kind: "damage", value: ripen ? 0.25 : 0.5, label: ripen ? "Ripen" : ctx.defenderState.item.name };
  };
}

export const ABILITY_MODIFIERS = {
  aerilate: abilityTypeBoostModifier,
  dragonize: abilityTypeBoostModifier,
  galvanize: abilityTypeBoostModifier,
  normalize: abilityTypeBoostModifier,
  pixilate: abilityTypeBoostModifier,
  refrigerate: abilityTypeBoostModifier,
  hugepower: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 2, label: ctx.attackerState.ability.name }
      : null,
  skilllink: (ctx) =>
    ctx.attackerPerspective && ctx.hitCountRange?.max > 1
      ? { kind: "hits", value: "max", label: "Skill Link" }
      : null,
  purepower: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 2, label: ctx.attackerState.ability.name }
      : null,
  guts: (ctx) =>
    ctx.attackerPerspective && ctx.attackerState.status === "burn" && ctx.attackStat === "atk"
      ? { kind: "attack", value: 1.5, label: "Guts" }
      : null,
  flareboost: (ctx) =>
    ctx.attackerPerspective && ctx.attackerState.status === "burn" && ctx.attackStat === "spa"
      ? { kind: "attack", value: 1.5, label: "Flare Boost" }
      : null,
  toxicboost: (ctx) =>
    ctx.attackerPerspective && ["poison", "toxic"].includes(ctx.attackerState.status) && ctx.attackStat === "atk"
      ? { kind: "attack", value: 1.5, label: "Toxic Boost" }
      : null,
  blaze: (ctx) => lowHpTypeBoostModifier(ctx, "Fire", "Blaze"),
  torrent: (ctx) => lowHpTypeBoostModifier(ctx, "Water", "Torrent"),
  overgrow: (ctx) => lowHpTypeBoostModifier(ctx, "Grass", "Overgrow"),
  swarm: (ctx) => lowHpTypeBoostModifier(ctx, "Bug", "Swarm"),
  technician: (ctx) =>
    ctx.attackerPerspective && ctx.move.basePower <= 60 ? { kind: "power", value: 1.5, label: "Technician" } : null,
  adaptability: (ctx) =>
    adaptabilityModifier(ctx),
  sheerforce: (ctx) =>
    ctx.attackerPerspective && hasSecondaryEffect(ctx.move)
      ? { kind: "power", value: 1.3, label: "Sheer Force" }
      : null,
  punkrock: (ctx) => {
    if (!ctx.move.flags?.sound) return null;
    return ctx.attackerPerspective
      ? { kind: "power", value: 1.3, label: "Punk Rock" }
      : { kind: "damage", value: 0.5, label: "Punk Rock" };
  },
  reckless: (ctx) =>
    ctx.attackerPerspective && (ctx.move.recoil || ctx.move.hasCrashDamage)
      ? { kind: "power", value: 1.2, label: "Reckless" }
      : null,
  solarpower: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "spa" && isSun(ctx.field.weather)
      ? { kind: "attack", value: 1.5, label: "Solar Power" }
      : null,
  plus: plusMinusModifier,
  minus: plusMinusModifier,
  hustle: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 1.5, label: "Hustle (accuracy x0.8)" }
      : null,
  gorillatactics: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 1.5, label: "Gorilla Tactics (locked move)" }
      : null,
  analytic: (ctx) =>
    ctx.attackerPerspective && ctx.moveOptions?.targetMoved
      ? { kind: "power", value: 1.3, label: "Analytic" }
      : null,
  rivalry: rivalryModifier,
  stakeout: (ctx) =>
    ctx.attackerPerspective && ctx.defenderState.switchedIn
      ? { kind: "power", value: 2, label: "Stakeout" }
      : null,
  supremeoverlord: (ctx) => {
    const count = Math.max(0, Math.min(5, Math.trunc(Number(ctx.attackerState.faintedAllyCount ?? 0))));
    return ctx.attackerPerspective && count > 0
      ? { kind: "power", value: 1 + 0.1 * count, label: `Supreme Overlord +${count}` }
      : null;
  },
  sandforce: (ctx) =>
    ctx.attackerPerspective && normalizeId(ctx.field.weather) === "sandstorm" && ["Rock", "Ground", "Steel"].includes(ctx.moveType)
      ? { kind: "power", value: 1.3, label: "Sand Force" }
      : null,
  waterbubble: (ctx) => {
    if (ctx.attackerPerspective && ctx.moveType === "Water") {
      return { kind: "power", value: 2, label: "Water Bubble" };
    }
    if (!ctx.attackerPerspective && ctx.moveType === "Fire") {
      return { kind: "damage", value: 0.5, label: "Water Bubble" };
    }
    return null;
  },
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
  orichalcumpulse: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "atk" && (normalizeId(ctx.field.weather) === "sunnyday" || normalizeId(ctx.field.weather) === "desolateland")
      ? { kind: "attack", value: FIELD_ABILITY_BOOST, label: ctx.attackerState.ability.name }
      : null,
  hadronengine: (ctx) =>
    ctx.attackerPerspective && ctx.attackStat === "spa" && normalizeId(ctx.field.terrain) === "electricterrain"
      ? { kind: "attack", value: FIELD_ABILITY_BOOST, label: ctx.attackerState.ability.name }
      : null,
  multiscale: (ctx) =>
    !ctx.attackerPerspective && Number(ctx.defenderState.currentHpFraction ?? 1) === 1
      ? { kind: "damage", value: 0.5, label: "Multiscale" }
      : null,
  shadowshield: (ctx) =>
    !ctx.attackerPerspective && Number(ctx.defenderState.currentHpFraction ?? 1) === 1
      ? { kind: "damage", value: 0.5, label: "Shadow Shield" }
      : null,
  thickfat: (ctx) =>
    !ctx.attackerPerspective && (ctx.moveType === "Fire" || ctx.moveType === "Ice")
      ? { kind: "attack", value: 0.5, label: "Thick Fat" }
      : null,
  heatproof: (ctx) =>
    !ctx.attackerPerspective && ctx.moveType === "Fire"
      ? { kind: "damage", value: 0.5, label: "Heatproof" }
      : null,
  purifyingsalt: (ctx) =>
    !ctx.attackerPerspective && ctx.moveType === "Ghost"
      ? { kind: "attack", value: 0.5, label: "Purifying Salt" }
      : null,
  furcoat: (ctx) =>
    !ctx.attackerPerspective && ctx.isPhysical
      ? { kind: "defense", value: 2, label: "Fur Coat" }
      : null,
  marvelscale: (ctx) =>
    !ctx.attackerPerspective && ctx.isPhysical && ctx.defenderState.status
      ? { kind: "defense", value: 1.5, label: "Marvel Scale" }
      : null,
  grasspelt: (ctx) =>
    !ctx.attackerPerspective && ctx.isPhysical && normalizeId(ctx.field.terrain) === "grassyterrain"
      ? { kind: "defense", value: 1.5, label: "Grass Pelt" }
      : null,
  tabletsofruin: (ctx) =>
    !ctx.attackerPerspective && ctx.attackStat === "atk"
      ? { kind: "attack", value: 0.75, label: "Tablets of Ruin" }
      : null,
  vesselofruin: (ctx) =>
    !ctx.attackerPerspective && ctx.attackStat === "spa"
      ? { kind: "attack", value: 0.75, label: "Vessel of Ruin" }
      : null,
  swordofruin: (ctx) =>
    ctx.attackerPerspective && ctx.defenseStat === "def"
      ? { kind: "defense", value: 0.75, label: "Sword of Ruin" }
      : null,
  beadsofruin: (ctx) =>
    ctx.attackerPerspective && ctx.defenseStat === "spd"
      ? { kind: "defense", value: 0.75, label: "Beads of Ruin" }
      : null,
  protosynthesis: paradoxAbilityModifier,
  quarkdrive: paradoxAbilityModifier,
  defeatist: (ctx) =>
    ctx.attackerPerspective && ["atk", "spa"].includes(ctx.attackStat) && Number(ctx.attackerState.currentHpFraction ?? 1) <= 0.5
      ? { kind: "attack", value: 0.5, label: "Defeatist" }
      : null,
  flowergift: flowerGiftModifier,
  dryskin: (ctx) =>
    !ctx.attackerPerspective && ctx.moveType === "Fire"
      ? { kind: "damage", value: 1.25, label: "Dry Skin" }
      : null,
  parentalbond: (ctx) =>
    ctx.attackerPerspective && ctx.hitCountRange?.min === 1 && ctx.hitCountRange?.max === 1
      ? { kind: "hitPowerMultipliers", value: [1, 0.25], label: "Parental Bond" }
      : null,
};

export function resolveHitCountRange(range, { move, attackerState }) {
  let resolved = range;
  const itemId = normalizeId(attackerState?.item?.id ?? attackerState?.item?.name);
  const abilityId = normalizeId(attackerState?.ability?.id ?? attackerState?.ability?.name);
  const producers = [
    itemId === "loadeddice" ? ITEM_MODIFIERS.loadeddice : null,
    abilityId === "skilllink" ? ABILITY_MODIFIERS.skilllink : null,
  ];
  for (const producer of producers) {
    const modifier = producer?.({ move, attackerState, attackerPerspective: true, hitCountRange: resolved });
    if (modifier?.kind === "hits") resolved = applyHitCountOverride(resolved, modifier.value);
  }
  return resolved;
}

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
  if (!isGrounded(ctx.attacker, ctx.attackerState, ctx.field)) return null;
  return { kind: "power", value: 1.3, label: `${ctx.field.terrain} boost` };
}

function auraPowerModifier(ctx) {
  const auraType = ctx.moveType === "Fairy"
    ? "fairyaura"
    : ctx.moveType === "Dark"
      ? "darkaura"
      : "";
  if (!auraType) return null;
  if (!hasActiveAbility(ctx.attackerState, auraType, ctx.suppressAttackerAbility) &&
    !hasActiveAbility(ctx.defenderState, auraType, ctx.suppressDefenderAbility)) return null;
  return { kind: "power", value: 1.33, label: auraType === "fairyaura" ? "Fairy Aura" : "Dark Aura" };
}

// Misty Terrain halves Dragon-type damage against grounded targets.
function mistyTerrainDragonModifier(ctx) {
  if (normalizeId(ctx.field.terrain) !== "mistyterrain") return null;
  if (ctx.moveType !== "Dragon") return null;
  if (!isGrounded(ctx.defender, ctx.defenderState, ctx.field)) return null;
  return { kind: "damage", value: 0.5, label: "Misty Terrain weakens Dragon moves" };
}

// Grassy Terrain halves ground-shaking moves against grounded targets.
const GRASSY_TERRAIN_HALVED_MOVE_IDS = new Set(["earthquake", "bulldoze", "magnitude"]);

function grassyTerrainGroundMoveModifier(ctx) {
  if (normalizeId(ctx.field.terrain) !== "grassyterrain") return null;
  if (!GRASSY_TERRAIN_HALVED_MOVE_IDS.has(normalizeId(ctx.move.id ?? ctx.move.name))) return null;
  if (!isGrounded(ctx.defender, ctx.defenderState, ctx.field)) return null;
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
  if (side.flowerGift && isSun(ctx.field.weather) && ctx.attackStat === "atk") {
    modifiers.push({ kind: "attack", value: 1.5, label: "Flower Gift" });
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
  if (side.flowerGift && isSun(ctx.field.weather) && ctx.defenseStat === "spd") {
    modifiers.push({ kind: "defense", value: 1.5, label: "Flower Gift" });
  }
  return modifiers;
}

const GENERIC_ATTACKER_MODIFIERS = [
  weatherModifier,
  plateModifier,
  superEffectiveMoveModifier,
  terrainPowerModifier,
  auraPowerModifier,
  mistyTerrainDragonModifier,
  grassyTerrainGroundMoveModifier,
  attackerSideConditionModifiers,
];

const GENERIC_DEFENDER_MODIFIERS = [defenderSideConditionModifiers];

function toList(result) {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function adaptabilityModifier(ctx) {
  if (!ctx.attackerPerspective) return null;
  const originalType = ctx.attacker.types.includes(ctx.moveType);
  const teraMatch = ctx.attackerState.teraType === ctx.moveType;
  if (!originalType && !teraMatch) return null;
  const value = originalType && teraMatch ? 2.25 : 2;
  return { kind: "stab", value, label: "Adaptability" };
}

function abilityTypeBoostModifier(ctx) {
  if (!ctx.attackerPerspective) return null;
  const conversion = abilityTypeConversion(ctx);
  return conversion?.boost ? { kind: "power", value: conversion.boost, label: conversion.label } : null;
}

function lowHpTypeBoostModifier(ctx, type, label) {
  return ctx.attackerPerspective && ctx.moveType === type && Number(ctx.attackerState.currentHpFraction ?? 1) <= 1 / 3
    ? { kind: "attack", value: 1.5, label }
    : null;
}

function plusMinusModifier(ctx) {
  return ctx.attackerPerspective && ctx.attackStat === "spa" && ctx.attackerState.allyPlusMinus
    ? { kind: "attack", value: 1.5, label: ctx.attackerState.ability.name }
    : null;
}

function rivalryModifier(ctx) {
  if (!ctx.attackerPerspective) return null;
  if (ctx.attackerState.rivalry === "same") return { kind: "damage", value: 1.25, label: "Rivalry same gender" };
  if (ctx.attackerState.rivalry === "opposite") return { kind: "damage", value: 0.75, label: "Rivalry opposite gender" };
  return null;
}

function paradoxAbilityModifier(ctx) {
  const pokemon = ctx.attackerPerspective ? ctx.attacker : ctx.defender;
  const state = ctx.attackerPerspective ? ctx.attackerState : ctx.defenderState;
  const boost = paradoxBoost(pokemon, state, ctx.field);
  if (!boost) return null;
  if (ctx.attackerPerspective && boost.stat === ctx.attackStat) {
    return { kind: "attack", value: boost.value, label: boost.label };
  }
  if (!ctx.attackerPerspective && boost.stat === ctx.defenseStat) {
    return { kind: "defense", value: boost.value, label: boost.label };
  }
  return null;
}

function flowerGiftModifier(ctx) {
  if (!isSun(ctx.field.weather)) return null;
  if (ctx.attackerPerspective && ctx.attackStat === "atk") {
    return { kind: "attack", value: 1.5, label: "Flower Gift" };
  }
  if (!ctx.attackerPerspective && ctx.defenseStat === "spd") {
    return { kind: "defense", value: 1.5, label: "Flower Gift" };
  }
  return null;
}

function hasSecondaryEffect(move) {
  if (Array.isArray(move.secondaries) && move.secondaries.length > 0) return true;
  return Boolean(move.secondary && Object.keys(move.secondary).length > 0);
}

function hasAbility(state, abilityId) {
  return normalizeId(state?.ability?.id ?? state?.ability?.name) === abilityId;
}

function hasActiveAbility(state, abilityId, suppressed) {
  return !suppressed && hasAbility(state, abilityId);
}

function isSun(weather) {
  const weatherId = normalizeId(weather);
  return weatherId === "sunnyday" || weatherId === "desolateland";
}

export function collectModifiers(ctx) {
  const attackerAbilityId = ctx.suppressAttackerAbility
    ? ""
    : normalizeId(ctx.attackerState.ability?.id ?? ctx.attackerState.ability?.name);
  const attackerItemId = normalizeId(ctx.attackerState.item?.id ?? ctx.attackerState.item?.name);
  const defenderAbilityId = ctx.suppressDefenderAbility || ctx.move.ignoreAbility
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

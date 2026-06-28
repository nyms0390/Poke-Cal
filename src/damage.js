const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const DAMAGE_ROLLS = [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];
const SPREAD_MOVE_TARGETS = new Set(["allAdjacent", "allAdjacentFoes"]);
const TYPE_BOOSTING_ITEMS = {
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
const RESIST_BERRIES = {
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
const TYPE_POWER_ABILITIES = {
  dragonsmaw: { type: "Dragon", value: 1.5 },
  rockypayload: { type: "Rock", value: 1.5 },
  steelworker: { type: "Steel", value: 1.5 },
  transistor: { type: "Electric", value: 1.3 },
};
const MOVE_FLAG_POWER_ABILITIES = {
  ironfist: { flag: "punch", value: 1.2 },
  megalauncher: { flag: "pulse", value: 1.5 },
  sharpness: { flag: "slicing", value: 1.5 },
  strongjaw: { flag: "bite", value: 1.5 },
  toughclaws: { flag: "contact", value: 1.3 },
};

export const NATURES = {
  Hardy: {},
  Lonely: { up: "atk", down: "def" },
  Brave: { up: "atk", down: "spe" },
  Adamant: { up: "atk", down: "spa" },
  Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" },
  Docile: {},
  Relaxed: { up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" },
  Hasty: { up: "spe", down: "def" },
  Serious: {},
  Jolly: { up: "spe", down: "spa" },
  Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" },
  Mild: { up: "spa", down: "def" },
  Quiet: { up: "spa", down: "spe" },
  Bashful: {},
  Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy: { up: "spd", down: "spe" },
  Careful: { up: "spd", down: "spa" },
  Quirky: {},
};

const TYPE_EFFECTIVENESS = {
  Normal: { Rock: 0.5, Ghost: 0, Steel: 0.5 },
  Fire: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
  Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
  Grass: {
    Fire: 0.5,
    Water: 2,
    Grass: 0.5,
    Poison: 0.5,
    Ground: 2,
    Flying: 0.5,
    Bug: 0.5,
    Rock: 2,
    Dragon: 0.5,
    Steel: 0.5,
  },
  Ice: { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
  Fighting: {
    Normal: 2,
    Ice: 2,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 0.5,
    Bug: 0.5,
    Rock: 2,
    Ghost: 0,
    Dark: 2,
    Steel: 2,
    Fairy: 0.5,
  },
  Poison: { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
  Ground: { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
  Flying: { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
  Psychic: { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
  Bug: {
    Fire: 0.5,
    Grass: 2,
    Fighting: 0.5,
    Poison: 0.5,
    Flying: 0.5,
    Psychic: 2,
    Ghost: 0.5,
    Dark: 2,
    Steel: 0.5,
    Fairy: 0.5,
  },
  Rock: { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
  Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: 0.5 },
  Dragon: { Dragon: 2, Steel: 0.5, Fairy: 0 },
  Dark: { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
  Steel: { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
  Fairy: { Fire: 0.5, Fighting: 2, Poison: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};

const UNSUPPORTED_MOVE_IDS = new Set([
  "seismictoss",
  "nightshade",
  "grassknot",
  "lowkick",
  "electroball",
  "foulplay",
  "terablast",
  "weatherball",
]);

export function natureMultiplier(natureName, stat) {
  const nature = NATURES[natureName] ?? NATURES.Hardy;
  if (nature.up === stat) return 1.1;
  if (nature.down === stat) return 0.9;
  return 1;
}

export function calculateStat({ base, stat, sp = 0, nature = "Hardy", stage = 0 }) {
  if (!STATS.includes(stat)) throw new RangeError(`Unsupported stat: ${stat}`);
  if (!Number.isInteger(base) || base < 1) throw new RangeError("Base stat must be positive.");
  if (!Number.isInteger(sp) || sp < 0 || sp > 32) throw new RangeError("SP must be 0-32.");
  if (!Number.isInteger(stage) || stage < -6 || stage > 6) {
    throw new RangeError("Stage must be -6 to +6.");
  }

  if (stat === "hp") return base + sp + 75;

  const trained = Math.floor((base + sp + 20) * natureMultiplier(nature, stat));
  return applyStage(trained, stage);
}

export function typeEffectiveness(moveType, defenderTypes = []) {
  return defenderTypes.reduce((multiplier, defenderType) => {
    return multiplier * (TYPE_EFFECTIVENESS[moveType]?.[defenderType] ?? 1);
  }, 1);
}

export function unsupportedMoveReason(move) {
  if (!move) return "Missing move data.";
  if (move.category === "Status") return "Status moves do not deal direct damage.";
  if ((move.damage && typeof move.damage !== "number") || move.damageCallback || move.ohko) {
    return "Fixed-damage moves are not supported.";
  }
  if (fixedDamageKind(move)) return "";
  if (!move.basePower) return "Variable or zero base power is not supported.";
  if (UNSUPPORTED_MOVE_IDS.has(move.id)) return "Custom damage behavior is not supported.";
  if (!["Physical", "Special"].includes(move.category)) return "Only Physical and Special moves are supported.";
  return "";
}

export function calculateDamage({
  attacker,
  defender,
  move,
  attackerState,
  defenderState,
  battleFormat = "doubles",
  critical = false,
  burned = false,
}) {
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };

  const moveType = move.type;
  const typeMultiplier = typeEffectiveness(moveType, defender.types);
  const defenderHp = calculatePokemonStat(defender, defenderState, "hp");
  const effectiveCritical = critical && !hasAnyAbility(defenderState, ["battlearmor", "shellarmor"]);
  if (typeMultiplier === 0) {
    return {
      supported: true,
      rolls: DAMAGE_ROLLS.map(() => 0),
      minDamage: 0,
      maxDamage: 0,
      minPercent: 0,
      maxPercent: 0,
      defenderHp,
      typeMultiplier,
      notes: ["Immune"],
    };
  }

  const fixedDamage = fixedDamageValue(move, defenderHp);
  if (fixedDamage !== null) {
    const damage = Math.max(1, fixedDamage);
    const rolls = DAMAGE_ROLLS.map(() => damage);
    return {
      supported: true,
      rolls,
      minDamage: damage,
      maxDamage: damage,
      minPercent: percent(damage, defenderHp),
      maxPercent: percent(damage, defenderHp),
      defenderHp,
      typeMultiplier,
      notes: ["Fixed damage"],
    };
  }

  const isPhysical = move.category === "Physical";
  const attackStat = move.overrideOffensiveStat ?? (isPhysical ? "atk" : "spa");
  const defenseStat = move.overrideDefensiveStat ?? (isPhysical ? "def" : "spd");
  const attack = calculatePokemonStat(attacker, attackerState, attackStat, {
    stagePolicy: criticalStagePolicy("attack", effectiveCritical),
  });
  const defense = calculatePokemonStat(defender, defenderState, defenseStat, {
    ignoreStage: move.ignoreDefensive,
    stagePolicy: criticalStagePolicy("defense", effectiveCritical),
  });
  const notes = [];
  let power = move.basePower;
  let attackModifier = 1;
  let damageModifier = 1;
  let stab = attacker.types.includes(moveType) ? 1.5 : 1;

  for (const modifier of activeModifiers({
    attacker,
    defender,
    move,
    attackerState,
    defenderState,
    typeMultiplier,
    attackStat,
    isPhysical,
  })) {
    notes.push(modifier.label);
    if (modifier.kind === "attack") attackModifier *= modifier.value;
    if (modifier.kind === "power") power = Math.floor(power * modifier.value);
    if (modifier.kind === "damage") damageModifier *= modifier.value;
    if (modifier.kind === "stab") stab = modifier.value;
  }

  const modifiedAttack = Math.max(1, Math.floor(attack * attackModifier));
  const baseDamage = Math.floor(
    Math.floor(Math.floor(Math.floor((2 * 50) / 5 + 2) * power * modifiedAttack) / defense) / 50,
  ) + 2;
  const criticalModifier = effectiveCritical
    ? hasAbility(attackerState, "sniper") ? 2.25 : 1.5
    : 1;
  const burnModifier =
    burned && isPhysical && !hasAbility(attackerState, "guts") ? 0.5 : 1;
  const spreadModifier =
    battleFormat === "doubles" && SPREAD_MOVE_TARGETS.has(move.target) ? 0.75 : 1;
  if (spreadModifier !== 1) notes.push("Doubles spread move");

  const rolls = DAMAGE_ROLLS.map((roll) => {
    let damage = baseDamage;
    damage = Math.floor(damage * criticalModifier);
    damage = Math.floor(damage * roll / 100);
    damage = Math.floor(damage * stab);
    damage = Math.floor(damage * typeMultiplier);
    damage = Math.floor(damage * burnModifier);
    damage = Math.floor(damage * spreadModifier);
    damage = Math.floor(damage * damageModifier);
    return Math.max(1, damage);
  });

  return {
    supported: true,
    rolls,
    minDamage: Math.min(...rolls),
    maxDamage: Math.max(...rolls),
    minPercent: percent(Math.min(...rolls), defenderHp),
    maxPercent: percent(Math.max(...rolls), defenderHp),
    defenderHp,
    typeMultiplier,
    notes,
  };
}

export function koSummary({ minDamage, maxDamage, defenderHp }) {
  if (minDamage >= defenderHp) return "Guaranteed 1HKO";
  if (maxDamage >= defenderHp) return "Possible 1HKO";
  if (minDamage * 2 >= defenderHp) return "Guaranteed 2HKO";
  if (maxDamage * 2 >= defenderHp) return "Possible 2HKO";
  return "3HKO+";
}

export function formatDamageResult(result) {
  if (!result.supported) return result.reason ?? "No direct damage";
  return `${result.minPercent}% - ${result.maxPercent}%`;
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

function fixedDamageKind(move) {
  const moveId = normalizeId(move?.id ?? move?.name);
  if (typeof move?.damage === "number") return "numeric";
  if (moveId === "superfang" || moveId === "ruination") return "half-hp";
  return "";
}

function fixedDamageValue(move, defenderHp) {
  const kind = fixedDamageKind(move);
  if (kind === "numeric") return move.damage;
  if (kind === "half-hp") return Math.floor(defenderHp / 2);
  return null;
}

function activeModifiers({ attacker, defender, move, attackerState, defenderState, typeMultiplier, attackStat, isPhysical }) {
  const modifiers = [];
  const item = normalizeId(attackerState.item?.id ?? attackerState.item?.name);
  const defenderItem = normalizeId(defenderState.item?.id ?? defenderState.item?.name);
  const ability = normalizeId(attackerState.ability?.id ?? attackerState.ability?.name);
  const defenderAbility = normalizeId(defenderState.ability?.id ?? defenderState.ability?.name);

  if (item === "choiceband" && attackStat === "atk") {
    modifiers.push({ kind: "attack", value: 1.5, label: "Choice Band" });
  }
  if (item === "choicespecs" && attackStat === "spa") {
    modifiers.push({ kind: "attack", value: 1.5, label: "Choice Specs" });
  }
  if (item === "lifeorb") modifiers.push({ kind: "damage", value: 1.3, label: "Life Orb" });
  if (item === "lightball" && normalizeId(attacker.name) === "pikachu") {
    modifiers.push({ kind: "attack", value: 2, label: "Light Ball" });
  }
  if (item === "expertbelt" && typeMultiplier > 1) {
    modifiers.push({ kind: "damage", value: 1.2, label: "Expert Belt" });
  }
  if (item === "muscleband" && isPhysical) {
    modifiers.push({ kind: "power", value: 1.1, label: "Muscle Band" });
  }
  if (item === "wiseglasses" && !isPhysical) {
    modifiers.push({ kind: "power", value: 1.1, label: "Wise Glasses" });
  }
  if (TYPE_BOOSTING_ITEMS[item] === move.type) {
    modifiers.push({ kind: "power", value: 1.2, label: attackerState.item.name });
  }
  if (
    RESIST_BERRIES[defenderItem] === move.type &&
    (defenderItem === "chilanberry" || typeMultiplier > 1)
  ) {
    modifiers.push({ kind: "damage", value: 0.5, label: defenderState.item.name });
  }
  if ((defenderAbility === "prismarmor" || defenderAbility === "solidrock") && typeMultiplier > 1) {
    modifiers.push({ kind: "damage", value: 0.75, label: defenderState.ability.name });
  }
  if ((ability === "hugepower" || ability === "purepower") && attackStat === "atk") {
    modifiers.push({ kind: "attack", value: 2, label: attackerState.ability.name });
  }
  if (ability === "guts" && attackerState.burned && attackStat === "atk") {
    modifiers.push({ kind: "attack", value: 1.5, label: "Guts" });
  }
  if (ability === "technician" && move.basePower <= 60) {
    modifiers.push({ kind: "power", value: 1.5, label: "Technician" });
  }
  if (ability === "adaptability" && attacker.types.includes(move.type)) {
    modifiers.push({ kind: "stab", value: 2, label: "Adaptability" });
  }
  const typePowerAbility = TYPE_POWER_ABILITIES[ability];
  if (typePowerAbility?.type === move.type) {
    modifiers.push({ kind: "attack", value: typePowerAbility.value, label: attackerState.ability.name });
  }
  const moveFlagPowerAbility = MOVE_FLAG_POWER_ABILITIES[ability];
  if (moveFlagPowerAbility && move.flags?.[moveFlagPowerAbility.flag]) {
    modifiers.push({ kind: "power", value: moveFlagPowerAbility.value, label: attackerState.ability.name });
  }
  if (ability === "reckless" && (move.recoil || move.hasCrashDamage)) {
    modifiers.push({ kind: "power", value: 1.2, label: "Reckless" });
  }
  if (ability === "tintedlens" && typeMultiplier < 1) {
    modifiers.push({ kind: "damage", value: 2, label: "Tinted Lens" });
  }

  return modifiers;
}

function applyStage(value, stage) {
  if (stage >= 0) return Math.floor((value * (2 + stage)) / 2);
  return Math.floor((value * 2) / (2 - stage));
}

function hasAbility(state, abilityId) {
  return normalizeId(state.ability?.id ?? state.ability?.name) === abilityId;
}

function hasAnyAbility(state, abilityIds) {
  const ability = normalizeId(state.ability?.id ?? state.ability?.name);
  return abilityIds.includes(ability);
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function percent(value, total) {
  return Math.floor((value * 1000) / total) / 10;
}

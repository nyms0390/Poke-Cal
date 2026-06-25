const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const DAMAGE_ROLLS = [85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100];

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
  "bodypress",
  "foulplay",
  "psyshock",
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
  if (move.damage || move.damageCallback || move.ohko) return "Fixed-damage moves are not supported.";
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
  critical = false,
  burned = false,
}) {
  const unsupported = unsupportedMoveReason(move);
  if (unsupported) return { supported: false, reason: unsupported };

  const moveType = move.type;
  const typeMultiplier = typeEffectiveness(moveType, defender.types);
  if (typeMultiplier === 0) {
    const defenderHp = calculatePokemonStat(defender, defenderState, "hp");
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

  const isPhysical = move.category === "Physical";
  const attackStat = isPhysical ? "atk" : "spa";
  const defenseStat = isPhysical ? "def" : "spd";
  const attack = calculatePokemonStat(attacker, attackerState, attackStat);
  const defense = calculatePokemonStat(defender, defenderState, defenseStat);
  const defenderHp = calculatePokemonStat(defender, defenderState, "hp");
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
  const criticalModifier = critical ? 1.5 : 1;
  const burnModifier =
    burned && isPhysical && !hasAbility(attackerState, "guts") ? 0.5 : 1;

  const rolls = DAMAGE_ROLLS.map((roll) => {
    let damage = baseDamage;
    damage = Math.floor(damage * criticalModifier);
    damage = Math.floor(damage * roll / 100);
    damage = Math.floor(damage * stab);
    damage = Math.floor(damage * typeMultiplier);
    damage = Math.floor(damage * burnModifier);
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

function calculatePokemonStat(pokemon, state, stat) {
  const stages = state.stages ?? {};
  return calculateStat({
    base: pokemon.baseStats[stat],
    stat,
    sp: state.sp?.[stat] ?? 0,
    nature: state.nature ?? "Hardy",
    stage: stat === "hp" ? 0 : stages[stat] ?? 0,
  });
}

function activeModifiers({ attacker, defender, move, attackerState, typeMultiplier, attackStat, isPhysical }) {
  const modifiers = [];
  const item = normalizeId(attackerState.item?.id ?? attackerState.item?.name);
  const ability = normalizeId(attackerState.ability?.id ?? attackerState.ability?.name);

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

  return modifiers;
}

function applyStage(value, stage) {
  if (stage >= 0) return Math.floor((value * (2 + stage)) / 2);
  return Math.floor((value * 2) / (2 - stage));
}

function hasAbility(state, abilityId) {
  return normalizeId(state.ability?.id ?? state.ability?.name) === abilityId;
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function percent(value, total) {
  return Number(((value / total) * 100).toFixed(1));
}

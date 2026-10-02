// Generate test/fixtures/damage-reference.json: PokéCal damage scenarios with all 16 damage
// rolls computed by @smogon/calc (Gen 9 rules, level 50, Champions SP s == EV min(252, 8s)).
//
// This is a dev-only tool. The app and the test suite stay dependency-free: the fixture is
// checked in as data and test/damage-reference.test.js compares the engine against it.
//
//   npm install --no-save @smogon/calc@0.12.0
//   node scripts/dev/generate-damage-reference.mjs
//
// Scenarios embed their species stats and move data, so later catalog syncs do not change
// what a fixture case means. Re-run only when adding scenarios or upgrading the reference.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const smogon = require("@smogon/calc");
const gen = smogon.Generations.get(9);
const root = new URL("../../", import.meta.url);
const OUTPUT = new URL("test/fixtures/damage-reference.json", root);

const catalog = (file) => JSON.parse(readFileSync(new URL(`public/${file}`, root), "utf8"));
const POKEMON = catalog("pokemon.json");
const MOVES = catalog("moves.json");
const id = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const speciesByName = (name) => POKEMON.find((entry) => entry.id === id(name));
const moveByName = (name) => MOVES.find((entry) => entry.id === id(name));

const MOVE_KEYS = [
  "id", "name", "type", "category", "basePower", "target", "flags", "priority", "secondary",
  "secondaries", "recoil", "hasCrashDamage", "multihit", "overrideOffensiveStat",
  "overrideDefensiveStat", "overrideOffensivePokemon", "ignoreDefensive", "ignoreAbility",
  "willCrit", "critRatio",
];
const WEATHER = { SunnyDay: "Sun", RainDance: "Rain", Sandstorm: "Sand", Snowscape: "Snow" };
const TERRAIN = {
  "Electric Terrain": "Electric",
  "Grassy Terrain": "Grassy",
  "Psychic Terrain": "Psychic",
  "Misty Terrain": "Misty",
};
const STATUS = { burn: "brn", paralysis: "par", poison: "psn" };

let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (values) => values[Math.floor(rand() * values.length)];
const NATURES = ["Hardy", "Adamant", "Modest", "Jolly", "Timid", "Bold", "Calm", "Brave", "Quiet", "Impish"];
const SPECIES = [
  "Garchomp", "Incineroar", "Amoonguss", "Charizard", "Gyarados", "Tyranitar", "Dragonite",
  "Rotom-Wash", "Sylveon", "Kingambit", "Gengar", "Metagross", "Scizor", "Clefable", "Hippowdon",
  "Excadrill", "Venusaur", "Pelipper", "Glimmora", "Corviknight", "Whimsicott", "Talonflame",
];
const SINGLE_MOVES = [
  "Dragon Claw", "Flare Blitz", "Hydro Pump", "Thunderbolt", "Ice Beam", "Shadow Ball", "Moonblast",
  "Iron Head", "Close Combat", "Stone Edge", "Earth Power", "Leaf Storm", "Psychic", "Brave Bird",
  "Sludge Bomb", "Flamethrower", "Crunch", "Play Rough", "Energy Ball", "Aura Sphere",
];
const SPREAD_MOVES = [
  "Earthquake", "Heat Wave", "Rock Slide", "Dazzling Gleam", "Muddy Water", "Hyper Voice",
  "Blizzard", "Discharge", "Snarl", "Icy Wind", "Make It Rain", "Eruption",
];

function randomSp() {
  const sp = {};
  let left = 66;
  for (const stat of ["hp", "atk", "def", "spa", "spd", "spe"]) {
    const value = Math.min(left, Math.floor(rand() * 33));
    sp[stat] = value;
    left -= value;
  }
  return sp;
}

const mon = (extra = {}) => ({ species: pick(SPECIES), nature: pick(NATURES), sp: randomSp(), ...extra });

const GROUPS = {
  "singles baseline": () => ({ format: "singles", attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "doubles single target": () => ({ attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "stat stages": () => ({
    format: "singles",
    attacker: mon({ stages: { atk: pick([-2, -1, 1, 2]), spa: pick([-2, -1, 1, 2]) } }),
    defender: mon({ stages: { def: pick([-1, 1, 2]), spd: pick([-1, 1, 2]) } }),
    move: pick(SINGLE_MOVES),
  }),
  "critical hit": () => ({ format: "singles", crit: true, attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  burn: () => ({ format: "singles", attacker: mon({ status: "burn" }), defender: mon(), move: pick(SINGLE_MOVES) }),
  "spread move in doubles": () => ({ attacker: mon(), defender: mon(), move: pick(SPREAD_MOVES) }),
  "sun and rain": () => ({
    format: pick(["singles", "doubles"]),
    weather: pick(["SunnyDay", "RainDance"]),
    attacker: mon(),
    defender: mon(),
    move: pick(["Flamethrower", "Hydro Pump", "Flare Blitz", "Surf", "Heat Wave", "Muddy Water"]),
  }),
  "screens in doubles": () => ({ defenderSide: { reflect: true, lightScreen: true }, attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "screens in singles": () => ({ format: "singles", defenderSide: { reflect: true, lightScreen: true }, attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "Life Orb": () => ({ format: "singles", attacker: mon({ item: "Life Orb" }), defender: mon(), move: pick(SINGLE_MOVES) }),
  "Expert Belt": () => ({ format: "singles", attacker: mon({ item: "Expert Belt" }), defender: mon(), move: pick(SINGLE_MOVES) }),
  "Choice items": () => ({ format: "singles", attacker: mon({ item: pick(["Choice Band", "Choice Specs"]) }), defender: mon(), move: pick(SINGLE_MOVES) }),
  "Friend Guard": () => ({ defenderSide: { friendGuard: true }, attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "Helping Hand": () => ({ attackerSide: { helpingHand: true }, attacker: mon(), defender: mon(), move: pick(SINGLE_MOVES) }),
  "screens + Friend Guard + Helping Hand": () => ({
    attackerSide: { helpingHand: true },
    defenderSide: { reflect: true, lightScreen: true, friendGuard: true },
    attacker: mon({ item: pick(["Life Orb", "Expert Belt", ""]) }),
    defender: mon(),
    move: pick([...SINGLE_MOVES, ...SPREAD_MOVES]),
  }),
  "spread + sun + Life Orb": () => ({ weather: "SunnyDay", attacker: mon({ item: "Life Orb" }), defender: mon(), move: pick(["Heat Wave", "Eruption", "Earthquake", "Rock Slide"]) }),
  "Assault Vest": () => ({ format: "singles", attacker: mon(), defender: mon({ item: "Assault Vest" }), move: pick(["Hydro Pump", "Thunderbolt", "Ice Beam", "Shadow Ball", "Moonblast"]) }),
  terrain: () => ({
    format: "singles",
    terrain: pick(["Grassy Terrain", "Electric Terrain", "Psychic Terrain", "Misty Terrain"]),
    attacker: mon({ species: pick(["Rotom-Wash", "Venusaur", "Gengar", "Garchomp", "Dragonite"]) }),
    defender: mon({ species: pick(["Incineroar", "Kingambit", "Clefable", "Amoonguss"]) }),
    move: pick(["Thunderbolt", "Energy Ball", "Psychic", "Leaf Storm", "Dragon Claw", "Earthquake"]),
  }),
  "resist berries": () => {
    const [move, berry] = pick([
      ["Ice Beam", "Yache Berry"], ["Earthquake", "Shuca Berry"], ["Close Combat", "Chople Berry"],
      ["Flamethrower", "Occa Berry"], ["Shadow Ball", "Kasib Berry"], ["Thunderbolt", "Wacan Berry"],
    ]);
    return { format: "singles", attacker: mon(), defender: mon({ item: berry }), move };
  },
  "defensive abilities": () => {
    const [species, ability, move] = pick([
      ["Dragonite", "Multiscale", "Ice Beam"], ["Mr. Mime", "Filter", "Shadow Ball"],
      ["Houndstone", "Fluffy", "Close Combat"], ["Houndstone", "Fluffy", "Flamethrower"],
      ["Bronzong", "Heatproof", "Flamethrower"], ["Tyranitar", "Solid Rock", "Close Combat"],
      ["Snorlax", "Thick Fat", "Ice Beam"], ["Kommo-o", "Bulletproof", "Shadow Ball"],
    ]);
    return { format: "singles", attacker: mon(), defender: mon({ species, ability }), move };
  },
  immunities: () => {
    const [species, ability, item, move] = pick([
      ["Arcanine", "Flash Fire", "", "Flamethrower"], ["Kingambit", "Defiant", "Air Balloon", "Earthquake"],
      ["Gengar", "Levitate", "", "Earthquake"], ["Kommo-o", "Bulletproof", "", "Sludge Bomb"],
      ["Kommo-o", "Soundproof", "", "Hyper Voice"], ["Orthworm", "Earth Eater", "", "Earthquake"],
      ["Vaporeon", "Water Absorb", "", "Hydro Pump"],
    ]);
    return { format: "singles", attacker: mon(), defender: mon({ species, ability, item }), move };
  },
  "Snow and Sand": () => {
    const snow = rand() < 0.5;
    return {
      format: "singles",
      weather: snow ? "Snowscape" : "Sandstorm",
      attacker: mon(),
      defender: mon({ species: snow ? pick(["Abomasnow", "Glaceon", "Froslass"]) : pick(["Tyranitar", "Glimmora", "Garganacl"]) }),
      move: snow ? pick(["Earthquake", "Close Combat", "Iron Head", "Flamethrower"]) : pick(["Hydro Pump", "Energy Ball", "Earthquake"]),
    };
  },
  "attacker abilities": () => {
    const [species, ability, move] = pick([
      ["Sylveon", "Pixilate", "Hyper Voice"], ["Scizor", "Technician", "Bullet Punch"],
      ["Kangaskhan-Mega", "Parental Bond", "Double-Edge"], ["Basculegion", "Adaptability", "Wave Crash"],
      ["Azumarill", "Huge Power", "Play Rough"], ["Lucario", "Tough Claws", "Close Combat"],
      ["Kingdra", "Sniper", "Hydro Pump"],
    ]);
    return { format: pick(["singles", "doubles"]), crit: ability === "Sniper", attacker: mon({ species, ability }), defender: mon(), move };
  },
};

function smogonPokemon(side) {
  const species = speciesByName(side.species);
  return new smogon.Pokemon(gen, side.species, {
    level: 50,
    nature: side.nature ?? "Hardy",
    evs: Object.fromEntries(["hp", "atk", "def", "spa", "spd", "spe"].map((stat) => [stat, Math.min(252, 8 * (side.sp?.[stat] ?? 0))])),
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    item: side.item || undefined,
    ability: side.ability || "No Ability",
    boosts: side.stages ?? {},
    status: STATUS[side.status] ?? "",
    overrides: { baseStats: species.baseStats, types: species.types },
  });
}

function referenceRolls(scenario) {
  const field = new smogon.Field({
    gameType: (scenario.format ?? "doubles") === "doubles" ? "Doubles" : "Singles",
    weather: WEATHER[scenario.weather],
    terrain: TERRAIN[scenario.terrain],
    attackerSide: { isHelpingHand: Boolean(scenario.attackerSide?.helpingHand) },
    defenderSide: {
      isReflect: Boolean(scenario.defenderSide?.reflect),
      isLightScreen: Boolean(scenario.defenderSide?.lightScreen),
      isFriendGuard: Boolean(scenario.defenderSide?.friendGuard),
    },
  });
  const move = new smogon.Move(gen, moveByName(scenario.move).name, { isCrit: Boolean(scenario.crit) });
  const result = smogon.calculate(gen, smogonPokemon(scenario.attacker), smogonPokemon(scenario.defender), move, field);
  let damage = result.damage;
  if (Array.isArray(damage) && Array.isArray(damage[0])) damage = damage[0].map((_, index) => damage.reduce((sum, hit) => sum + hit[index], 0));
  if (typeof damage === "number") damage = Array(16).fill(damage);
  return damage;
}

function caseSide(side) {
  const species = speciesByName(side.species);
  return {
    pokemon: { id: species.id, name: species.name, types: species.types, baseStats: species.baseStats, weightkg: species.weightkg },
    state: {
      nature: side.nature ?? "Hardy",
      sp: side.sp ?? {},
      stages: side.stages ?? {},
      ability: side.ability ? { id: id(side.ability), name: side.ability } : null,
      item: side.item ? { id: id(side.item), name: side.item } : null,
      status: side.status ?? "",
    },
  };
}

function caseMove(name) {
  const move = moveByName(name);
  return Object.fromEntries(MOVE_KEYS.filter((key) => move[key] !== undefined).map((key) => [key, move[key]]));
}

const PER_GROUP = Number(process.argv[2] ?? 12);
const cases = [];
for (const [group, make] of Object.entries(GROUPS)) {
  let made = 0;
  for (let attempt = 0; made < PER_GROUP && attempt < PER_GROUP * 10; attempt += 1) {
    const scenario = make();
    if (scenario.attacker.species === scenario.defender.species) continue;
    if (!speciesByName(scenario.attacker.species) || !speciesByName(scenario.defender.species) || !moveByName(scenario.move)) continue;
    const rolls = referenceRolls(scenario);
    cases.push({
      group,
      format: scenario.format ?? "doubles",
      weather: scenario.weather ?? "",
      terrain: scenario.terrain ?? "",
      attackerSide: scenario.attackerSide ?? {},
      defenderSide: scenario.defenderSide ?? {},
      critical: Boolean(scenario.crit),
      attacker: caseSide(scenario.attacker),
      defender: caseSide(scenario.defender),
      move: caseMove(scenario.move),
      rolls,
    });
    made += 1;
  }
}

writeFileSync(OUTPUT, `${JSON.stringify({
  reference: `@smogon/calc ${require("@smogon/calc/package.json").version} (Gen 9, level 50, SP s == EV min(252, 8s))`,
  generatedBy: "scripts/dev/generate-damage-reference.mjs",
  cases,
})}\n`);
console.log(`Wrote ${cases.length} cases to ${fileURLToPath(OUTPUT)}`);

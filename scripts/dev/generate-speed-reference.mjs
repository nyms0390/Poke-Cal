// Generate test/fixtures/speed-reference.json: PokéCal Speed scenarios with the final Speed
// computed by @smogon/calc's getFinalSpeed (Gen 9 rules, level 50, Champions SP s == EV
// min(252, 8s), IV 31).
//
// This is a dev-only tool. The app and the test suite stay dependency-free: the fixture is
// checked in as data and test/speed-reference.test.js compares the engine against it.
//
//   npm install --no-save @smogon/calc@0.12.0
//   node scripts/dev/generate-speed-reference.mjs
//
// (NODE_PATH=/path/to/node_modules also works when @smogon/calc is installed elsewhere.)
// The fixture embeds species base stats (`species`), so later catalog syncs do not change what a case means.
// Paradox cases keep Speed stages at 0: Showdown picks the boosted stat unboosted
// (getBestStat(true, true)) while @smogon/calc includes stages.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const smogon = require("@smogon/calc");
const { getFinalSpeed } = require("@smogon/calc/dist/mechanics/util");
const gen = smogon.Generations.get(9);
const OUTPUT = new URL("../../test/fixtures/speed-reference.json", import.meta.url);

const WEATHER = { SunnyDay: "Sun", RainDance: "Rain", Sandstorm: "Sand", Snowscape: "Snow" };
const TERRAIN = { "Electric Terrain": "Electric", "Grassy Terrain": "Grassy" };
const STATUS = { paralysis: "par", burn: "brn", poison: "psn" };
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];

let seed = 20261002;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (values) => values[Math.floor(rand() * values.length)];
const bool = () => rand() < 0.5;
const NATURES = ["Hardy", "Jolly", "Timid", "Brave", "Quiet", "Adamant", "Modest"];
const GRID_SPECIES = ["Garchomp", "Dragonite", "Incineroar", "Kingambit", "Gengar", "Sylveon",
  "Excadrill", "Talonflame", "Whimsicott", "Tyranitar"];

function reference(entry) {
  const evs = Object.fromEntries(STATS.map((stat) => [stat, Math.min(252, 8 * (entry.sp[stat] ?? 0))]));
  const pokemon = new smogon.Pokemon(gen, entry.species, {
    level: 50,
    nature: entry.nature,
    evs,
    item: entry.item || undefined,
    ability: entry.ability || undefined,
    status: STATUS[entry.status] ?? "",
    boosts: { spe: entry.stage ?? 0 },
    abilityOn: Boolean(entry.itemConsumed),
    boostedStat: "auto",
  });
  const field = new smogon.Field({
    gameType: "Doubles",
    weather: WEATHER[entry.weather],
    terrain: TERRAIN[entry.terrain],
    attackerSide: { isTailwind: Boolean(entry.tailwind) },
  });
  return { baseStats: { ...pokemon.species.baseStats }, speed: getFinalSpeed(gen, pokemon, field, field.attackerSide) };
}

const groups = {};
const species = {};
function add(group, entry) {
  const { baseStats, speed } = reference(entry);
  species[entry.species] = baseStats;
  const compact = Object.fromEntries(Object.entries(entry).filter(([, value]) =>
    value !== undefined && value !== "" && value !== false && value !== 0 && value !== null));
  (groups[group] ??= []).push({ ...compact, speed });
}

// 1. The original Scarf/Tailwind/paralysis grid (10 species × 33 SP × 3 natures × 4 combos).
for (const species of GRID_SPECIES) {
  for (let sp = 0; sp <= 32; sp += 1) {
    for (const nature of ["Hardy", "Jolly", "Brave"]) {
      for (const [scarf, tailwind, par] of [[1, 1, 0], [1, 0, 1], [1, 1, 1], [0, 1, 1]]) {
        add("scarf tailwind paralysis grid", {
          species, nature, sp: { spe: sp }, item: scarf ? "Choice Scarf" : "",
          tailwind: Boolean(tailwind), status: par ? "paralysis" : "",
        });
      }
    }
  }
}

// 2. Stages × items × Tailwind × paralysis.
for (let index = 0; index < 300; index += 1) {
  add("stages and items", {
    species: pick(GRID_SPECIES), nature: pick(NATURES), sp: { spe: Math.floor(rand() * 33) },
    stage: Math.floor(rand() * 13) - 6, item: pick(["", "Choice Scarf", "Iron Ball"]),
    tailwind: bool(), status: pick(["", "", "paralysis"]),
  });
}

// 3. Weather / terrain Speed abilities, with and without their field condition.
const FIELD_ABILITIES = [
  ["Kingdra", "Swift Swim", { weather: "RainDance" }],
  ["Ludicolo", "Swift Swim", { weather: "RainDance" }],
  ["Venusaur", "Chlorophyll", { weather: "SunnyDay" }],
  ["Excadrill", "Sand Rush", { weather: "Sandstorm" }],
  ["Cetitan", "Slush Rush", { weather: "Snowscape" }],
  ["Raichu-Alola", "Surge Surfer", { terrain: "Electric Terrain" }],
];
for (const [species, ability, activeField] of FIELD_ABILITIES) {
  for (let index = 0; index < 40; index += 1) {
    const fieldChoice = pick([activeField, activeField, {}, { weather: "SunnyDay" }, { weather: "RainDance" }]);
    add(`${ability}`, {
      species, ability, nature: pick(NATURES), sp: { spe: Math.floor(rand() * 33) },
      stage: pick([0, 0, 1, -1, 2]), item: pick(["", "Choice Scarf", "Iron Ball"]),
      tailwind: bool(), status: pick(["", "", "paralysis"]), ...fieldChoice,
    });
  }
}

// 4. Quick Feet: ×1.5 with any status and no paralysis drop.
for (let index = 0; index < 40; index += 1) {
  add("Quick Feet", {
    species: "Jolteon", ability: "Quick Feet", nature: pick(NATURES), sp: { spe: Math.floor(rand() * 33) },
    stage: pick([0, 0, 1, -1]), item: pick(["", "Choice Scarf"]), tailwind: bool(),
    status: pick(["paralysis", "paralysis", "burn", "poison", ""]),
  });
}

// 5. Unburden: ×2 once the item is consumed (no item modifier), inactive while holding one.
for (let index = 0; index < 40; index += 1) {
  const consumed = bool();
  add("Unburden", {
    species: pick(["Hawlucha", "Sceptile", "Drifblim"]), ability: "Unburden", nature: pick(NATURES),
    sp: { spe: Math.floor(rand() * 33) }, stage: pick([0, 0, 1, -1]),
    item: consumed ? "" : pick(["Choice Scarf", "Iron Ball", "Sitrus Berry"]), itemConsumed: consumed,
    tailwind: bool(), status: pick(["", "", "paralysis"]),
  });
}

// 6. Protosynthesis / Quark Drive Speed boosts from field or Booster Energy (stage 0).
const PARADOX = [
  ["Flutter Mane", "Protosynthesis", { weather: "SunnyDay" }],
  ["Roaring Moon", "Protosynthesis", { weather: "SunnyDay" }],
  ["Iron Bundle", "Quark Drive", { terrain: "Electric Terrain" }],
  ["Iron Valiant", "Quark Drive", { terrain: "Electric Terrain" }],
];
for (const [species, ability, activeField] of PARADOX) {
  for (let index = 0; index < 30; index += 1) {
    const booster = rand() < 0.3;
    const sp = { atk: Math.floor(rand() * 33), spa: Math.floor(rand() * 33), spe: Math.floor(rand() * 33) };
    add(ability, {
      species, ability, nature: pick(NATURES), sp,
      item: booster ? "Booster Energy" : pick(["", "Choice Scarf"]),
      tailwind: bool(), status: pick(["", "", "paralysis"]), ...(bool() ? activeField : {}),
    });
  }
}

writeFileSync(OUTPUT, `${JSON.stringify({
  reference: "@smogon/calc 0.12.0 getFinalSpeed (Gen 9, level 50, EV = min(252, 8 × SP), IV 31)",
  species,
  groups,
}).replace(/\},\{"species"/g, '},\n{"species"')}\n`);
const total = Object.values(groups).reduce((sum, list) => sum + list.length, 0);
console.log(`Wrote ${total} Speed reference cases to ${OUTPUT.pathname}`);

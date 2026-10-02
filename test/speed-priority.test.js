import test from "node:test";
import assert from "node:assert/strict";

import { compareMoveOrder, effectivePriority } from "../src/engine/battle-order.js";
import { calculateDamage } from "../src/engine/damage.js";
import { calculateSpeed, finalSpeed, speedBreakdown } from "../src/engine/speed.js";
import { speedTiers } from "../src/data/speed-line.js";

const entity = (name) => ({ id: name.toLowerCase().replace(/[^a-z0-9]/g, ""), name });
const mon = (spe, types = ["Normal"], extra = {}) => ({
  name: `Spe${spe}`,
  types,
  baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe },
  ...extra,
});
const side = (spe, extra = {}) => ({
  pokemon: mon(spe, extra.types),
  nature: "Hardy",
  sp: { spe: 0 },
  stages: { spe: 0 },
  currentHpFraction: 1,
  ...extra,
});
const tackle = { id: "tackle", name: "Tackle", type: "Normal", category: "Physical", basePower: 40, priority: 0, flags: {} };

// --- Speed arithmetic (Showdown: chain 4096 modifiers, apply once, then paralysis) ---

test("chains Scarf and Tailwind before rounding (Brave 0 SP Garchomp → 327, @smogon/calc)", () => {
  const garchomp = { pokemon: { baseStats: { spe: 102 } }, nature: "Brave", sp: { spe: 0 } };
  // 122 × 0.9 = 109 → chain(8192, 6144) = 12288 → pokeRound(109 × 3) = 327 (old per-step floor gave 326).
  assert.equal(finalSpeed({ ...garchomp, item: entity("Choice Scarf"), tailwind: true }), 327);
  assert.equal(calculateSpeed({ baseSpeed: 102, nature: "Brave", tailwind: true, speedMultiplier: 1.5 }).modifiedSpeed, 327);
});

test("applies paralysis after the whole modifier chain", () => {
  const breakdown = speedBreakdown(side(100, { item: entity("Choice Scarf"), tailwind: true, status: "paralysis" }));
  assert.deepEqual(breakdown.modifiers.map(({ label }) => label), ["Tailwind", "Choice Scarf"]);
  assert.equal(breakdown.paralysisDrop, true);
  assert.equal(breakdown.speed, 180); // 120 × 3 = 360 → floor(360 × 50 / 100)
});

test("keeps Choice Scarf and chains the manual Speed modifier separately", () => {
  const scarf = side(100, { item: entity("Choice Scarf") });
  assert.equal(finalSpeed(scarf), 180);
  assert.equal(finalSpeed({ ...scarf, speedMultiplier: 1.5 }), 270);
  assert.equal(finalSpeed({ ...scarf, speedMultiplier: 0.5 }), 90);
  assert.equal(finalSpeed({ ...side(100), speedMultiplier: 2 }), 240);
});

test("weather and terrain Speed abilities double Speed in the battle engine", () => {
  const cases = [
    ["Swift Swim", { weather: "RainDance" }],
    ["Chlorophyll", { weather: "SunnyDay" }],
    ["Sand Rush", { weather: "Sandstorm" }],
    ["Slush Rush", { weather: "Snowscape" }],
    ["Surge Surfer", { terrain: "Electric Terrain" }],
  ];
  for (const [ability, field] of cases) {
    const state = side(100, { ability: entity(ability) });
    assert.equal(finalSpeed(state, field), 240, ability);
    assert.equal(finalSpeed(state, {}), 120, `${ability} without its field`);
    assert.equal(finalSpeed(state, field, { suppressAbility: true }), 120, `${ability} suppressed`);
  }
  const swiftSwim = side(100, { ability: entity("Swift Swim") });
  assert.equal(finalSpeed(swiftSwim, { weather: "RainDance" }, { suppressWeather: true }), 120);
  assert.equal(finalSpeed({ ...swiftSwim, item: entity("Utility Umbrella") }, { weather: "RainDance" }), 120);
  assert.equal(finalSpeed({ ...side(100, { ability: entity("Sand Rush") }), item: entity("Utility Umbrella") },
    { weather: "Sandstorm" }), 240);
});

test("Quick Feet boosts any status and replaces the paralysis drop", () => {
  const jolteon = { pokemon: { baseStats: { spe: 130 } }, nature: "Hardy", sp: { spe: 0 }, ability: entity("Quick Feet") };
  assert.equal(finalSpeed(jolteon), 150);
  assert.equal(finalSpeed({ ...jolteon, status: "paralysis" }), 225);
  assert.equal(finalSpeed({ ...jolteon, status: "burn" }), 225);
  assert.equal(finalSpeed({ ...jolteon, status: "paralysis" }, {}, { suppressAbility: true }), 75);
});

test("Unburden needs the item consumed and then ignores the item", () => {
  const unburden = side(100, { ability: entity("Unburden"), item: entity("Choice Scarf") });
  assert.equal(finalSpeed(unburden), 180);
  assert.equal(finalSpeed({ ...unburden, itemConsumed: true }), 240);
  assert.equal(finalSpeed(unburden, {}, { itemConsumed: true }), 240);
});

test("Paradox Speed boost is part of the chain (pokeRound with Scarf)", () => {
  const paradox = {
    pokemon: { baseStats: { atk: 50, def: 50, spa: 50, spd: 50, spe: 131 } },
    nature: "Hardy",
    sp: { spe: 0 },
    ability: entity("Protosynthesis"),
    item: entity("Choice Scarf"),
  };
  // 151 × chain(6144, 6144) = 151 × 9216/4096 = 339.75 → 340 (old separate floors gave 339).
  assert.equal(finalSpeed(paradox, { weather: "SunnyDay" }), 340);
});

test("battle order uses Swift Swim, Quick Feet and Cloud Nine suppression", () => {
  const rain = { weather: "RainDance" };
  const swimmer = side(80, { ability: entity("Swift Swim") });
  const fast = side(120);
  assert.equal(compareMoveOrder({ attacker: swimmer, defender: fast, attackerMove: tackle, defenderMove: tackle, field: rain }).firstSide, "attacker");
  const cloudNine = { ...fast, ability: entity("Cloud Nine") };
  assert.equal(compareMoveOrder({ attacker: swimmer, defender: cloudNine, attackerMove: tackle, defenderMove: tackle, field: rain }).firstSide, "defender");
  const jolteon = { ...side(130), ability: entity("Quick Feet"), status: "paralysis" };
  assert.equal(compareMoveOrder({ attacker: jolteon, defender: side(150), attackerMove: tackle, defenderMove: tackle }).attackerSpeed, 225);
});

test("Speed page tiers and battle engine agree on the same modifiers", () => {
  const pokemon = { id: "kingdra", name: "Kingdra", baseStats: { spe: 85 } };
  const [row] = speedTiers({ pokemon, nature: "Timid", spe: 32 }, [], {
    mode: "battle",
    userMods: { speedItem: "choicescarf", tailwind: true, paralysis: true, ability: entity("Swift Swim"), abilityActive: true },
  });
  const engine = finalSpeed({
    pokemon, nature: "Timid", sp: { spe: 32 }, item: entity("Choice Scarf"), tailwind: true,
    status: "paralysis", ability: entity("Swift Swim"),
  }, { weather: "RainDance" });
  assert.equal(row.speed, engine);
});

// --- Priority ---

const braveBird = { id: "bravebird", name: "Brave Bird", type: "Flying", category: "Physical", basePower: 120, priority: 0, flags: {} };
const tailwindMove = { id: "tailwind", name: "Tailwind", type: "Flying", category: "Status", basePower: 0, priority: 0, flags: {} };
const drainPunch = { id: "drainpunch", name: "Drain Punch", type: "Fighting", category: "Physical", basePower: 75, priority: 0, flags: { heal: 1 } };
const grassyGlide = { id: "grassyglide", name: "Grassy Glide", type: "Grass", category: "Physical", basePower: 55, priority: 0, flags: {} };

test("Gale Wings gives Flying moves +1 only at full HP", () => {
  const galeWings = side(50, { ability: entity("Gale Wings") });
  assert.equal(effectivePriority(braveBird, galeWings), 1);
  assert.equal(effectivePriority(braveBird, { ...galeWings, currentHpFraction: 0.99 }), 0);
  assert.equal(effectivePriority(tackle, galeWings), 0);
  assert.equal(effectivePriority(braveBird, galeWings, {}, { suppressAbility: true }), 0);
});

test("Prankster gives Status moves +1 and Triage gives healing moves +3", () => {
  assert.equal(effectivePriority(tailwindMove, side(50, { ability: entity("Prankster") })), 1);
  assert.equal(effectivePriority(tackle, side(50, { ability: entity("Prankster") })), 0);
  assert.equal(effectivePriority(drainPunch, side(50, { ability: entity("Triage") })), 3);
  assert.equal(effectivePriority(tackle, side(50, { ability: entity("Triage") })), 0);
});

test("Grassy Glide is +1 in Grassy Terrain only while grounded", () => {
  const grassy = { terrain: "Grassy Terrain" };
  assert.equal(effectivePriority(grassyGlide, side(50), grassy), 1);
  assert.equal(effectivePriority(grassyGlide, side(50), {}), 0);
  assert.equal(effectivePriority(grassyGlide, side(50, { types: ["Flying"] }), grassy), 0);
  assert.equal(effectivePriority(grassyGlide, side(50, { ability: entity("Levitate") }), grassy), 0);
});

test("move order uses effective priority, Neutralizing Gas suppression, and keeps Trick Room for Speed", () => {
  const prankster = side(50, { ability: entity("Prankster") });
  const fast = side(150);
  const order = compareMoveOrder({ attacker: prankster, defender: fast, attackerMove: tailwindMove, defenderMove: tackle });
  assert.equal(order.firstSide, "attacker");
  assert.equal(order.attackerPriority, 1);
  const gassed = compareMoveOrder({
    attacker: prankster,
    defender: { ...fast, ability: entity("Neutralizing Gas") },
    attackerMove: tailwindMove,
    defenderMove: tackle,
  });
  assert.equal(gassed.firstSide, "defender");
  const trickRoom = compareMoveOrder({ attacker: prankster, defender: fast, attackerMove: tailwindMove, defenderMove: tackle, trickRoom: true });
  assert.equal(trickRoom.firstSide, "attacker");
  const sameBracket = compareMoveOrder({ attacker: prankster, defender: fast, attackerMove: tackle, defenderMove: tackle, trickRoom: true });
  assert.equal(sameBracket.firstSide, "attacker");
  const grassy = compareMoveOrder({
    attacker: side(50), defender: fast, attackerMove: grassyGlide, defenderMove: tackle, field: { terrain: "Grassy Terrain" },
  });
  assert.equal(grassy.firstSide, "attacker");
});

test("Bolt Beak and Payback use effective priority and engine Speed to decide order", () => {
  const user = { ...side(120, { types: ["Electric", "Dark"] }) };
  const target = { ...side(50, { ability: entity("Gale Wings") }) };
  const boltBeak = { id: "boltbeak", name: "Bolt Beak", type: "Electric", category: "Physical", basePower: 85, priority: 0, flags: {} };
  const payback = { id: "payback", name: "Payback", type: "Dark", category: "Physical", basePower: 50, priority: 0, flags: {} };
  const run = (move, opponentMove, attackerState = user, defenderState = target, field) => calculateDamage({
    attacker: attackerState.pokemon, defender: defenderState.pokemon, move, attackerState, defenderState,
    moveOptions: { opponentMove }, ...(field ? { field } : {}),
  }).notes;
  assert.ok(run(boltBeak, tackle).includes("Assumes target has not moved"));
  // Gale Wings Brave Bird is +1: the slower target moves first, so Bolt Beak is not doubled.
  assert.ok(run(boltBeak, braveBird).includes("Assumes target already moved"));
  assert.ok(run(payback, braveBird).includes("Assumes target already moved"));
  // Swift Swim in rain makes the slow target faster than the user.
  const swimmer = side(80, { ability: entity("Swift Swim") });
  const notes = calculateDamage({
    attacker: user.pokemon, defender: swimmer.pokemon, move: boltBeak, attackerState: user, defenderState: swimmer,
    moveOptions: { opponentMove: tackle }, field: { weather: "RainDance" },
  }).notes;
  assert.ok(notes.includes("Assumes target already moved"));
});

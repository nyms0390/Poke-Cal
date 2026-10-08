import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage, survivalChance } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";

const garchomp = { id: "garchomp", name: "Garchomp", types: ["Dragon", "Ground"], baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 } };
const dragonite = { id: "dragonite", name: "Dragonite", types: ["Dragon", "Flying"], baseStats: { hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80 } };
const kingambit = { id: "kingambit", name: "Kingambit", types: ["Dark", "Steel"], baseStats: { hp: 100, atk: 135, def: 120, spa: 60, spd: 85, spe: 50 } };
const incineroar = { id: "incineroar", name: "Incineroar", types: ["Fire", "Dark"], baseStats: { hp: 95, atk: 115, def: 90, spa: 80, spd: 90, spe: 60 } };
const corviknight = { id: "corviknight", name: "Corviknight", types: ["Flying", "Steel"], baseStats: { hp: 98, atk: 87, def: 105, spa: 53, spd: 85, spe: 67 } };
const arcanine = { id: "arcanine", name: "Arcanine", types: ["Fire"], baseStats: { hp: 90, atk: 110, def: 80, spa: 100, spd: 80, spe: 95 } };

const earthquake = { id: "earthquake", name: "Earthquake", type: "Ground", category: "Physical", basePower: 100, target: "allAdjacent", flags: {} };
const dragonClaw = { id: "dragonclaw", name: "Dragon Claw", type: "Dragon", category: "Physical", basePower: 80, target: "normal", flags: { contact: 1 } };
const fireFang = { id: "firefang", name: "Fire Fang", type: "Fire", category: "Physical", basePower: 65, target: "normal", flags: { bite: 1, contact: 1 } };

const jollyGarchomp = { nature: "Jolly", sp: { atk: 32, spe: 32 }, stages: {}, ability: null, item: null };
const bulky = (extra = {}) => ({ nature: "Hardy", sp: { hp: 32 }, stages: {}, ability: null, item: null, ...extra });
const singles = createField({ format: "singles" });

test("Air Balloon blocks Ground moves unless Gravity grounds the holder", () => {
  const balloon = bulky({ item: { id: "airballoon", name: "Air Balloon" } });
  const blocked = calculateDamage({ attacker: garchomp, defender: kingambit, move: earthquake, attackerState: jollyGarchomp, defenderState: balloon, field: singles });
  const gravity = calculateDamage({ attacker: garchomp, defender: kingambit, move: earthquake, attackerState: jollyGarchomp, defenderState: balloon, field: createField({ format: "singles", gravity: true }) });
  const moldBreaker = calculateDamage({
    attacker: garchomp,
    defender: kingambit,
    move: earthquake,
    attackerState: { ...jollyGarchomp, ability: { id: "moldbreaker", name: "Mold Breaker" } },
    defenderState: balloon,
    field: singles,
  });

  assert.equal(blocked.maxDamage, 0);
  assert.equal(blocked.notes.includes("Air Balloon"), true);
  assert.ok(gravity.maxDamage > 0);
  // Air Balloon is an item, so Mold Breaker does not bypass it.
  assert.equal(moldBreaker.maxDamage, 0);
});

test("Gravity grounds Flying types and Levitate users for Ground moves", () => {
  const gravity = createField({ format: "singles", gravity: true });
  const flying = calculateDamage({ attacker: garchomp, defender: corviknight, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky(), field: gravity });
  const noGravity = calculateDamage({ attacker: garchomp, defender: corviknight, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky(), field: singles });

  assert.equal(noGravity.maxDamage, 0);
  assert.equal(flying.typeMultiplier, 2);
  assert.ok(flying.maxDamage > 0);
});

test("Flash Fire, Earth Eater, Bulletproof and Soundproof grant immunities", () => {
  const flashFire = calculateDamage({ attacker: garchomp, defender: arcanine, move: fireFang, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "flashfire", name: "Flash Fire" } }), field: singles });
  const earthEater = calculateDamage({ attacker: garchomp, defender: kingambit, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "eartheater", name: "Earth Eater" } }), field: singles });
  const shadowBall = { id: "shadowball", name: "Shadow Ball", type: "Ghost", category: "Special", basePower: 80, target: "normal", flags: { bullet: 1 } };
  const hyperVoice = { id: "hypervoice", name: "Hyper Voice", type: "Normal", category: "Special", basePower: 90, target: "allAdjacentFoes", flags: { sound: 1 } };
  const bulletproof = calculateDamage({ attacker: garchomp, defender: incineroar, move: shadowBall, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "bulletproof", name: "Bulletproof" } }), field: singles });
  const soundproof = calculateDamage({ attacker: garchomp, defender: kingambit, move: hyperVoice, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "soundproof", name: "Soundproof" } }), field: singles });

  for (const result of [flashFire, earthEater, bulletproof, soundproof]) {
    assert.equal(result.maxDamage, 0);
    assert.equal(result.notes.includes("Immune (ability)"), true);
  }
});

test("Multiscale only reduces the first hit when counting hits to KO", () => {
  const result = calculateDamage({
    attacker: garchomp,
    defender: dragonite,
    move: dragonClaw,
    attackerState: jollyGarchomp,
    defenderState: bulky({ ability: { id: "multiscale", name: "Multiscale" } }),
    field: singles,
  });

  // 72-85 with Multiscale, then 144-170 into 198 HP: always a 2HKO.
  assert.deepEqual([result.minDamage, result.maxDamage], [72, 85]);
  assert.equal(result.ko.text, "guaranteed 2HKO");
});

test("a resist berry is consumed by the first hit", () => {
  const result = calculateDamage({
    attacker: garchomp,
    defender: kingambit,
    move: earthquake,
    attackerState: jollyGarchomp,
    defenderState: bulky({ item: { id: "shucaberry", name: "Shuca Berry" } }),
    field: singles,
  });

  assert.deepEqual([result.minDamage, result.maxDamage], [75, 88]);
  assert.equal(result.ko.text, "guaranteed 2HKO");
});

test("Leftovers and Sitrus Berry recovery are included in KO chances", () => {
  const defensive = (item) => bulky({ sp: { hp: 32, def: 20 }, item });
  const plain = calculateDamage({ attacker: garchomp, defender: incineroar, move: dragonClaw, attackerState: jollyGarchomp, defenderState: defensive(null), field: singles });
  const leftovers = calculateDamage({ attacker: garchomp, defender: incineroar, move: dragonClaw, attackerState: jollyGarchomp, defenderState: defensive({ id: "leftovers", name: "Leftovers" }), field: singles });
  const sitrus = calculateDamage({ attacker: garchomp, defender: incineroar, move: dragonClaw, attackerState: jollyGarchomp, defenderState: defensive({ id: "sitrusberry", name: "Sitrus Berry" }), field: singles });
  const unnerved = calculateDamage({
    attacker: garchomp,
    defender: incineroar,
    move: dragonClaw,
    attackerState: { ...jollyGarchomp, ability: { id: "unnerve", name: "Unnerve" } },
    defenderState: defensive({ id: "sitrusberry", name: "Sitrus Berry" }),
    field: singles,
  });

  // 64-76 into 202 HP. Leftovers text and odds match @smogon/calc.
  assert.equal(plain.ko.text, "87.1% chance to 3HKO");
  assert.equal(leftovers.ko.text, "0.2% chance to 3HKO after Leftovers recovery");
  // Sitrus (+50 once HP drops to 101 or less) always buys a fourth hit.
  assert.equal(sitrus.ko.text, "guaranteed 4HKO after Sitrus Berry recovery");
  assert.equal(unnerved.ko.text, plain.ko.text);
});

test("Snow raises the Defense of Ice types", () => {
  const abomasnow = { id: "abomasnow", name: "Abomasnow", types: ["Grass", "Ice"], baseStats: { hp: 90, atk: 92, def: 75, spa: 92, spd: 85, spe: 60 } };
  const clear = calculateDamage({ attacker: garchomp, defender: abomasnow, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky(), field: singles });
  const snow = calculateDamage({ attacker: garchomp, defender: abomasnow, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky(), field: createField({ format: "singles", weather: "Snowscape" }) });

  assert.ok(snow.maxDamage < clear.maxDamage);
  assert.equal(snow.notes.includes("Snow Ice Def boost"), true);
});

test("Mold Breaker only bypasses breakable abilities", () => {
  const lunala = { id: "lunala", name: "Lunala", types: ["Psychic", "Ghost"], baseStats: { hp: 137, atk: 113, def: 89, spa: 137, spd: 107, spe: 97 } };
  const shadowClaw = { id: "shadowclaw", name: "Shadow Claw", type: "Ghost", category: "Physical", basePower: 70, target: "normal", flags: { contact: 1 } };
  const moldBreaker = { ...jollyGarchomp, ability: { id: "moldbreaker", name: "Mold Breaker" } };
  const calc = (attackerState, ability, defender = lunala) => calculateDamage({ attacker: garchomp, defender, move: shadowClaw, attackerState, defenderState: bulky({ ability }), field: singles });
  const shadowShield = { id: "shadowshield", name: "Shadow Shield", flags: {} };
  const multiscale = { id: "multiscale", name: "Multiscale", flags: { breakable: 1 } };

  // Shadow Shield is not breakable: Mold Breaker still takes half damage.
  assert.deepEqual(calc(moldBreaker, shadowShield).rolls, calc(jollyGarchomp, shadowShield).rolls);
  assert.equal(calc(moldBreaker, shadowShield).notes.includes("Mold Breaker"), false);
  // Multiscale is breakable: Mold Breaker deals full damage.
  assert.deepEqual(calc(moldBreaker, multiscale, dragoniteLike()).rolls, calc(jollyGarchomp, null, dragoniteLike()).rolls);
  assert.ok(calc(jollyGarchomp, multiscale, dragoniteLike()).maxDamage < calc(moldBreaker, multiscale, dragoniteLike()).maxDamage);
});

function dragoniteLike() {
  return { id: "dragonite", name: "Dragonite", types: ["Dragon", "Flying"], baseStats: { hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 80 } };
}

test("Tera raises weak moves of the Tera type to 60 power", () => {
  const incineroarState = (teraType) => ({ nature: "Modest", sp: { spa: 32 }, stages: {}, ability: null, item: null, teraType });
  const snarl = { id: "snarl", name: "Snarl", type: "Dark", category: "Special", basePower: 55, target: "allAdjacentFoes", flags: { sound: 1 }, priority: 0 };
  const quickAttack = { id: "quickattack", name: "Quick Attack", type: "Normal", category: "Physical", basePower: 40, target: "normal", flags: { contact: 1 }, priority: 1 };
  const tera = calculateDamage({ attacker: incineroar, defender: garchomp, move: snarl, attackerState: incineroarState("Dark"), defenderState: bulky(), field: singles });
  const otherTera = calculateDamage({ attacker: incineroar, defender: garchomp, move: snarl, attackerState: incineroarState("Fire"), defenderState: bulky(), field: singles });
  const priority = calculateDamage({ attacker: incineroar, defender: garchomp, move: quickAttack, attackerState: incineroarState("Normal"), defenderState: bulky(), field: singles });

  assert.equal(tera.notes.includes("Tera Dark raises Snarl to 60 power"), true);
  assert.equal(otherTera.notes.some((note) => note.includes("to 60 power")), false);
  // Priority moves keep their base power.
  assert.equal(priority.notes.some((note) => note.includes("to 60 power")), false);
});

test("Foul Play uses the target's Attack boosts unless the target has Unaware", () => {
  const grimmsnarl = { id: "grimmsnarl", name: "Grimmsnarl", types: ["Dark", "Fairy"], baseStats: { hp: 95, atk: 120, def: 65, spa: 95, spd: 75, spe: 60 } };
  const clefable = { id: "clefable", name: "Clefable", types: ["Fairy"], baseStats: { hp: 95, atk: 70, def: 73, spa: 95, spd: 90, spe: 60 } };
  const foulPlay = { id: "foulplay", name: "Foul Play", type: "Dark", category: "Physical", basePower: 95, target: "normal", flags: { contact: 1 }, overrideOffensivePokemon: "target" };
  const neutral = { nature: "Hardy", sp: {}, stages: {}, ability: null, item: null };
  const unaware = { id: "unaware", name: "Unaware", flags: { breakable: 1 } };
  const boostedTarget = (ability) => ({ ...neutral, ability, stages: { atk: 2 } });

  // Matches @smogon/calc: the Unaware target ignores its own +2 (26-31) ...
  const unawareTarget = calculateDamage({ attacker: grimmsnarl, defender: clefable, move: foulPlay, attackerState: neutral, defenderState: boostedTarget(unaware), field: singles });
  assert.deepEqual([unawareTarget.minDamage, unawareTarget.maxDamage], [26, 31]);
  // ... while an Unaware user still suffers the target's +2 (94-111).
  const unawareUser = calculateDamage({ attacker: clefable, defender: garchomp, move: foulPlay, attackerState: { ...neutral, ability: unaware }, defenderState: boostedTarget(null), field: singles });
  assert.deepEqual([unawareUser.minDamage, unawareUser.maxDamage], [94, 111]);
});

test("Expanding Force becomes a spread move in Psychic Terrain", () => {
  const indeedee = { id: "indeedee", name: "Indeedee", types: ["Psychic", "Normal"], baseStats: { hp: 60, atk: 65, def: 55, spa: 105, spd: 95, spe: 95 } };
  const expandingForce = { id: "expandingforce", name: "Expanding Force", type: "Psychic", category: "Special", basePower: 80, target: "normal", flags: {} };
  const modest = { nature: "Modest", sp: { spa: 32 }, stages: {}, ability: null, item: null };
  const calc = (field) => calculateDamage({ attacker: indeedee, defender: garchomp, move: expandingForce, attackerState: modest, defenderState: { nature: "Hardy", sp: {}, stages: {}, ability: null, item: null }, field });

  // Matches @smogon/calc: 120 BP and the doubles spread modifier in Psychic Terrain.
  const doublesTerrain = calc(createField({ terrain: "Psychic Terrain" }));
  assert.deepEqual([doublesTerrain.minDamage, doublesTerrain.maxDamage], [108, 127]);
  assert.equal(doublesTerrain.notes.includes("Doubles spread move"), true);
  // Without terrain it stays single-target; in singles there is no spread modifier.
  assert.equal(calc(createField({})).notes.includes("Doubles spread move"), false);
  const singlesTerrain = calc(createField({ format: "singles", terrain: "Psychic Terrain" }));
  assert.deepEqual([singlesTerrain.minDamage, singlesTerrain.maxDamage], [144, 171]);
  // An ungrounded user gets neither the boost nor the spread.
  const floating = calculateDamage({ attacker: indeedee, defender: garchomp, move: expandingForce, attackerState: { ...modest, grounded: false }, defenderState: { nature: "Hardy", sp: {}, stages: {}, ability: null, item: null }, field: createField({ terrain: "Psychic Terrain" }) });
  assert.equal(floating.notes.includes("Doubles spread move"), false);
});

test("survival chance weights multi-hit outcomes instead of treating rolls as equally likely", () => {
  const twoHits = { id: "dualwingbeat", name: "Dual Wingbeat", type: "Flying", category: "Physical", basePower: 40, target: "normal", flags: { contact: 1 }, multihit: 2 };
  const oneHit = { ...twoHits, id: "singlewingbeat", name: "Single Wingbeat", multihit: undefined };
  const adamant = { nature: "Adamant", sp: { atk: 32 }, stages: {}, ability: null, item: null };
  const neutral = { nature: "Hardy", sp: {}, stages: {}, ability: null, item: null };
  const both = calculateDamage({ attacker: dragoniteLike(), defender: incineroar, move: twoHits, attackerState: adamant, defenderState: neutral, field: singles });
  const single = calculateDamage({ attacker: dragoniteLike(), defender: incineroar, move: oneHit, attackerState: adamant, defenderState: neutral, field: singles });

  const totalChance = both.distribution.reduce((sum, { chance }) => sum + chance, 0);
  assert.ok(Math.abs(totalChance - 1) < 1e-12);
  for (const hp of [80, 89, 93, 99, 110]) {
    let survive = 0;
    for (const first of single.rolls) for (const second of single.rolls) if (first + second < hp) survive += 1;
    assert.ok(Math.abs(survivalChance(both, hp) - survive / 256) < 1e-12, `HP ${hp}`);
  }
  // Single-hit moves keep the plain 16-roll answer.
  const hp = single.rolls[8];
  assert.equal(survivalChance(single, hp), single.rolls.filter((damage) => damage < hp).length / 16);
});

test("ko.chances lists the cumulative KO chance per hit count", () => {
  const result = calculateDamage({
    attacker: garchomp, defender: incineroar, move: dragonClaw,
    attackerState: { pokemon: garchomp, ...jollyGarchomp }, defenderState: { pokemon: incineroar, ...bulky() }, field: singles,
  });
  const { chances } = result.ko;
  assert.deepEqual(chances.map(({ hits }) => hits), chances.map((_, index) => index + 1));
  assert.equal(chances.find(({ chance }) => chance > 0).hits, result.ko.hits);
  assert.equal(chances.find(({ chance }) => chance > 0).chance, result.ko.chance);
  for (let index = 1; index < chances.length; index += 1) assert.ok(chances[index].chance >= chances[index - 1].chance);
});

test("Sturdy survival reports a guaranteed 2HKO in ko.chances", () => {
  const hitter = { id: "hitter", name: "Hitter", types: ["Grass"], baseStats: { hp: 100, atk: 150, def: 100, spa: 100, spd: 100, spe: 100 } };
  const target = { id: "sturdy-target", name: "Sturdy Target", types: ["Water"], baseStats: { hp: 40, atk: 50, def: 40, spa: 50, spd: 50, spe: 50 } };
  const woodHammer = { id: "woodhammer", name: "Wood Hammer", type: "Grass", category: "Physical", basePower: 120, target: "normal", flags: { contact: 1 } };
  const result = calculateDamage({
    attacker: hitter, defender: target, move: woodHammer,
    attackerState: { pokemon: hitter, nature: "Adamant", sp: { atk: 32 }, stages: {}, ability: null, item: null },
    defenderState: { pokemon: target, ...bulky({ sp: {}, ability: { id: "sturdy", name: "Sturdy" } }) },
    field: singles,
  });
  assert.equal(result.ko.text, "survives with Sturdy at full HP");
  assert.equal(result.ko.hits, null);
  assert.deepEqual(result.ko.chances, [{ hits: 1, chance: 0 }, { hits: 2, chance: 1 }]);
});

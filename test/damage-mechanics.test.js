import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage, survivalChance, unsupportedMoveReason } from "../src/engine/damage.js";
import { createField, isGrounded } from "../src/engine/field.js";

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

const sashHitter = { id: "hitter", name: "Hitter", types: ["Grass"], baseStats: { hp: 100, atk: 150, def: 100, spa: 100, spd: 100, spe: 100 } };
const sashTarget = { id: "sash-target", name: "Sash Target", types: ["Water"], baseStats: { hp: 40, atk: 50, def: 40, spa: 50, spd: 50, spe: 50 } };
const sashWoodHammer = { id: "woodhammer", name: "Wood Hammer", type: "Grass", category: "Physical", basePower: 120, target: "normal", flags: { contact: 1 } };
const focusSash = { id: "focussash", name: "Focus Sash" };
const sashHit = ({ move = sashWoodHammer, attacker = {}, defender = {} } = {}) => calculateDamage({
  attacker: sashHitter, defender: sashTarget, move,
  attackerState: { pokemon: sashHitter, nature: "Adamant", sp: { atk: 32 }, stages: {}, ability: null, item: null, ...attacker },
  defenderState: { pokemon: sashTarget, ...bulky({ sp: {}, item: focusSash, ...defender }) },
  field: singles,
});

test("Focus Sash at full HP survives a hit that would OHKO", () => {
  const result = sashHit();
  assert.ok(result.minDamage >= result.defenderHp, "every roll would OHKO without the sash");
  assert.equal(result.ko.text, "survives with Focus Sash at full HP");
  assert.deepEqual(result.ko.chances, [{ hits: 1, chance: 0 }, { hits: 2, chance: 1 }]);
  assert.equal(survivalChance(result), 1);
  // Mold Breaker skips Sturdy, not a held item.
  assert.equal(sashHit({ attacker: { ability: { id: "moldbreaker", name: "Mold Breaker" } } }).ko.text, "survives with Focus Sash at full HP");
});

test("Focus Sash does nothing below full HP or once consumed", () => {
  assert.equal(sashHit({ defender: { currentHpFraction: 0.99 } }).ko.text, "guaranteed OHKO");
  assert.equal(sashHit({ defender: { itemConsumed: true } }).ko.text, "guaranteed OHKO");
});

test("Focus Sash only removes the OHKO rolls of a partial OHKO", () => {
  const partial = sashHit({ move: { ...sashWoodHammer, basePower: 25 } });
  const unprotected = sashHit({ move: { ...sashWoodHammer, basePower: 25 }, defender: { item: null } });
  assert.ok(unprotected.ko.hits === 1 && unprotected.ko.chance > 0 && unprotected.ko.chance < 1, unprotected.ko.text);
  assert.equal(partial.ko.text, "guaranteed 2HKO (Focus Sash)");
  assert.equal(survivalChance(partial), 1);
});

test("Focus Sash caps only the first hit of multi-hit moves and Parental Bond", () => {
  const doubleHit = sashHit({ move: { ...sashWoodHammer, id: "doublehammer", name: "Double Hammer", multihit: 2 } });
  assert.equal(doubleHit.ko.text, "guaranteed OHKO");
  assert.equal(survivalChance(doubleHit), 0);

  const parentalBond = sashHit({ attacker: { ability: { id: "parentalbond", name: "Parental Bond" } } });
  assert.equal(parentalBond.ko.text, "guaranteed OHKO");
  assert.equal(survivalChance(parentalBond), 0);
});

test("Electro Shot and Meteor Beam raise the user's SpA by 1 before hitting", () => {
  const archaludon = { id: "archaludon", name: "Archaludon", types: ["Steel", "Dragon"], baseStats: { hp: 90, atk: 105, def: 130, spa: 125, spd: 65, spe: 85 } };
  const electroShot = { id: "electroshot", name: "Electro Shot", type: "Electric", category: "Special", basePower: 130, target: "normal", flags: { charge: 1 } };
  const thunderbolt = { ...electroShot, id: "thunderbolt", name: "Thunderbolt", flags: {} };
  const meteorBeam = { id: "meteorbeam", name: "Meteor Beam", type: "Rock", category: "Special", basePower: 120, target: "normal", flags: { charge: 1 } };
  const modest = (extra = {}) => ({ nature: "Modest", sp: { spa: 32 }, stages: {}, ability: null, item: null, ...extra });
  const calc = (move, attackerState, extra = {}) => calculateDamage({ attacker: archaludon, defender: corviknight, move, attackerState, defenderState: bulky(), field: singles, ...extra });

  const shot = calc(electroShot, modest());
  const boostedBolt = calc(thunderbolt, modest({ stages: { spa: 1 } }));
  assert.deepEqual(shot.rolls, boostedBolt.rolls);
  assert.equal(shot.notes.includes("+1 SpA from the charge turn"), true);
  // The boost also applies in rain, where the charge turn is skipped.
  const rain = createField({ format: "singles", weather: "RainDance" });
  assert.deepEqual(calc(electroShot, modest(), { field: rain }).rolls, calc(thunderbolt, modest({ stages: { spa: 1 } }), { field: rain }).rolls);
  // Stacks with existing boosts and caps at +6.
  assert.deepEqual(calc(electroShot, modest({ stages: { spa: 2 } })).rolls, calc(thunderbolt, modest({ stages: { spa: 3 } })).rolls);
  const capped = calc(electroShot, modest({ stages: { spa: 6 } }));
  assert.deepEqual(capped.rolls, calc(thunderbolt, modest({ stages: { spa: 6 } })).rolls);
  assert.equal(capped.notes.some((note) => note.includes("charge turn")), false);
  // Simple doubles and Contrary inverts the boost.
  assert.deepEqual(calc(electroShot, modest({ ability: { id: "simple", name: "Simple" } })).rolls, calc(thunderbolt, modest({ stages: { spa: 2 } })).rolls);
  assert.deepEqual(calc(electroShot, modest({ ability: { id: "contrary", name: "Contrary" } })).rolls, calc(thunderbolt, modest({ stages: { spa: -1 } })).rolls);
  // The target's Unaware ignores it.
  assert.deepEqual(
    calc(electroShot, modest(), { defenderState: bulky({ ability: { id: "unaware", name: "Unaware" } }) }).rolls,
    calc(thunderbolt, modest(), { defenderState: bulky({ ability: { id: "unaware", name: "Unaware" } }) }).rolls,
  );

  const beam = calc({ ...meteorBeam }, modest());
  assert.deepEqual(beam.rolls, calc({ ...meteorBeam, id: "powergem", name: "Power Gem", flags: {} }, modest({ stages: { spa: 1 } })).rolls);
});

const flameThrowerMove = { id: "flamethrower", name: "Flamethrower", type: "Fire", category: "Special", basePower: 90, target: "normal", flags: {} };
const eelektrossMega = { id: "eelektrossmega", name: "Eelektross-Mega", types: ["Electric"], baseStats: { hp: 85, atk: 145, def: 80, spa: 135, spd: 90, spe: 80 } };

test("Eelevate gives Levitate's Ground immunity unless the holder is grounded", () => {
  const eelevate = bulky({ ability: { id: "eelevate", name: "Eelevate", flags: { breakable: 1 } } });
  const blocked = calculateDamage({ attacker: garchomp, defender: eelektrossMega, move: earthquake, attackerState: jollyGarchomp, defenderState: eelevate, field: singles });
  const gravity = calculateDamage({ attacker: garchomp, defender: eelektrossMega, move: earthquake, attackerState: jollyGarchomp, defenderState: eelevate, field: createField({ format: "singles", gravity: true }) });
  const moldBreaker = calculateDamage({
    attacker: garchomp,
    defender: eelektrossMega,
    move: earthquake,
    attackerState: { ...jollyGarchomp, ability: { id: "moldbreaker", name: "Mold Breaker" } },
    defenderState: eelevate,
    field: singles,
  });

  assert.equal(blocked.maxDamage, 0);
  assert.equal(blocked.notes.includes("Eelevate"), true);
  assert.equal(gravity.typeMultiplier, 2);
  assert.ok(gravity.maxDamage > 0);
  assert.ok(moldBreaker.maxDamage > 0);
  assert.equal(isGrounded(eelektrossMega, eelevate), false);
});

const aegislash = { id: "aegislash", name: "Aegislash", baseSpecies: "Aegislash", types: ["Steel", "Ghost"], baseStats: { hp: 60, atk: 50, def: 140, spa: 50, spd: 140, spe: 60 } };
const aegislashBlade = { id: "aegislashblade", name: "Aegislash-Blade", baseSpecies: "Aegislash", types: ["Steel", "Ghost"], baseStats: { hp: 60, atk: 140, def: 50, spa: 140, spd: 50, spe: 60 } };
const shadowBall = { id: "shadowball", name: "Shadow Ball", type: "Ghost", category: "Special", basePower: 80, target: "normal", flags: { bullet: 1 } };

test("Stance Change makes Shield Forme Aegislash attack with Blade Forme stats", () => {
  const stance = { nature: "Modest", sp: { spa: 32 }, stages: {}, ability: { id: "stancechange", name: "Stance Change" }, item: null };
  const shield = calculateDamage({ attacker: aegislash, defender: garchomp, move: shadowBall, attackerState: stance, defenderState: bulky(), field: singles });
  const blade = calculateDamage({ attacker: aegislashBlade, defender: garchomp, move: shadowBall, attackerState: stance, defenderState: bulky(), field: singles });
  // Neutralizing Gas cannot suppress Stance Change.
  const gas = calculateDamage({ attacker: aegislash, defender: garchomp, move: shadowBall, attackerState: stance, defenderState: bulky({ ability: { id: "neutralizinggas", name: "Neutralizing Gas" } }), field: singles });
  const noAbility = calculateDamage({ attacker: aegislash, defender: garchomp, move: shadowBall, attackerState: { ...stance, ability: null }, defenderState: bulky(), field: singles });

  assert.deepEqual(shield.rolls, blade.rolls);
  assert.deepEqual(gas.rolls, blade.rolls);
  assert.equal(shield.notes.includes("Stance Change: attacks in Blade Forme"), true);
  assert.ok(noAbility.maxDamage < blade.minDamage);

  // Defending, Aegislash keeps the forme the set names.
  const intoShield = calculateDamage({ attacker: garchomp, defender: aegislash, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "stancechange", name: "Stance Change" } }), field: singles });
  const intoBlade = calculateDamage({ attacker: garchomp, defender: aegislashBlade, move: earthquake, attackerState: jollyGarchomp, defenderState: bulky({ ability: { id: "stancechange", name: "Stance Change" } }), field: singles });
  assert.ok(intoShield.maxDamage < intoBlade.minDamage);
});

const mimikyu = { id: "mimikyu", name: "Mimikyu", types: ["Ghost", "Fairy"], baseStats: { hp: 55, atk: 90, def: 80, spa: 50, spd: 105, spe: 96 } };
const mimikyuBusted = { ...mimikyu, id: "mimikyubusted", name: "Mimikyu-Busted" };
const disguise = { id: "disguise", name: "Disguise", flags: { breakable: 1 } };
const ironHead = { id: "ironhead", name: "Iron Head", type: "Steel", category: "Physical", basePower: 80, target: "normal", flags: { contact: 1 } };
const dualWingbeat = { id: "dualwingbeat", name: "Dual Wingbeat", type: "Flying", category: "Physical", basePower: 40, target: "normal", flags: { contact: 1 }, multihit: 2 };

test("Disguise turns Mimikyu's first hit into 1/8 max HP", () => {
  const state = bulky({ ability: disguise });
  const maxHp = calculateDamage({ attacker: garchomp, defender: mimikyu, move: ironHead, attackerState: jollyGarchomp, defenderState: state, field: singles }).defenderHp;
  const chip = Math.floor(maxHp / 8);
  const intact = calculateDamage({ attacker: garchomp, defender: mimikyu, move: ironHead, attackerState: jollyGarchomp, defenderState: state, field: singles });
  const broken = calculateDamage({ attacker: garchomp, defender: mimikyu, move: ironHead, attackerState: jollyGarchomp, defenderState: { ...state, disguiseIntact: false }, field: singles });
  const busted = calculateDamage({ attacker: garchomp, defender: mimikyuBusted, move: ironHead, attackerState: jollyGarchomp, defenderState: state, field: singles });
  const moldBreaker = calculateDamage({ attacker: garchomp, defender: mimikyu, move: ironHead, attackerState: { ...jollyGarchomp, ability: { id: "moldbreaker", name: "Mold Breaker" } }, defenderState: state, field: singles });
  const special = calculateDamage({ attacker: garchomp, defender: mimikyu, move: flameThrowerMove, attackerState: jollyGarchomp, defenderState: state, field: singles });

  assert.deepEqual([intact.minDamage, intact.maxDamage], [chip, chip]);
  assert.equal(intact.notes.includes("Disguise intact (first hit deals 1/8 max HP)"), true);
  // Only the first use is blocked, so the KO takes one more use than without Disguise.
  assert.ok(broken.minDamage > chip);
  assert.equal(intact.ko.hits, broken.ko.hits + 1);
  assert.deepEqual(busted.rolls, broken.rolls);
  assert.deepEqual(moldBreaker.rolls, broken.rolls);
  assert.deepEqual([special.minDamage, special.maxDamage], [chip, chip]);

  // A multi-hit move breaks the disguise with its first hit; the second hit lands in full.
  const wingbeat = calculateDamage({ attacker: garchomp, defender: mimikyu, move: dualWingbeat, attackerState: jollyGarchomp, defenderState: bulky({ ability: disguise }), field: singles });
  const wingbeatBroken = calculateDamage({ attacker: garchomp, defender: mimikyu, move: dualWingbeat, attackerState: jollyGarchomp, defenderState: bulky({ ability: disguise, disguiseIntact: false }), field: singles });
  const perHit = wingbeatBroken.distribution.reduce((sum, { damage, chance }) => sum + damage * chance, 0) / 2;
  const expected = chip + perHit;
  const actual = wingbeat.distribution.reduce((sum, { damage, chance }) => sum + damage * chance, 0);
  assert.ok(Math.abs(actual - expected) < 1e-9);
});

test("Parental Bond adds the child hit to a spread move only when it hits one target", () => {
  const kangaskhan = { id: "kangaskhanmega", name: "Kangaskhan-Mega", types: ["Normal"], baseStats: { hp: 105, atk: 125, def: 100, spa: 60, spd: 100, spe: 100 } };
  const rockSlide = { id: "rockslide", name: "Rock Slide", type: "Rock", category: "Physical", basePower: 75, target: "allAdjacentFoes", flags: {} };
  const state = { nature: "Adamant", sp: { atk: 32 }, stages: {}, ability: { id: "parentalbond", name: "Parental Bond" }, item: null };
  const doubles = createField({ format: "doubles" });
  const spread = calculateDamage({ attacker: kangaskhan, defender: arcanine, move: rockSlide, attackerState: state, defenderState: bulky(), field: doubles });
  const oneTarget = calculateDamage({ attacker: kangaskhan, defender: arcanine, move: rockSlide, attackerState: state, defenderState: bulky(), field: doubles, moveOptions: { singleTarget: true } });

  assert.equal(spread.notes.includes("Parental Bond"), false);
  assert.equal(spread.notes.includes("Doubles spread move"), true);
  assert.equal(oneTarget.notes.includes("Parental Bond"), true);
  assert.ok(oneTarget.minDamage > spread.maxDamage);
});

test("Future Sight, Seismic Toss and Night Shade are supported", () => {
  const hatterene = { id: "hatterene", name: "Hatterene", types: ["Psychic", "Fairy"], baseStats: { hp: 57, atk: 90, def: 95, spa: 136, spd: 103, spe: 29 } };
  const futureSight = { id: "futuresight", name: "Future Sight", type: "Psychic", category: "Special", basePower: 120, target: "normal", flags: { futuremove: 1 } };
  const seismicToss = { id: "seismictoss", name: "Seismic Toss", type: "Fighting", category: "Physical", basePower: 0, damage: "level", target: "normal", flags: {} };
  const nightShade = { id: "nightshade", name: "Night Shade", type: "Ghost", category: "Special", basePower: 0, damage: "level", target: "normal", flags: {} };
  const future = calculateDamage({ attacker: hatterene, defender: garchomp, move: futureSight, attackerState: bulky(), defenderState: bulky(), field: singles });

  assert.equal(future.supported, true);
  assert.equal(future.notes.includes("Future Sight lands two turns after it is used"), true);
  for (const move of [seismicToss, nightShade]) {
    const result = calculateDamage({ attacker: hatterene, defender: kingambit, move, attackerState: bulky(), defenderState: bulky(), field: singles });
    assert.equal(unsupportedMoveReason(move), "", move.id);
    assert.deepEqual([result.minDamage, result.maxDamage], [50, 50], move.id);
  }
});

test("Salt Cure's note gives the Champions residual damage", () => {
  const saltCure = { id: "saltcure", name: "Salt Cure", type: "Rock", category: "Physical", basePower: 40, target: "normal", flags: {} };
  const result = calculateDamage({ attacker: garchomp, defender: kingambit, move: saltCure, attackerState: jollyGarchomp, defenderState: bulky(), field: singles });
  assert.equal(result.notes.includes("Salt Cure residual: 1/16 max HP (1/8 vs Water/Steel) per turn"), true);
});

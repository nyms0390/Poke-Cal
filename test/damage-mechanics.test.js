import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage } from "../src/engine/damage.js";
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

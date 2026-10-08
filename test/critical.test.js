import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import { critRatio, isGuaranteedCritical } from "../src/engine/critical.js";
import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";
import { normalizeId } from "../src/identifiers.js";

const load = (file) => JSON.parse(readFileSync(new URL(`../public/web/${file}`, import.meta.url), "utf8"));
const pokemonCatalog = load("pokemon.json");
const abilityLookup = buildAbilityLookup(load("abilities.json"));
const itemLookup = buildItemLookup(load("items.json"));
const moveLookup = buildMoveLookup(load("moves.json"));
const species = (name) => pokemonCatalog.find((pokemon) => pokemon.name === name) ?? assert.fail(`missing ${name}`);
const move = (name) => moveLookup.get(normalizeId(name)) ?? assert.fail(`missing move ${name}`);
const ability = (name) => abilityLookup.get(normalizeId(name)) ?? assert.fail(`missing ability ${name}`);
const item = (name) => itemLookup.get(normalizeId(name)) ?? assert.fail(`missing item ${name}`);

const singles = createField({ format: "singles" });
const side = (extra = {}) => ({ nature: "Adamant", sp: { hp: 32, atk: 32 }, stages: {}, ability: null, item: null, ...extra });
const sirfetchd = species("Sirfetch’d");
const rotom = species("Rotom-Wash");

test("Leek makes Sirfetch'd's high-crit moves always critical-hit", () => {
  const leek = side({ item: item("Leek") });
  for (const name of ["Leaf Blade", "Night Slash"]) {
    assert.equal(critRatio({ move: move(name), attacker: sirfetchd, attackerState: leek }), 4);
    assert.equal(isGuaranteedCritical({ move: move(name), attacker: sirfetchd, attackerState: leek }), true, name);
  }
  // Close Combat is a normal-ratio move: Leek only reaches ratio 3 (50%).
  assert.equal(isGuaranteedCritical({ move: move("Close Combat"), attacker: sirfetchd, attackerState: leek }), false);
  // Without the Leek, Leaf Blade is just a high-crit move.
  assert.equal(isGuaranteedCritical({ move: move("Leaf Blade"), attacker: sirfetchd, attackerState: side() }), false);

  const withLeek = calculateDamage({ attacker: sirfetchd, defender: rotom, move: move("Leaf Blade"), attackerState: leek, defenderState: side(), field: singles });
  const manualCrit = calculateDamage({ attacker: sirfetchd, defender: rotom, move: move("Leaf Blade"), attackerState: leek, defenderState: side(), field: singles, critical: true });
  const noCrit = calculateDamage({ attacker: sirfetchd, defender: rotom, move: move("Leaf Blade"), attackerState: side(), defenderState: side(), field: singles });
  assert.equal(withLeek.critical, true);
  assert.deepEqual(withLeek.rolls, manualCrit.rolls);
  assert.ok(withLeek.minDamage > noCrit.maxDamage);
});

test("Leek and Lucky Punch only work for their own species", () => {
  const garchomp = species("Garchomp");
  assert.equal(critRatio({ move: move("Stone Edge"), attacker: garchomp, attackerState: side({ item: item("Leek") }) }), 2);
  assert.equal(critRatio({ move: move("Leaf Blade"), attacker: { name: "Farfetch’d-Galar", baseSpecies: "Farfetch’d" }, attackerState: side({ item: item("Leek") }) }), 4);
  assert.equal(critRatio({ move: move("Slash"), attacker: { name: "Chansey" }, attackerState: side({ item: { id: "luckypunch", name: "Lucky Punch" } }) }), 4);
});

test("Super Luck and Scope Lens stack to a guaranteed crit on high-crit moves", () => {
  const absol = species("Absol");
  const state = side({ ability: ability("Super Luck"), item: item("Scope Lens") });
  assert.equal(isGuaranteedCritical({ move: move("Night Slash"), attacker: absol, attackerState: state }), true);
  assert.equal(isGuaranteedCritical({ move: move("Sucker Punch"), attacker: absol, attackerState: state }), false);
  // Neutralizing Gas suppresses Super Luck.
  assert.equal(isGuaranteedCritical({ move: move("Night Slash"), attacker: absol, attackerState: state, suppressAttackerAbility: true }), false);
});

test("willCrit moves always critical-hit, and Battle Armor still blocks it", () => {
  const frostBreath = move("Frost Breath");
  assert.equal(isGuaranteedCritical({ move: frostBreath, attacker: rotom, attackerState: side() }), true);
  const result = calculateDamage({ attacker: rotom, defender: sirfetchd, move: frostBreath, attackerState: side(), defenderState: side(), field: singles });
  assert.equal(result.critical, true);
  const armored = calculateDamage({
    attacker: sirfetchd, defender: rotom, move: move("Leaf Blade"),
    attackerState: side({ item: item("Leek") }),
    defenderState: side({ ability: { id: "battlearmor", name: "Battle Armor" } }),
    field: singles,
  });
  assert.equal(armored.critical, false);
});

test("status moves never count as critical hits", () => {
  assert.equal(isGuaranteedCritical({ move: move("Protect"), attacker: sirfetchd, attackerState: side({ item: item("Leek") }) }), false);
});

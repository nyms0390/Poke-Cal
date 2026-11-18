import test from "node:test";
import assert from "node:assert/strict";

import { ABILITY_TYPE_IMMUNITIES, abilityTypeImmunity } from "../src/data/ability-immunities.js";
import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";

const stats = { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
const attacker = { id: "attacker", name: "Attacker", types: ["Normal"], baseStats: stats };
const defender = { id: "defender", name: "Defender", types: ["Normal"], baseStats: stats };
const side = (pokemon, ability) => ({
  pokemon,
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ability,
  item: null,
  status: "",
  currentHpFraction: 1,
  teraType: "",
});

// Lookup's note must not promise an immunity the calculator does not apply.
const ENGINE_GAPS = { eelevate: "engine does not apply Eelevate's Ground immunity yet" };

test("abilityTypeImmunity reads ids, names and catalog entries", () => {
  assert.equal(abilityTypeImmunity("Levitate"), "Ground");
  assert.equal(abilityTypeImmunity({ id: "waterabsorb", name: "Water Absorb" }), "Water");
  assert.equal(abilityTypeImmunity({ name: "Flash Fire" }), "Fire");
  assert.equal(abilityTypeImmunity("Intimidate"), "");
  assert.equal(abilityTypeImmunity(null), "");
});

for (const [abilityId, type] of Object.entries(ABILITY_TYPE_IMMUNITIES)) {
  test(`the damage engine makes ${abilityId} immune to ${type} moves`, { todo: ENGINE_GAPS[abilityId] }, () => {
    const move = { id: "testmove", name: "Test Move", type, category: "Special", basePower: 80, accuracy: 100, target: "normal", flags: {} };
    const ability = { id: abilityId, name: abilityId };
    const result = calculateDamage({
      attacker,
      defender,
      move,
      attackerState: side(attacker, { id: "runaway", name: "Run Away" }),
      defenderState: side(defender, ability),
      field: createField({ format: "singles" }),
    });
    assert.equal(result.maxDamage, 0, `${abilityId} vs ${type}`);
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";

// Reference rolls generated from @smogon/calc by scripts/dev/generate-damage-reference.mjs.
// Every case compares all 16 rolls, so modifier order and 4096-based rounding are covered,
// not just the min/max ends.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/damage-reference.json", import.meta.url), "utf8"));

function runCase(entry) {
  const defaults = createField();
  return calculateDamage({
    attacker: entry.attacker.pokemon,
    defender: entry.defender.pokemon,
    move: entry.move,
    attackerState: entry.attacker.state,
    defenderState: entry.defender.state,
    field: createField({
      format: entry.format,
      weather: entry.weather,
      terrain: entry.terrain,
      attackerSide: { ...defaults.attackerSide, ...entry.attackerSide },
      defenderSide: { ...defaults.defenderSide, ...entry.defenderSide },
    }),
    critical: entry.critical,
  });
}

test("damage reference fixture covers every modifier group", () => {
  assert.ok(fixture.cases.length >= 200);
  assert.ok(new Set(fixture.cases.map(({ group }) => group)).size >= 20);
});

const groups = new Map();
for (const entry of fixture.cases) groups.set(entry.group, [...(groups.get(entry.group) ?? []), entry]);
for (const [group, cases] of groups) {
  test(`matches @smogon/calc rolls: ${group}`, () => {
    for (const [index, entry] of cases.entries()) {
      const result = runCase(entry);
      const label = `${group} #${index + 1}: ${entry.attacker.pokemon.name} ${entry.move.name} into ${entry.defender.pokemon.name}`;
      assert.equal(result.supported, true, label);
      assert.deepEqual(result.rolls, entry.rolls, label);
    }
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { finalSpeed } from "../src/engine/speed.js";

// Final Speed generated from @smogon/calc's getFinalSpeed by scripts/dev/generate-speed-reference.mjs.
// Covers the 4096-based modifier chain (Tailwind, Speed abilities, Scarf/Iron Ball), stages,
// the post-chain paralysis drop, Quick Feet, Unburden and Protosynthesis/Quark Drive.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/speed-reference.json", import.meta.url), "utf8"));
const entity = (name) => (name ? { id: name.toLowerCase().replace(/[^a-z0-9]/g, ""), name } : null);

function runCase(entry) {
  const state = {
    pokemon: { name: entry.species, baseStats: fixture.species[entry.species] },
    nature: entry.nature,
    sp: entry.sp,
    stages: { spe: entry.stage ?? 0 },
    ability: entity(entry.ability),
    item: entity(entry.item),
    itemConsumed: Boolean(entry.itemConsumed),
    status: entry.status ?? "",
    tailwind: Boolean(entry.tailwind),
  };
  return finalSpeed(state, { weather: entry.weather ?? "", terrain: entry.terrain ?? "" });
}

test("Speed reference fixture covers every modifier group", () => {
  const groups = Object.keys(fixture.groups);
  assert.ok(groups.length >= 10);
  assert.ok(Object.values(fixture.groups).flat().length >= 4000);
});

for (const [group, cases] of Object.entries(fixture.groups)) {
  test(`matches @smogon/calc final Speed: ${group}`, () => {
    const mismatches = cases.filter((entry) => runCase(entry) !== entry.speed)
      .map((entry) => `${JSON.stringify(entry)} -> ${runCase(entry)}`);
    assert.deepEqual(mismatches.slice(0, 5), [], `${mismatches.length}/${cases.length} mismatches`);
  });
}

import test from "node:test";
import assert from "node:assert/strict";

import { buildMoveLookup } from "../src/data/catalog.js";
import { speedPresets, speedTierSummary, threatList } from "../src/data/threats.js";

const moveLookup = buildMoveLookup([
  { id: "protect", name: "Protect", category: "Status" },
  { id: "quickattack", name: "Quick Attack", category: "Physical", priority: 1 },
  { id: "tackle", name: "Tackle", category: "Physical" },
  { id: "surf", name: "Surf", category: "Special" },
  { id: "icebeam", name: "Ice Beam", category: "Special" },
  { id: "thunderbolt", name: "Thunderbolt", category: "Special" },
]);

const fixtureCatalog = [
  pokemonFixture({ id: "zeta", name: "Zeta", usagePercent: 20, nature: "Brave" }),
  pokemonFixture({ id: "alpha", name: "Alpha", usagePercent: 20, nature: "Jolly" }),
  pokemonFixture({ id: "beta", name: "Beta", usagePercent: 10, nature: "Modest" }),
];

test("builds deterministic top-usage threats from Champions defaults", () => {
  const threats = threatList(fixtureCatalog, { count: 2, moveLookup });

  assert.deepEqual(threats.map(({ pokemon }) => pokemon.name), ["Alpha", "Zeta"]);
  assert.equal(threats[0].usagePercent, 20);
  assert.equal(threats[0].nature, "Jolly");
  assert.equal(threats[0].natureShare, 70);
  assert.equal(threats[0].ability.name, "Pressure");
  assert.equal(threats[0].item.name, "Life Orb");
  assert.equal(threats[0].teraType, "Fire");
  assert.deepEqual(threats[0].moves.map(({ id }) => id), [
    "quickattack",
    "tackle",
    "surf",
    "icebeam",
  ]);
  assert.deepEqual(threats[0].spPresets.offense, { atk: 32, spa: 32 });
  assert.deepEqual(threats[0].spPresets.bulk, { hp: 0, def: 0, spd: 0 });
});

test("computes hand-checked Speed presets and marks nature-likely rows", () => {
  // Base 100: neutral values are 100 + SP + 20. At 32 SP that is 152;
  // +Spe floors 152 x 1.1 to 167, while -Spe floors 120 x 0.9 to 108.
  const fast = speedPresets({ baseSpe: 100, nature: "Jolly" });
  assert.deepEqual(
    fast.map(({ label, value, likely }) => [label, value, likely]),
    [
      ["max (+spe 32)", 167, true],
      ["max (neutral 32)", 152, false],
      ["uninvested", 120, false],
      ["min (-spe 0)", 108, false],
    ],
  );

  const slow = speedPresets({ baseSpe: 100, nature: "Brave" });
  assert.equal(slow.find(({ likely }) => likely)?.label, "min (-spe 0)");
  const neutral = speedPresets({ baseSpe: 100, nature: "Modest" });
  assert.equal(neutral.find(({ likely }) => likely)?.label, "max (neutral 32)");
});

test("summarizes strict outspeeds against each threat's likely preset", () => {
  const threats = threatList(fixtureCatalog, { moveLookup });
  const summary = speedTierSummary(fixtureCatalog[0], threats);

  // The selected Pokémon also has base 100 Speed: 167 / 152 / 120 / 108. The three likely
  // threat speeds are Alpha 167, Zeta 108, and Beta 152, so equal values never count.
  assert.deepEqual(
    summary.map(({ label, value, outspeedCount, threatCount, outspeedNames }) => ({
      label,
      value,
      outspeedCount,
      threatCount,
      outspeedNames,
    })),
    [
      {
        label: "Max (+Spe, 32 SP)",
        value: 167,
        outspeedCount: 2,
        threatCount: 3,
        outspeedNames: ["Zeta", "Beta"],
      },
      {
        label: "Fast (neutral, 32 SP)",
        value: 152,
        outspeedCount: 1,
        threatCount: 3,
        outspeedNames: ["Zeta"],
      },
      {
        label: "Uninvested (neutral, 0 SP)",
        value: 120,
        outspeedCount: 1,
        threatCount: 3,
        outspeedNames: ["Zeta"],
      },
      {
        label: "Min (−Spe, 0 SP)",
        value: 108,
        outspeedCount: 0,
        threatCount: 3,
        outspeedNames: [],
      },
    ],
  );
  assert.deepEqual(speedTierSummary(fixtureCatalog[0], []), []);
});

function pokemonFixture({ id, name, usagePercent, nature }) {
  return {
    id,
    name,
    baseStats: { hp: 80, atk: 90, def: 80, spa: 90, spd: 80, spe: 100 },
    champions: {
      usageCount: usagePercent,
      usagePercent,
      usage: {
        abilities: [{ id: "pressure", name: "Pressure", usagePercent: 80 }],
        items: [{ id: "lifeorb", name: "Life Orb", usagePercent: 75 }],
        moves: [
          { id: "protect", name: "Protect", usagePercent: 100 },
          { id: "quickattack", name: "Quick Attack", usagePercent: 90 },
          { id: "tackle", name: "Tackle", usagePercent: 80 },
          { id: "surf", name: "Surf", usagePercent: 70 },
          { id: "icebeam", name: "Ice Beam", usagePercent: 60 },
          { id: "thunderbolt", name: "Thunderbolt", usagePercent: 50 },
        ],
        natures: [
          { id: nature.toLowerCase(), name: nature, usagePercent: 70 },
          { id: "hardy", name: "Hardy", usagePercent: 30 },
        ],
        teras: [{ id: "fire", name: "Fire", usagePercent: 60 }],
      },
    },
  };
}

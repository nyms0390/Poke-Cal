import test from "node:test";
import assert from "node:assert/strict";

import { buildMoveLookup } from "../src/data/catalog.js";
import {
  mergeThreatLists,
  speedPresets,
  speedTierSummary,
  threatForPokemon,
  threatList,
} from "../src/data/threats.js";

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
  assert.equal(threats[0].teraType, "");
  assert.deepEqual(threats[0].moves.map(({ id }) => id), [
    "quickattack",
    "tackle",
    "surf",
    "icebeam",
  ]);
  assert.deepEqual(threats[0].spPresets.offense, { atk: 32, spa: 32 });
  assert.deepEqual(threats[0].spPresets.bulk, { hp: 2, def: 0, spd: 0 });
});

test("uses the most common spread for breakpoint bulk and keeps the fallback without spreads", () => {
  const withSpreads = {
    ...fixtureCatalog[0],
    champions: {
      ...fixtureCatalog[0].champions,
      usage: {
        ...fixtureCatalog[0].champions.usage,
        spreads: [
          { name: "Calm:32/0/0/0/24/4", usagePercent: 60 },
          { name: "Bold:20/0/28/0/12/4", usagePercent: 40 },
        ],
      },
    },
  };

  const commonBuild = threatForPokemon(withSpreads, { moveLookup });
  const fallback = threatForPokemon(fixtureCatalog[0], { moveLookup });

  assert.deepEqual(commonBuild.spPresets.bulk, { hp: 32, def: 0, spd: 24 });
  assert.deepEqual(fallback.spPresets.bulk, { hp: 2, def: 0, spd: 0 });
});

test("adds Mega forms alongside top-usage builder threats", () => {
  const charizard = {
    ...pokemonFixture({ id: "charizard", name: "Charizard", usagePercent: 20, nature: "Timid" }),
    baseSpecies: "Charizard",
  };
  const megaX = {
    id: "charizardmegax",
    name: "Charizard-Mega-X",
    baseSpecies: "Charizard",
    abilities: ["Tough Claws"],
    baseStats: { hp: 78, atk: 130, def: 111, spa: 130, spd: 85, spe: 100 },
    champions: { legal: true },
  };

  const threats = threatList([charizard, megaX], {
    count: 1,
    abilityLookup: new Map([["toughclaws", { id: "toughclaws", name: "Tough Claws" }]]),
    moveLookup,
    includeMegas: true,
  });

  assert.deepEqual(threats.map(({ pokemon }) => pokemon.id), ["charizard", "charizardmegax"]);
  assert.equal(threats[1].pokemon, megaX);
  assert.equal(threats[1].ability.name, "Tough Claws");
  assert.deepEqual(threats[1].moves, threats[0].moves);
});

test("builds a usable custom threat without per-Pokémon usage data", () => {
  const pokemon = {
    id: "custom",
    name: "Custom",
    abilities: ["Pressure"],
    moves: ["protect", "tackle", "surf"],
    baseStats: { hp: 80, atk: 90, def: 80, spa: 90, spd: 80, spe: 100 },
    champions: { legal: true },
  };

  const threat = threatForPokemon(pokemon, {
    abilityLookup: new Map([["pressure", { id: "pressure", name: "Pressure" }]]),
    moveLookup,
  });

  assert.equal(threat.pokemon, pokemon);
  assert.equal(threat.nature, "Hardy");
  assert.equal(threat.ability.name, "Pressure");
  assert.equal(threat.item, null);
  assert.deepEqual(threat.moves.map(({ id }) => id), ["surf", "tackle"]);
  assert.deepEqual(threat.spPresets.offense, { atk: 32, spa: 32 });
  assert.deepEqual(threat.spPresets.bulk, { hp: 2, def: 0, spd: 0 });
});

test("appends custom threats while de-duplicating Pokémon already in the popular list", () => {
  const popular = threatList(fixtureCatalog, { count: 2, moveLookup });
  const custom = [
    threatForPokemon(fixtureCatalog[0], { moveLookup }),
    threatForPokemon(fixtureCatalog[2], { moveLookup }),
  ];

  const selected = mergeThreatLists(popular, custom);

  assert.deepEqual(selected.map(({ pokemon }) => pokemon.id), ["alpha", "zeta", "beta"]);
  assert.equal(selected[0], popular[0]);
  assert.equal(selected[1], popular[1]);
  assert.equal(selected[2], custom[1]);
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

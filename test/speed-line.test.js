import test from "node:test";
import assert from "node:assert/strict";

import { nextBreakpoints, popularOpponentPool, speedTiers } from "../src/data/speed-line.js";
import { calculateSpeed } from "../src/engine/speed.js";

const userPokemon = pokemon("user", "Yourmon", 100);
const tiePokemon = pokemon("tie", "Tiemate", 100);
const slowPokemon = pokemon("slow", "Slowmon", 80);
const fastPokemon = pokemon("fast", "Fastmon", 120);

const user = {
  pokemon: userPokemon,
  nature: "Hardy",
  spe: 0,
  mods: {},
};

test("base mode uses raw base Speed, merges ties, and ignores every modifier", () => {
  const rows = speedTiers(
    { ...user, nature: "Timid", spe: 32, mods: { tailwind: true, stage: 6 } },
    [{ pokemon: tiePokemon }, { pokemon: slowPokemon }],
    {
      mode: "base",
      trickRoom: true,
      presetFilter: ["max"],
      userMods: { paralysis: true, choiceScarf: true },
      opponentMods: { tailwind: true, stage: 6 },
    },
  );

  assert.deepEqual(rows.map(({ speed }) => speed), [100, 80]);
  assert.deepEqual(rows[0].entries.map(({ name, isUser }) => [name, isUser]), [
    ["Yourmon", true],
    ["Tiemate", false],
  ]);
  assert.equal(rows[0].actsBefore, null);
  assert.equal(rows[0].stage, 0);
});

test("battle mode interleaves fixed opponent presets by calculated Speed", () => {
  const rows = speedTiers(user, [
    { pokemon: slowPokemon, likelyPresetLabel: "max (neutral 32)" },
    { pokemon: fastPokemon, likelyPresetLabel: "min (-spe 0)" },
  ], { mode: "battle" });

  assert.deepEqual(rows.map(({ speed }) => speed), [189, 172, 145, 140, 132, 126, 120, 100, 90]);
  assert.equal(
    rows.flatMap(({ entries }) => entries).find(({ name, presetLabel }) =>
      name === "Slowmon" && presetLabel === "Fast").likely,
    true,
  );
  assert.equal(
    rows.flatMap(({ entries }) => entries).find(({ name, presetLabel }) =>
      name === "Fastmon" && presetLabel === "Slow").likely,
    true,
  );
});

test("Trick Room flips actsBefore without changing descending row order", () => {
  const normal = speedTiers(user, [{ pokemon: fastPokemon }], {
    mode: "battle",
    presetFilter: ["neutral"],
  });
  const trickRoom = speedTiers(user, [{ pokemon: fastPokemon }], {
    mode: "battle",
    trickRoom: true,
    presetFilter: ["neutral"],
  });

  assert.deepEqual(normal.map(({ speed }) => speed), [140, 120]);
  assert.deepEqual(trickRoom.map(({ speed }) => speed), [140, 120]);
  assert.equal(normal[0].actsBefore, true);
  assert.equal(trickRoom[0].actsBefore, false);
});

test("battle modifiers delegate stacking and stages to calculateSpeed", () => {
  const expected = calculateSpeed({
    baseSpeed: 90,
    sp: 20,
    nature: "Hardy",
    stage: 1,
    tailwind: true,
    status: "paralysis",
    speedMultiplier: 1.5,
  }).modifiedSpeed;
  // 130 raw stat -> +1 stage 195 -> Scarf floor(292.5)=292 -> Tailwind 584 -> paralysis 292.
  assert.equal(expected, 292);

  const rows = speedTiers(
    { pokemon: pokemon("stack", "Stackmon", 90), nature: "Hardy", spe: 20 },
    [],
    {
      mode: "battle",
      userMods: { stage: 1, tailwind: true, paralysis: true, choiceScarf: true },
    },
  );
  assert.equal(rows[0].speed, expected);
  assert.equal(rows[0].stage, 1);

  for (const [stage, expectedSpeed] of [[-1, 66], [1, 150], [2, 200]]) {
    const [row] = speedTiers(user, [{ pokemon: slowPokemon }], {
      mode: "battle",
      presetFilter: ["neutral"],
      opponentMods: { stage },
    }).filter(({ entries }) => entries.some(({ name }) => name === "Slowmon"));
    assert.equal(row.speed, expectedSpeed);
    assert.equal(row.stage, stage);
  }
});

test("finds minimal SP breakpoints and falls back to a plus-Speed nature", () => {
  const reachableRows = speedTiers(user, [{ pokemon: slowPokemon }], {
    mode: "battle",
    presetFilter: ["fast"],
  });
  const [reachable] = nextBreakpoints(user, reachableRows);
  assert.equal(reachable.tierSpeed, 132);
  assert.equal(reachable.requiredSp, 13);
  assert.equal(reachable.requiresPlusNature, false);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 12 }).modifiedSpeed, 132);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 13 }).modifiedSpeed, 133);

  const natureRows = speedTiers(user, [{ pokemon: pokemon("wall", "Wall", 140) }], {
    mode: "battle",
    presetFilter: ["neutral"],
  });
  const [nature] = nextBreakpoints(user, natureRows);
  assert.deepEqual(nature, {
    tierSpeed: 160,
    names: ["Neutral Wall"],
    requiredSp: 27,
    requiresPlusNature: true,
  });
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 26, nature: "Timid" }).modifiedSpeed, 160);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 27, nature: "Timid" }).modifiedSpeed, 161);
});

test("recomputing modes and filters does not mutate manually supplied opponents", () => {
  const opponents = [{ pokemon: slowPokemon, likelyPresetLabel: "uninvested", manual: true }];
  speedTiers(user, opponents, { mode: "base" });
  speedTiers(user, opponents, { mode: "battle", presetFilter: ["max"] });
  assert.deepEqual(opponents, [
    { pokemon: slowPokemon, likelyPresetLabel: "uninvested", manual: true },
  ]);
});

test("selects popular opponents in ten-Pokémon steps and preserves manual additions", () => {
  const popular = Array.from({ length: 50 }, (_, index) => ({
    pokemon: pokemon(`popular-${index + 1}`, `Popular ${index + 1}`, 100 - index),
  }));
  const manual = [{ pokemon: pokemon("manual", "Manual", 75), manual: true }];

  for (const count of [10, 20, 30, 40, 50]) {
    const pool = popularOpponentPool(popular, manual, count);
    assert.equal(pool.length, count + 1);
    assert.equal(pool[count - 1].pokemon.id, `popular-${count}`);
    assert.equal(pool.at(-1), manual[0]);
  }
  assert.equal(popular.length, 50);
  assert.deepEqual(manual, [{ pokemon: pokemon("manual", "Manual", 75), manual: true }]);
});

function pokemon(id, name, spe) {
  return {
    id,
    name,
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe },
  };
}

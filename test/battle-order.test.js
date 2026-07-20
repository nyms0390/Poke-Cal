import test from "node:test";
import assert from "node:assert/strict";

import { compareMoveOrder, formatMovePriority } from "../src/engine/battle-order.js";
import { finalSpeed } from "../src/engine/speed.js";

const fastSide = { pokemon: { baseSpeed: 120 }, sp: { spe: 0 }, nature: "Hardy", stages: { spe: 0 } };
const slowSide = { pokemon: { baseSpeed: 60 }, sp: { spe: 0 }, nature: "Hardy", stages: { spe: 0 } };

test("formats move priority with an explicit positive sign", () => {
  assert.equal(formatMovePriority(0), "0");
  assert.equal(formatMovePriority(1), "+1");
  assert.equal(formatMovePriority(-3), "-3");
});

test("compares selected moves by priority before Speed", () => {
  const result = compareMoveOrder({
    attacker: slowSide,
    defender: fastSide,
    attackerMove: { name: "Quick Attack", priority: 1 },
    defenderMove: { name: "Thunderbolt", priority: 0 },
  });

  assert.equal(result.firstSide, "attacker");
  assert.match(result.reason, /priority/);
});

test("uses Speed inside the same priority bracket and reverses it in Trick Room", () => {
  const normal = compareMoveOrder({
    attacker: fastSide,
    defender: slowSide,
    attackerMove: { name: "Tackle", priority: 0 },
    defenderMove: { name: "Water Gun", priority: 0 },
  });
  const trickRoom = compareMoveOrder({
    attacker: fastSide,
    defender: slowSide,
    attackerMove: { name: "Tackle", priority: 0 },
    defenderMove: { name: "Water Gun", priority: 0 },
    trickRoom: true,
  });

  assert.equal(normal.firstSide, "attacker");
  assert.equal(trickRoom.firstSide, "defender");
});

test("applies Choice Scarf to final Speed and move order", () => {
  const scarfedSlowSide = {
    ...slowSide,
    item: { id: "choicescarf", name: "Choice Scarf" },
  };
  const mediumSide = { pokemon: { baseSpeed: 100 }, sp: { spe: 0 }, nature: "Hardy", stages: { spe: 0 } };
  const result = compareMoveOrder({
    attacker: scarfedSlowSide,
    defender: mediumSide,
    attackerMove: { name: "Tackle", priority: 0 },
    defenderMove: { name: "Water Gun", priority: 0 },
  });

  assert.equal(finalSpeed(slowSide), 80);
  assert.equal(finalSpeed(scarfedSlowSide), 120);
  assert.equal(finalSpeed(mediumSide), 120);
  assert.equal(result.firstSide, "tie");
});

test("does not double-count Choice Scarf and the equivalent manual speed modifier", () => {
  const scarfedSide = {
    pokemon: { baseSpeed: 100 },
    sp: { spe: 0 },
    nature: "Hardy",
    stages: { spe: 0 },
    item: { id: "choicescarf", name: "Choice Scarf" },
  };

  assert.equal(finalSpeed({ ...scarfedSide, speedMultiplier: 1 }), 180);
  assert.equal(finalSpeed({ ...scarfedSide, speedMultiplier: 1.5 }), 180);
});

test("uses field-activated Paradox Speed for move order and suppresses it with Neutralizing Gas", () => {
  const paradoxSide = {
    pokemon: { baseStats: { atk: 50, def: 50, spa: 50, spd: 50, spe: 100 } },
    sp: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    nature: "Hardy",
    stages: { spe: 0 },
    ability: { id: "protosynthesis", name: "Protosynthesis" },
  };
  const slightlyFasterSide = {
    pokemon: { baseStats: { spe: 130 } },
    sp: { spe: 0 },
    nature: "Hardy",
    stages: { spe: 0 },
  };
  const moves = {
    attackerMove: { name: "Tackle", priority: 0 },
    defenderMove: { name: "Water Gun", priority: 0 },
  };

  const inSun = compareMoveOrder({
    attacker: paradoxSide,
    defender: slightlyFasterSide,
    ...moves,
    field: { weather: "SunnyDay" },
  });
  const suppressed = compareMoveOrder({
    attacker: paradoxSide,
    defender: {
      ...slightlyFasterSide,
      ability: { id: "neutralizinggas", name: "Neutralizing Gas" },
    },
    ...moves,
    field: { weather: "SunnyDay" },
  });
  const weatherSuppressed = compareMoveOrder({
    attacker: paradoxSide,
    defender: {
      ...slightlyFasterSide,
      ability: { id: "cloudnine", name: "Cloud Nine" },
    },
    ...moves,
    field: { weather: "SunnyDay" },
  });

  assert.equal(inSun.firstSide, "attacker");
  assert.equal(inSun.attackerSpeed, 180);
  assert.equal(suppressed.firstSide, "defender");
  assert.equal(suppressed.attackerSpeed, 120);
  assert.equal(weatherSuppressed.firstSide, "defender");
  assert.equal(weatherSuppressed.attackerSpeed, 120);
});

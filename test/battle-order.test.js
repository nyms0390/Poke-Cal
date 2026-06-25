import test from "node:test";
import assert from "node:assert/strict";

import { compareMoveOrder } from "../src/battle-order.js";

const fastSide = { pokemon: { baseSpeed: 120 }, sp: { spe: 0 }, nature: "Hardy", stages: { spe: 0 } };
const slowSide = { pokemon: { baseSpeed: 60 }, sp: { spe: 0 }, nature: "Hardy", stages: { spe: 0 } };

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


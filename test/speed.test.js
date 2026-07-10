import test from "node:test";
import assert from "node:assert/strict";

import { calculateSpeed, finalSpeed } from "../src/engine/speed.js";

test("calculates level 50 Champions Speed from base stat and SP", () => {
  assert.deepEqual(
    calculateSpeed({ baseSpeed: 100, sp: 32 }),
    {
      rawSpeed: 152,
      natureSpeed: 152,
      modifiedSpeed: 152,
      effectiveOrder: 152,
    },
  );
});

test("applies nature before stat stages", () => {
  assert.equal(
    calculateSpeed({
      baseSpeed: 100,
      sp: 32,
      nature: "Jolly",
      stage: 1,
    }).modifiedSpeed,
    250,
  );
});

test("applies Tailwind and paralysis to the staged Speed", () => {
  const result = calculateSpeed({
    baseSpeed: 90,
    sp: 20,
    tailwind: true,
    status: "paralysis",
  });

  assert.equal(result.natureSpeed, 130);
  assert.equal(result.modifiedSpeed, 130);
});

test("applies optional item or ability multipliers", () => {
  assert.equal(
    calculateSpeed({
      baseSpeed: 100,
      sp: 32,
      speedMultiplier: 1.5,
    }).modifiedSpeed,
    228,
  );
});

test("represents Trick Room as reversed move order, not a changed Speed stat", () => {
  const result = calculateSpeed({
    baseSpeed: 100,
    sp: 32,
    trickRoom: true,
  });

  assert.equal(result.modifiedSpeed, 152);
  assert.equal(result.effectiveOrder, 9848);
});

test("rejects SP and stage values outside Champions limits", () => {
  assert.throws(() => calculateSpeed({ baseSpeed: 100, sp: 33 }), /SP/);
  assert.throws(() => calculateSpeed({ baseSpeed: 100, stage: 7 }), /Stage/);
});

test("calculates final Speed from the battle calculator state shape", () => {
  const side = {
    pokemon: { baseStats: { spe: 100 } },
    nature: "Jolly",
    sp: { spe: 32 },
    stages: { spe: 1 },
    item: { id: "choicescarf", name: "Choice Scarf" },
    tailwind: true,
    status: "paralysis",
  };

  assert.equal(finalSpeed(side), 375);
  assert.equal(finalSpeed({ ...side, speedMultiplier: 1.5 }), 375);
});

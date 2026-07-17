import test from "node:test";
import assert from "node:assert/strict";

import { defensiveMatchups } from "../src/engine/type-chart.js";

test("groups Abomasnow's dual-type defensive matchups", () => {
  const matchups = defensiveMatchups(["Grass", "Ice"]);

  assert.deepEqual(matchups.x4, ["Fire"]);
  assert.deepEqual(matchups.x2, ["Fighting", "Poison", "Flying", "Bug", "Rock", "Steel"]);
  assert.deepEqual(matchups.x05, ["Water", "Electric", "Grass", "Ground"]);
  assert.deepEqual(matchups.x025, []);
  assert.deepEqual(matchups.x0, []);
});

test("keeps Rotom-Wash's Levitate outside its type-only buckets", () => {
  const matchups = defensiveMatchups(["Electric", "Water"]);

  assert.deepEqual(matchups.x2, ["Grass", "Ground"]);
  assert.deepEqual(matchups.x025, ["Steel"]);
  assert.equal(matchups.x1.includes("Electric"), true);
  assert.equal(matchups.x0.includes("Ground"), false);
});

test("combines Garchomp's weakness and immunity multipliers", () => {
  const matchups = defensiveMatchups(["Dragon", "Ground"]);

  assert.deepEqual(matchups.x4, ["Ice"]);
  assert.deepEqual(matchups.x2, ["Dragon", "Fairy"]);
  assert.deepEqual(matchups.x05, ["Fire", "Poison", "Rock"]);
  assert.deepEqual(matchups.x0, ["Electric"]);
});

import test from "node:test";
import assert from "node:assert/strict";

import { koChance, koText } from "../src/engine/ko-chance.js";

test("returns a guaranteed OHKO for a roll that reaches target HP", () => {
  const result = koChance({ rolls: [100], targetHp: 100 });

  assert.deepEqual(result, [{ hits: 1, chance: 1 }]);
  assert.equal(koText(result), "guaranteed OHKO");
});

test("formats the classic 15/16 one-hit probability", () => {
  const result = koChance({ rolls: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9], targetHp: 10 });

  assert.equal(result[0].chance, 15 / 16);
  assert.equal(koText(result), "93.8% chance to OHKO");
});

test("matches brute-force convolution for three damage rolls", () => {
  const rolls = [2, 3];
  const targetHp = 8;
  const result = koChance({ rolls, targetHp, maxHits: 3 });
  const expected = [1, 2, 3].map((hits) => {
    let koCount = 0;
    let totalCount = 0;
    const visit = (sum, depth) => {
      if (depth === hits) {
        totalCount += 1;
        if (sum >= targetHp) koCount += 1;
        return;
      }
      for (const roll of rolls) visit(sum + roll, depth + 1);
    };
    visit(0, 0);
    return { hits, chance: koCount / totalCount };
  });

  assert.deepEqual(result, expected);
  assert.equal(koText(result), "50.0% chance to 3HKO");
});

test("can model multiple independent rolls per turn", () => {
  const result = koChance({ rolls: [4], targetHp: 8, hitsPerTurn: 2 });

  assert.deepEqual(result, [{ hits: 1, chance: 1 }]);
  assert.equal(koText(result), "guaranteed OHKO");
});

test("accepts a weighted full-move damage distribution", () => {
  const result = koChance({
    rollDistribution: [
      { damage: 9, chance: 0.25 },
      { damage: 10, chance: 0.75 },
    ],
    targetHp: 10,
  });

  assert.equal(result[0].chance, 0.75);
  assert.equal(koText(result), "75.0% chance to OHKO");
});

test("reports when a target is not KO'd within the configured limit", () => {
  const result = koChance({ rolls: [1], targetHp: 6, maxHits: 5 });

  assert.deepEqual(result, [1, 2, 3, 4, 5].map((hits) => ({ hits, chance: 0 })));
  assert.equal(koText(result), "not a KO within 5 hits");
});

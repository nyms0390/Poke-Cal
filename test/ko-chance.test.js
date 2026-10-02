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

test("end-of-turn recovery delays a KO and caps healing at max HP", () => {
  // 34 per hit: 100 -> 66 -> 32 -> KO without healing. With 6 HP each turn:
  // 100 -> 66 (+6) 72 -> 38 (+6) 44 -> 10 (+6) 16 -> KO on the fourth hit.
  assert.equal(koText(koChance({ rolls: [34], targetHp: 100 })), "guaranteed 3HKO");
  assert.equal(koText(koChance({ rolls: [34], targetHp: 100, recovery: { maxHp: 100, perTurn: 6 } })), "guaranteed 4HKO");
  // Healing never pushes HP above max, so 1 damage against 50 HP per turn never KOs.
  assert.equal(koText(koChance({ rolls: [1], targetHp: 100, maxHits: 3, recovery: { maxHp: 100, perTurn: 50 } })), "not a KO within 3 hits");
});

test("a pinch berry heals once after HP falls to half or less", () => {
  // 50 per hit: a 2HKO without the berry; with it 100 -> 50 (+25) 75 -> 25 -> KO on hit 3.
  assert.equal(koText(koChance({ rolls: [50], targetHp: 100 })), "guaranteed 2HKO");
  assert.equal(koText(koChance({ rolls: [50], targetHp: 100, recovery: { maxHp: 100, pinchHeal: 25 } })), "guaranteed 3HKO");
  // The berry is used once: 30 per hit goes 100 -> 70 -> 40 (+25) 65 -> 35 -> 5 -> KO on hit 5,
  // where it would be a 4HKO without the berry.
  assert.equal(koText(koChance({ rolls: [30], targetHp: 100, recovery: { maxHp: 100, pinchHeal: 25 } })), "guaranteed 5HKO");
});

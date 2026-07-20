import test from "node:test";
import assert from "node:assert/strict";

import { natureMultiplier, natureOptionLabel } from "../src/engine/natures.js";
import { totalBaseStats, calculateStat, applyStage } from "../src/engine/stats.js";

test("totals all six Pokémon base stats", () => {
  assert.equal(
    totalBaseStats({
      hp: 78,
      atk: 84,
      def: 78,
      spa: 109,
      spd: 85,
      spe: 100,
    }),
    534,
  );
});

test("HP = base + sp + 75", () => {
  assert.equal(calculateStat({ base: 35, stat: "hp", sp: 0 }), 110);
  assert.equal(calculateStat({ base: 35, stat: "hp", sp: 32 }), 142);
});

test("non-HP stats = floor((base + sp + 20) x nature) before stages", () => {
  assert.equal(calculateStat({ base: 100, stat: "atk", sp: 0, nature: "Hardy" }), 120);
  assert.equal(calculateStat({ base: 100, stat: "atk", sp: 32, nature: "Adamant" }), 167);
  assert.equal(calculateStat({ base: 100, stat: "spa", sp: 32, nature: "Adamant" }), 136);
  assert.equal(calculateStat({ base: 100, stat: "atk", sp: 32, stage: 1 }), 228);
});

test("maps named natures to stat multipliers", () => {
  assert.equal(natureMultiplier("Jolly", "spe"), 1.1);
  assert.equal(natureMultiplier("Jolly", "spa"), 0.9);
  assert.equal(natureMultiplier("Quirky", "atk"), 1);
  assert.equal(natureMultiplier("Unknown", "atk"), 1);
});

test("formats nature dropdown labels with stat effects", () => {
  assert.equal(natureOptionLabel("Adamant"), "Adamant (+Atk, -SpA)");
  assert.equal(natureOptionLabel("Jolly"), "Jolly (+Spe, -SpA)");
  assert.equal(natureOptionLabel("Hardy"), "Hardy");
});

test("sp is validated to the 0-32 range", () => {
  assert.throws(() => calculateStat({ base: 100, stat: "atk", sp: -1 }), RangeError);
  assert.throws(() => calculateStat({ base: 100, stat: "atk", sp: 33 }), RangeError);
  assert.throws(() => calculateStat({ base: 100, stat: "atk", sp: 1.5 }), RangeError);
});

test("rejects unsupported stats and out-of-range stages", () => {
  assert.throws(() => calculateStat({ base: 100, stat: "crit", sp: 0 }), RangeError);
  assert.throws(() => calculateStat({ base: 100, stat: "atk", sp: 0, stage: 7 }), RangeError);
  assert.throws(() => calculateStat({ base: 100, stat: "atk", sp: 0, stage: -7 }), RangeError);
});

test("applyStage scales by the Gen 9 stage table", () => {
  assert.equal(applyStage(120, 0), 120);
  assert.equal(applyStage(120, 1), 180); // +1 -> x1.5
  assert.equal(applyStage(120, -1), 80); // -1 -> x2/3
  assert.equal(applyStage(120, 2), 240); // +2 -> x2
  assert.equal(applyStage(120, -2), 60); // -2 -> x1/2
});

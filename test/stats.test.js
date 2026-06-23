import test from "node:test";
import assert from "node:assert/strict";

import { totalBaseStats } from "../src/stats.js";

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

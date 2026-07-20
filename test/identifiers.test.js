import test from "node:test";
import assert from "node:assert/strict";

import { normalizeId } from "../src/identifiers.js";

test("normalizes shared Showdown-style identifiers", () => {
  assert.equal(normalizeId("Thunder Punch"), "thunderpunch");
  assert.equal(normalizeId("10,000,000 Volt Thunderbolt"), "10000000voltthunderbolt");
  assert.equal(normalizeId(null), "");
});

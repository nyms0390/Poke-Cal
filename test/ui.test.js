import test from "node:test";
import assert from "node:assert/strict";

import { damagePercentColor, typeClassName } from "../src/ui.js";

test("normalizes type names for CSS badge classes", () => {
  assert.equal(typeClassName("Bug"), "type-bug");
  assert.equal(typeClassName("Mr. Mime"), "type-mr-mime");
  assert.equal(typeClassName(""), "type-unknown");
});

test("maps damage percentages from red to green", () => {
  assert.equal(damagePercentColor(0), "hsl(0 72% 56%)");
  assert.equal(damagePercentColor(50), "hsl(60 72% 56%)");
  assert.equal(damagePercentColor(100), "hsl(120 72% 56%)");
  assert.equal(damagePercentColor(-20), "hsl(0 72% 56%)");
  assert.equal(damagePercentColor(140), "hsl(120 72% 56%)");
});

test("maps damage ranges by their average percentage", () => {
  assert.equal(damagePercentColor(74.1, 87.6), "hsl(97 72% 56%)");
});

import test from "node:test";
import assert from "node:assert/strict";

import { damagePercentColor, pokemonSpriteUrls, typeClassName } from "../src/ui/components.js";

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

test("provides an animated fallback for Mega sprites missing from the Gen 5 sheet", () => {
  for (const pokemon of [
    { id: "raichumegay", name: "Raichu-Mega-Y", baseSpecies: "Raichu" },
    { id: "staraptormega", name: "Staraptor-Mega", baseSpecies: "Staraptor" },
  ]) {
    const spriteId = pokemon.name === "Raichu-Mega-Y" ? "raichu-megay" : "staraptor-mega";
    assert.deepEqual(pokemonSpriteUrls(pokemon), [
      `https://play.pokemonshowdown.com/sprites/gen5/${spriteId}.png`,
      `https://play.pokemonshowdown.com/sprites/ani/${spriteId}.gif`,
    ]);
  }
});

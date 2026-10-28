import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { showStatus } from "../src/ui/bootstrap.js";

// docs/DECISIONS.md "Avoid unnecessary secondary labels and descriptions".
test("DESIGN.md carries the secondary-labels rule", () => {
  const design = readFileSync(new URL("../DESIGN.md", import.meta.url), "utf8");
  assert.match(design, /Avoid unnecessary secondary labels and descriptions\. Let the layout do the explaining\./);
});

test("a quiet footer status keeps its text for assistive tech and hides on screen", () => {
  const attributes = new Set();
  const element = { textContent: "", toggleAttribute: (name, on) => (on ? attributes.add(name) : attributes.delete(name)) };
  showStatus(element, "358 Pokémon/forms loaded", { quiet: true });
  assert.equal(element.textContent, "358 Pokémon/forms loaded");
  assert.ok(attributes.has("data-quiet"));
  showStatus(element, "Pokémon data failed to load.");
  assert.ok(!attributes.has("data-quiet"));
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /footer > \[data-quiet\] \{[^}]*clip-path: inset\(50%\)/);
});

test("pages leave out how-to hints and restated descriptions", () => {
  const removed = {
    "index.html": ["Common build, teammates, and defensive matchups.", "Available abilities, Limitless item usage"],
    "battle.html": ["Spread moves assume multiple targets"],
    "matchups.html": ["Changes update results automatically.", "Pick a cell to list those opponents."],
    "compare.html": ["Shared across all sets.", "Counts of opponents, not win rates."],
    "teams.html": ["Separate up to 6 Pokémon with +", "Limitless does not publish SP or EV spreads"],
    "my-teams.html": ["Teams are saved in this browser only."],
    "builder.html": ["Click a Pokémon to edit its build."],
  };
  for (const [page, phrases] of Object.entries(removed)) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    for (const phrase of phrases) assert.ok(!html.includes(phrase), `${page} still says "${phrase}"`);
  }
});

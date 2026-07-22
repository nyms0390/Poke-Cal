import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  damagePercentColor,
  ensureRenderedRows,
  pokemonSpriteUrls,
  typeClassName,
} from "../src/ui/components.js";
import { rankObservedUsage } from "../src/ui/bootstrap.js";
import { createLiveUpdater } from "../src/ui/live-update.js";

test("commits each live state change before rendering exactly once", () => {
  let state = { count: 0 };
  const renders = [];
  const update = createLiveUpdater((context) => renders.push({ state, context }));

  update(() => {
    state = { count: state.count + 1 };
  }, { focusKey: "counter" });

  assert.deepEqual(state, { count: 1 });
  assert.deepEqual(renders, [{ state: { count: 1 }, context: { focusKey: "counter" } }]);
});

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

test("reuses rendered rows so a focused input is not replaced during live updates", () => {
  const focusedInput = {};
  const existingRow = { input: focusedInput };
  const container = {
    rows: [existingRow],
    replacements: 0,
    querySelectorAll() {
      return this.rows;
    },
    replaceChildren(...rows) {
      this.replacements += 1;
      this.rows = rows;
    },
  };

  const rows = ensureRenderedRows(container, ".stat-row", () => {
    throw new Error("existing rows must not be recreated");
  });

  assert.equal(container.replacements, 0);
  assert.strictEqual(rows[0], existingRow);
  assert.strictEqual(rows[0].input, focusedInput);
});

test("rebuilds reusable rows when their locale render key changes", () => {
  const container = {
    dataset: {},
    rows: [],
    replacements: 0,
    querySelectorAll() {
      return this.rows;
    },
    replaceChildren(...rows) {
      this.replacements += 1;
      this.rows = rows;
    },
  };

  const chineseRows = ensureRenderedRows(
    container,
    ".stat-row",
    () => [{ label: "攻擊" }],
    "zh-TW",
  );
  const reusedChineseRows = ensureRenderedRows(
    container,
    ".stat-row",
    () => [{ label: "must not replace" }],
    "zh-TW",
  );
  const englishRows = ensureRenderedRows(
    container,
    ".stat-row",
    () => [{ label: "Atk" }],
    "en",
  );

  assert.strictEqual(reusedChineseRows[0], chineseRows[0]);
  assert.notStrictEqual(englishRows[0], chineseRows[0]);
  assert.equal(englishRows[0].label, "Atk");
  assert.equal(container.replacements, 2);
});

test("lookup item ranking excludes catalog entries without observed Champions usage", () => {
  const entries = [
    { id: "lightball", name: "Light Ball" },
    { id: "leftovers", name: "Leftovers" },
  ];

  const ranked = rankObservedUsage(entries, [
    { id: "lightball", name: "Light Ball", usageCount: 4, usagePercent: 100 },
  ]);

  assert.deepEqual(ranked.map(({ id }) => id), ["lightball"]);
  assert.equal(ranked[0].champions.usageCount, 4);
  assert.equal(entries[0].champions, undefined);
  assert.deepEqual(
    rankObservedUsage([{ id: "stale", name: "Stale", champions: { usageCount: 99 } }]),
    [],
  );
});

test("lookup page separates battle profile from build details without a duplicate prose summary", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<section[^>]+aria-labelledby="battle-profile-heading"/);
  assert.match(html, /<section[^>]+aria-labelledby="build-details-heading"/);
  assert.doesNotMatch(html, /id="playstyle-summary"/);
  assert.doesNotMatch(html, /id="usage-source"/);
});

test("speed tier table combines each Pokémon with its set and omits the stage column", () => {
  const html = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const header = html.match(/<div class="speed-axis-header"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.deepEqual(
    [...header.matchAll(/<span>([^<]+)<\/span>/g)].map(([, label]) => label),
    ["Spe", "Pokémon / set", "Breakpoint"],
  );
  assert.doesNotMatch(header, />Preset</);
  assert.doesNotMatch(header, />Stage</);
});

test("speed tier colors keep their labels in the preset legend, not each table chip", () => {
  const html = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/speed-page.js", import.meta.url), "utf8");

  for (const label of ["Max", "Fast", "Neutral", "Slow"]) {
    assert.match(html, new RegExp(`speed-preset-dot[^>]*><\\/span>${label}<\\/label>`));
  }
  assert.doesNotMatch(source, /presetLabel\.textContent/);
});

test("speed tier rings the colored dot for the likely preset and explains the ring", () => {
  const html = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/speed-page.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(html, /speed-preset-dot speed-preset-fast speed-preset-likely/);
  assert.match(html, />Ring marks likely preset</);
  assert.match(source, /entry\.likely \? " speed-preset-likely" : ""/);
  assert.doesNotMatch(source, /●/);
  assert.match(styles, /\.speed-preset-likely\s*\{[^}]*outline:/s);
});

test("builder and speed tiers offer the same popular-threat dropdown choices", () => {
  const builderHtml = readFileSync(new URL("../builder.html", import.meta.url), "utf8");
  const speedHtml = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const optionValues = (html, id) => {
    const select = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1] ?? "";
    return [...select.matchAll(/<option value="(\d+)"[^>]*>/g)].map(([, value]) => Number(value));
  };

  assert.deepEqual(optionValues(builderHtml, "builder-threat-count"), [10, 20, 30, 40, 50]);
  assert.deepEqual(optionValues(speedHtml, "speed-popular-count"), [10, 20, 30, 40, 50]);
});

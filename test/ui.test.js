import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  damagePercentColor,
  ensureRenderedRows,
  moveCategoryIconPath,
  moveNameCell,
  pokemonSpriteUrls,
  visibleSearchResults,
  typeClassName,
} from "../src/ui/components.js";
import { rankObservedUsage } from "../src/ui/bootstrap.js";
import { restoreBuilderCardFocus } from "../src/ui/builder-focus.js";
import { createDeferredUpdater, createLiveUpdater } from "../src/ui/live-update.js";
import { expandedMoveIndexAfterClick, mostEffectiveMoveIndex } from "../src/ui/battle-results.js";

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

test("stages editor changes without committing until Apply", () => {
  const commits = [];
  const editor = createDeferredUpdater(
    { nature: "Bold", sp: { hp: 0, def: 0 } },
    (draft) => commits.push(draft),
  );

  editor.stage((draft) => ({ ...draft, nature: "Calm" }));
  editor.stage((draft) => ({ ...draft, sp: { ...draft.sp, hp: 24 } }));

  assert.deepEqual(commits, []);
  assert.deepEqual(editor.current(), { nature: "Calm", sp: { hp: 24, def: 0 } });
  assert.equal(editor.apply(), true);
  assert.deepEqual(commits, [{ nature: "Calm", sp: { hp: 24, def: 0 } }]);
  assert.equal(editor.apply(), false);
  assert.equal(commits.length, 1);
});

test("builder target spread includes stages and applies after move setup", () => {
  const html = readFileSync(new URL("../builder.html", import.meta.url), "utf8");
  const statHeader = html.match(/<div class="builder-stat-heading"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.match(
    html,
    /<button[^>]+id="builder-apply-spread"[^>]+data-i18n="builder\.applySpread"[^>]*>/,
  );
  assert.match(html, /id="builder-stats"[^>]+aria-label="Final stats"/);
  assert.match(html, /id="builder-general-bulk"/);
  assert.deepEqual(
    [...statHeader.matchAll(/<span>([^<]+)<\/span>/g)].map(([, label]) => label),
    ["Stat", "Base", "SP", "Stage", "Final"],
  );
  assert.ok(
    html.indexOf('id="builder-apply-spread"') > html.indexOf('id="builder-move-picks"'),
    "Apply spread should follow the move setup",
  );
  assert.ok(
    html.indexOf('id="builder-general-bulk"') < html.indexOf('id="bulk-points"'),
    "General bulk recommendation should precede matchup-specific bulk points",
  );
  assert.doesNotMatch(html, /aria-label="Live final stats"/);
});

test("reveals and focuses an edited builder card after it moves into a collapsed section", () => {
  const events = [];
  const section = {
    dataset: { analysisPanelKey: "bulk:coverage:covered" },
    open: false,
  };
  const control = {
    dataset: { liveKey: "bulk:charizard:sp:hp" },
    closest(selector) {
      assert.equal(selector, "details.builder-coverage-section");
      return section;
    },
    scrollIntoView(options) {
      events.push(["scroll", options]);
    },
    focus(options) {
      events.push(["focus", options]);
    },
  };
  const panel = {
    querySelectorAll(selector) {
      assert.equal(selector, "[data-live-key]");
      return [
        { dataset: { liveKey: "bulk:venusaur:sp:hp" } },
        control,
      ];
    },
  };

  restoreBuilderCardFocus(panel, "bulk:charizard:sp:hp", {
    onOpenPanel(panelKey) {
      events.push(["open", panelKey]);
    },
  });

  assert.equal(section.open, true);
  assert.deepEqual(events, [
    ["open", "bulk:coverage:covered"],
    ["scroll", { block: "center", inline: "nearest" }],
    ["focus", { preventScroll: true }],
  ]);
});

test("normalizes type names for CSS badge classes", () => {
  assert.equal(typeClassName("Bug"), "type-bug");
  assert.equal(typeClassName("Mr. Mime"), "type-mr-mime");
  assert.equal(typeClassName(""), "type-unknown");
});

test("maps damaging move categories to local Champions icons", () => {
  for (const [category, path] of [
    ["Physical", "public/icons/move-physical.png"],
    ["Special", "public/icons/move-special.png"],
    ["Status", "public/icons/move-status.png"],
  ]) {
    assert.equal(moveCategoryIconPath(category), path);
    const signature = readFileSync(new URL(`../${path}`, import.meta.url)).subarray(0, 8);
    assert.equal(signature.toString("hex"), "89504e470d0a1a0a");
  }
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

test("move name cells show the type without repeating the stable move ID", () => {
  const previousDocument = globalThis.document;
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
    }

    append(...children) {
      this.children.push(...children);
    }
  }

  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  try {
    const cell = moveNameCell({ id: "playrough", name: "Play Rough", type: "Fairy" });
    assert.equal(cell.children[0].textContent, "Play Rough");
    assert.equal(cell.children[1].children.length, 1);
    assert.equal(cell.children[1].children[0].textContent, "Fairy");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("expands capped search results when requested", () => {
  const matches = ["a", "b", "c"];
  assert.deepEqual(visibleSearchResults(matches, { limit: 2 }), {
    matches: ["a", "b"],
    canExpand: true,
  });
  assert.deepEqual(visibleSearchResults(matches, { limit: 2, expanded: true }), {
    matches,
    canExpand: false,
  });
  assert.deepEqual(visibleSearchResults(["a"], { limit: 2 }), {
    matches: ["a"],
    canExpand: false,
  });
});

test("auto-expands the highest-damage move and toggles one open move per side", () => {
  assert.equal(mostEffectiveMoveIndex([
    { supported: true, minPercent: 10, maxPercent: 90 },
    { supported: true, minPercent: 50, maxPercent: 80 },
    { supported: true, minPercent: 20, maxPercent: 55 },
  ]), 0);
  assert.equal(mostEffectiveMoveIndex([
    { supported: false, maxPercent: 0 },
    { supported: false, maxPercent: 0 },
  ]), 0);

  assert.equal(expandedMoveIndexAfterClick(1, 2), 2);
  assert.equal(expandedMoveIndexAfterClick(2, 2), null);
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

test("lookup page reserves a selected Pokémon icon and renders its sprite", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");

  assert.match(html, /id="selected-sprite" class="pokemon-card-sprite"/);
  assert.match(source, /selectedSprite/);
  assert.match(source, /pokemonSpriteUrls\(entry\)/);
});

test("lookup move table omits the Champions usage column", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");
  const table = html.match(/<table class="move-table">([\s\S]*?)<\/table>/)?.[1] ?? "";

  assert.doesNotMatch(table, />Champions<\/th>/);
  assert.doesNotMatch(source, /formatChampionsUsage\(move/);
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

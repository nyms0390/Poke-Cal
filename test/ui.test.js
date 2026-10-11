import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  attachCombobox,
  consumeQueryParam,
  damagePercentColor,
  ensureRenderedRows,
  itemLabel,
  itemSpritePosition,
  moveCategoryIconPath,
  moveNameCell,
  movePropertyCell,
  pokemonSpriteUrls,
  searchResultButton,
  searchResultFocusIndex,
  typeBadge,
  visibleSearchResults,
  typeClassName,
  typeIconPath,
} from "../src/ui/components.js";
import { rankObservedUsage, requestedPokemonStatus } from "../src/ui/bootstrap.js";
import { restoreBuilderCardFocus } from "../src/ui/builder-focus.js";
import { createDeferredUpdater, createLiveUpdater } from "../src/ui/live-update.js";
import { expandedMoveIndexAfterClick, mostEffectiveMoveIndex } from "../src/ui/battle-results.js";
import { getLocale, setLocale, tFor } from "../src/i18n.js";

test("battle status selectors include the Soaked condition", () => {
  const html = readFileSync(new URL("../battle.html", import.meta.url), "utf8");
  for (const side of ["attacker", "defender"]) {
    const select = html.match(new RegExp(`<select id="${side}-status">[\\s\\S]*?<\\/select>`))?.[0] ?? "";
    assert.ok(select, `${side} status selector exists`);
    assert.match(select, /<option value="soak">Soaked<\/option>/);
  }
});

test("builder exposes user and global threat status controls without per-threat editing", () => {
  const html = readFileSync(new URL("../builder.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/builder-page.js", import.meta.url), "utf8");
  const expectedOptions = [
    ["", "Healthy"],
    ["burn", "Burned"],
    ["poison", "Poisoned"],
    ["toxic", "Badly Poisoned"],
    ["paralysis", "Paralyzed"],
    ["sleep", "Asleep"],
    ["freeze", "Frozen"],
    ["soak", "Soaked"],
  ];

  const select = html.match(/<select id="builder-threat-status">[\s\S]*?<\/select>/)?.[0] ?? "";
  assert.ok(select, "builder-threat-status exists");
  assert.deepEqual(
    [...select.matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)]
      .map(([, value, label]) => [value, label]),
    expectedOptions,
  );
  // Your own status lives in the shared set editor, with the same options.
  const editor = readFileSync(new URL("../src/ui/set-editor.js", import.meta.url), "utf8");
  assert.match(editor, /<select id="\$\{id\("status"\)\}" data-kind="status">/);
  assert.match(source, /statusOptions/);
  const statusOptions = editor.match(/export const STATUS_OPTIONS = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.deepEqual(
    [...statusOptions.matchAll(/\["([^"]*)", "([^"]+)"\]/g)].map(([, value, label]) => [value, label]),
    expectedOptions,
  );
  assert.doesNotMatch(source, /threatSelect\("Status"/);
  assert.match(source, /applyGlobalThreatStatus\(threats, state\.threatStatus\)/);
});

test("builder exposes per-move critical-hit controls for offensive breakpoint analysis", () => {
  const html = readFileSync(new URL("../builder.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/builder-page.js", import.meta.url), "utf8");

  const components = readFileSync(new URL("../src/ui/components.js", import.meta.url), "utf8");

  const editor = readFileSync(new URL("../src/ui/set-editor.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /builder-critical-toggle/);
  assert.match(editor, /critToggleButton\(\{[\s\S]*?onToggle: \(pressed\) => edit\(\{ kind: "crit"/);
  assert.match(source, /if \(control\.kind === "crit"\)/);
  assert.match(components, /crit\.dataset\.kind = "crit"/);
  assert.match(components, /const pressed = crit\.getAttribute\("aria-pressed"\) !== "true";[\s\S]*?crit\.setAttribute\("aria-pressed", String\(pressed\)\)/);
  assert.match(source, /critical: Boolean\(setup\.critMoves\?\./);
  assert.doesNotMatch(source, /breakCritical/);
});

test("Speed tiers expose user and opponent active-ability controls and source metadata", () => {
  const html = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/speed-page.js", import.meta.url), "utf8");
  const speedLineSource = readFileSync(new URL("../src/data/speed-line.js", import.meta.url), "utf8");
  const enLocale = readFileSync(new URL("../src/locales/en.js", import.meta.url), "utf8");

  assert.match(html, /id="speed-user-item"/);
  assert.match(html, /<option value=""[^>]*>None<\/option>/);
  assert.match(html, /<option value="choicescarf">Choice Scarf<\/option>/);
  assert.match(html, /<option value="ironball">Iron Ball<\/option>/);
  assert.match(html, /id="speed-user-ability"/);
  assert.match(html, /id="speed-user-ability-active"/);
  assert.match(html, /id="speed-include-active-abilities"/);
  assert.doesNotMatch(html, /speed-user-scarf/);
  assert.doesNotMatch(source, /speed-user-scarf/);
  assert.match(source, /speedItemIdForSet/);
  assert.match(source, /speedItem/);
  assert.match(source, /speedItem: speedItemIdForSet\(initialSet\.itemId\)/);
  assert.match(source, /item: user\.item/);
  assert.match(source, /includeActiveSpeedAbilities/);
  assert.match(source, /entry\.source/);
  assert.match(source, /entry\.nature/);
  assert.match(source, /entry\.sp/);
  assert.match(source, /entry\.item/);
  assert.match(source, /entry\.ability/);
  assert.match(source, /speed\.jointUsage/);
  assert.match(source, /formatNumber/);
  assert.match(source, /entry\.presetKey/);
  assert.match(speedLineSource, /speedProfiles/);
  assert.match(enLocale, /Ring marks the most-used Limitless nature, ability, and item; Speed SP is estimated separately/);
  assert.match(enLocale, /Speed SP estimated from a same-nature Smogon ladder spread/);
  assert.match(source, /speed\.likelyProfile/);
});

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
  const editor = readFileSync(new URL("../src/ui/set-editor.js", import.meta.url), "utf8");
  const statHeader = editor.match(/<div class="set-editor-stat-heading"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";

  assert.match(
    html,
    /<button[^>]+id="builder-apply-spread"[^>]+data-i18n="builder\.applySpread"[^>]*>/,
  );
  assert.match(editor, /id="\$\{id\("stats"\)\}"[^>]+aria-label="Final stats"/);
  assert.match(html, /id="builder-general-bulk"/);
  assert.deepEqual(
    [...statHeader.matchAll(/<span>([^<]+)<\/span>/g)].map(([, label]) => label),
    ["Stat", "Base", "SP", "Stage", "Final"],
  );
  assert.ok(
    html.indexOf('id="builder-apply-spread"') > html.indexOf('id="builder-set-editor"'),
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

test("renders a type badge with a decorative icon and visible label", () => {
  const previousDocument = globalThis.document;
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = {};
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
  }

  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    const badge = typeBadge("Fire");
    assert.equal(badge.className, "type-badge type-fire");
    assert.equal(badge.children[0].tagName, "img");
    assert.equal(badge.children[0].className, "type-badge-icon");
    assert.equal(badge.children[0].src, "public/icons/types/fire.png");
    assert.equal(badge.children[0].getAttribute("alt"), "");
    assert.equal(badge.children[0].getAttribute("aria-hidden"), "true");
    assert.equal(badge.children[1].className, "type-badge-label");
    assert.equal(badge.children[1].textContent, "Fire");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("move property cells show each supported truthy flag as a localized tag", () => {
  const previousDocument = globalThis.document;
  const previousLocale = getLocale();
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
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    for (const [locale, labels] of [
      ["en", ["Contact", "Punch"]],
      ["zh-TW", ["接觸", "拳類"]],
    ]) {
      setLocale(locale, { persist: false });
      const cell = movePropertyCell({
        flags: { contact: 1, punch: true, sound: 0, recharge: 1 },
      });
      assert.equal(cell.tagName, "td");
      assert.equal(cell.className, "move-property-cell");
      assert.equal(cell.dataset.label, tFor(locale, "label.moveProperties"));
      assert.equal(cell.children[0].className, "move-property-tags");
      assert.deepEqual(cell.children[0].children.map((tag) => tag.textContent), labels);
      assert.ok(cell.children[0].children.every((tag) => tag.className === "move-property-tag"));
    }
    for (const move of [{}, { flags: { sound: 0, recharge: true } }]) {
      assert.equal(movePropertyCell(move).textContent, "—");
    }
    setLocale("en", { persist: false });
    const allFlags = {
      contact: 1, sound: 1, punch: 1, bite: 1, pulse: 1,
      slicing: 1, bullet: 1, wind: 1, dance: 1, powder: 1,
    };
    assert.deepEqual(
      movePropertyCell({ flags: allFlags }).children[0].children.map((tag) => tag.textContent),
      ["Contact", "Sound", "Punch", "Bite", "Pulse", "Slicing", "Bullet", "Wind", "Dance", "Powder"],
    );
  } finally {
    setLocale(previousLocale, { persist: false });
    globalThis.document = previousDocument;
  }
});

test("both move tables include a localized properties column and matching row cells", () => {
  for (const [page, controller, columns] of [
    ["index.html", "lookup-page.js", 8],
    ["moves.html", "moves-page.js", 7],
  ]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const source = readFileSync(new URL(`../src/ui/${controller}`, import.meta.url), "utf8");
    const table = html.match(/<table class="move-table[^"]*">([\s\S]*?)<\/table>/)?.[1] ?? "";
    assert.match(table, /<th scope="col"[\s\S]*?data-i18n="label\.moveProperties"/);
    assert.match(source, /movePropertyCell\(move\)/);
    assert.match(source, new RegExp(`cell\\.colSpan = ${columns};`));
  }
});

test("maps standard type icons to local PNG assets", () => {
  for (const type of [
    "Bug", "Dark", "Dragon", "Electric", "Fairy", "Fighting", "Fire", "Flying", "Ghost",
    "Grass", "Ground", "Ice", "Normal", "Poison", "Psychic", "Rock", "Steel", "Water",
  ]) {
    const path = `public/icons/types/${type.toLowerCase()}.png`;
    assert.equal(typeIconPath(type), path);
    const signature = readFileSync(new URL(`../${path}`, import.meta.url)).subarray(0, 8);
    assert.equal(signature.toString("hex"), "89504e470d0a1a0a");
  }

  assert.equal(typeIconPath("Unknown"), "");
  assert.equal(typeIconPath(""), "");
  assert.equal(typeIconPath("Typeless"), "");
  assert.equal(typeIconPath("Stellar"), "");
  assert.equal(typeIconPath("Not a type"), "");
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

test("keeps dynamic damage hues on meter fills and battle text on an accessible color", () => {
  const battleSource = readFileSync(new URL("../src/ui/battle-page.js", import.meta.url), "utf8");
  const builderSource = readFileSync(new URL("../src/ui/builder-page.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.doesNotMatch(battleSource, /damagePercentColor|--damage-percent-color/);
  assert.match(builderSource, /fill\.style\.background = defensive[\s\S]*?damagePercentColor/);
  assert.match(styles, /\.damage-percent \{[\s\S]*?color: var\(--ink\);/);
});

test("move name cells show the type without repeating the stable move ID", () => {
  const previousDocument = globalThis.document;
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.dataset = {};
      this.attributes = {};
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  }

  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
  };

  try {
    const cell = moveNameCell({ id: "playrough", name: "Play Rough", type: "Fairy" });
    assert.equal(cell.children[0].textContent, "Play Rough");
    assert.equal(cell.children[1].children.length, 1);
    assert.equal(cell.children[1].children[0].children[1].textContent, "Fairy");

    const lookupCell = moveNameCell(
      { id: "playrough", name: "Play Rough", type: "Fairy" },
      { showType: false },
    );
    assert.equal(lookupCell.children.length, 1);
    assert.equal(lookupCell.children[0].textContent, "Play Rough");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("positions item sprites at sheet column and row boundaries", () => {
  assert.equal(itemSpritePosition({ spritenum: 0 }), "-0px -0px");
  assert.equal(itemSpritePosition({ spritenum: 15 }), "-360px -0px");
  assert.equal(itemSpritePosition({ spritenum: 16 }), "-0px -24px");
  assert.equal(itemSpritePosition({ spritenum: 17 }), "-24px -24px");
});

test("renders a full localized item label with a decorative icon", () => {
  const previousDocument = globalThis.document;
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = {};
      this.style = {};
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
  }

  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    const label = itemLabel({ id: "leftovers", name: "Leftovers", spritenum: 1 });
    assert.equal(label.className, "item-label");
    assert.equal(label.children[0].className, "item-icon");
    assert.equal(label.children[0].getAttribute("aria-hidden"), "true");
    assert.equal(label.children[0].style.backgroundPosition, "-24px -0px");
    assert.match(label.children[0].style.backgroundImage, /itemicons-sheet\.png\?v1/);
    assert.equal(label.children[1].className, "item-label-text");
    assert.equal(label.children[1].textContent, "Leftovers");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("renders compact item labels accessibly without a visible name", () => {
  const previousDocument = globalThis.document;
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.attributes = {};
      this.style = {};
    }

    append(...children) {
      this.children.push(...children);
    }

    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }

    getAttribute(name) {
      return this.attributes[name] ?? null;
    }
  }

  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    const label = itemLabel({ id: "leftovers", name: "Leftovers", spritenum: 1 }, { showName: false });
    assert.equal(label.children.length, 1);
    assert.equal(label.children[0].className, "item-icon");
    assert.equal(label.getAttribute("aria-label"), "Leftovers");
    assert.equal(label.getAttribute("title"), "Leftovers");
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

test("search-result arrows wrap focus through the popup", () => {
  assert.equal(searchResultFocusIndex(0, 3, "ArrowDown"), 1);
  assert.equal(searchResultFocusIndex(2, 3, "ArrowDown"), 0);
  assert.equal(searchResultFocusIndex(0, 3, "ArrowUp"), 2);
  assert.equal(searchResultFocusIndex(1, 3, "ArrowUp"), 0);
  assert.equal(searchResultFocusIndex(1, 3, "Home"), 0);
  assert.equal(searchResultFocusIndex(1, 3, "End"), 2);
  assert.equal(searchResultFocusIndex(1, 0, "ArrowDown"), -1);
  assert.equal(searchResultFocusIndex(1, 3, "Escape"), -1);
});

test("pointer selection keeps the combobox input focused until the result click", () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.listeners = new Map();
    }

    append(...children) {
      this.children.push(...children);
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    dispatch(type, event = {}) {
      this.listeners.get(type)?.(event);
    }
  }

  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };
  const pikachu = { name: "Pikachu", aliases: [], baseSpecies: "Pikachu", baseSpeed: 90 };

  try {
    let pointerDownPrevented = false;
    let selected = null;
    const result = searchResultButton(pikachu, (entry) => {
      selected = entry;
    });

    result.dispatch("pointerdown", {
      preventDefault() {
        pointerDownPrevented = true;
      },
    });
    assert.equal(pointerDownPrevented, true, "pointer-down must not blur and close the popup");

    result.dispatch("click");
    assert.equal(selected, pikachu);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("combobox updates Chinese suggestions during IME composition without selecting", () => {
  class FakeTarget {
    constructor() {
      this.attributes = new Map();
      this.listeners = new Map();
      this.hidden = true;
      this.value = "";
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    dispatch(type, event = { target: this }) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    contains(target) {
      return target === this;
    }

    replaceChildren(...children) {
      this.children = children;
    }
  }

  const previousDocument = globalThis.document;
  const fakeDocument = new FakeTarget();
  const input = new FakeTarget();
  const results = new FakeTarget();
  results.id = "ime-results";
  const pikachu = { name: "Pikachu" };
  const queries = [];
  let selected = null;
  globalThis.document = fakeDocument;

  try {
    attachCombobox({
      input,
      resultsEl: results,
      getMatches: (query) => {
        queries.push(query);
        return [pikachu];
      },
      onSelect: (entry) => {
        selected = entry;
      },
      renderRow: () => new FakeTarget(),
    });

    input.value = "皮卡";
    input.dispatch("input", { target: input, isComposing: true });
    assert.deepEqual(queries, ["皮卡"], "composition text must keep suggestions updated");
    assert.equal(results.hidden, false);

    let enterPrevented = false;
    input.dispatch("keydown", {
      key: "Enter",
      keyCode: 229,
      isComposing: false,
      preventDefault() {
        enterPrevented = true;
      },
    });
    assert.equal(enterPrevented, false, "IME Enter must remain available to accept the candidate");
    assert.equal(selected, null, "IME Enter must not select a search result");

    input.value = "皮卡丘";
    input.dispatch("input", { target: input, isComposing: false });
    assert.deepEqual(queries, ["皮卡", "皮卡丘"]);
    assert.equal(results.hidden, false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("combobox preserves internal pointer and focus interactions before closing", async () => {
  class FakeTarget {
    constructor() {
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.hidden = false;
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    dispatch(type, event = { target: this }) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    focus() {
      globalThis.document.activeElement = this;
      this.dispatch("focus");
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    contains(target) {
      return target === this || target === this.inside || this.children.includes(target);
    }

    append(...children) {
      this.children.push(...children);
    }

    replaceChildren(...children) {
      this.children = children;
    }

    querySelectorAll(selector) {
      return selector === ".search-result"
        ? this.children.filter((child) => child.className === "search-result")
        : [];
    }
  }

  const previousDocument = globalThis.document;
  const fakeDocument = new FakeTarget();
  fakeDocument.createElement = () => new FakeTarget();
  const input = new FakeTarget();
  input.value = "pika";
  const results = new FakeTarget();
  results.id = "test-results";
  const insideResult = {};
  const outside = {};
  results.inside = insideResult;
  globalThis.document = fakeDocument;

  try {
    const entries = ["Pikachu", "Pikipek", "Pikachu-Mega"];
    const combobox = attachCombobox({
      input,
      resultsEl: results,
      getMatches: () => entries.slice(0, 2),
      getAllMatches: () => entries,
      resultLimit: 2,
      onSelect: () => {},
      renderRow: () => {
        const row = new FakeTarget();
        row.className = "search-result";
        return row;
      },
    });
    const settleFocus = () => new Promise((resolve) => queueMicrotask(resolve));

    results.hidden = false;
    fakeDocument.activeElement = insideResult;
    input.dispatch("focusout");
    await settleFocus();
    assert.equal(results.hidden, false, "input-to-result focus keeps the popup open");

    fakeDocument.activeElement = input;
    results.dispatch("focusout");
    await settleFocus();
    assert.equal(results.hidden, false, "result-to-input focus keeps the popup open");

    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
    fakeDocument.activeElement = insideResult;
    let escapePrevented = false;
    results.dispatch("keydown", {
      key: "Escape",
      target: insideResult,
      preventDefault() {
        escapePrevented = true;
      },
    });
    assert.equal(escapePrevented, true);
    assert.equal(fakeDocument.activeElement, input, "Escape restores focus to the input");
    assert.equal(results.hidden, true, "Escape leaves the popup hidden after focus restoration");
    assert.equal(input.attributes.get("aria-expanded"), "false");

    fakeDocument.activeElement = outside;
    input.dispatch("focusout");
    await settleFocus();
    assert.equal(results.hidden, true, "Tab or Shift+Tab outside closes the popup");

    combobox.render();
    const showAll = results.children.at(-1);
    let pointerDownPrevented = false;
    showAll.dispatch("pointerdown", {
      preventDefault() {
        pointerDownPrevented = true;
      },
    });
    assert.equal(pointerDownPrevented, true, "Show all must not blur and close the popup");

    const clickEvent = {
      target: showAll,
      composedPath: () => [showAll, results, fakeDocument],
    };
    showAll.dispatch("click", clickEvent);
    fakeDocument.dispatch("click", clickEvent);
    assert.equal(results.hidden, false, "Show all stays open after replacing the clicked button");
    assert.equal(results.children.length, entries.length);
    assert.equal(input.attributes.get("aria-expanded"), "true");

    combobox.destroy();
    assert.equal(input.listeners.get("focusout")?.size, 0);
    assert.equal(results.listeners.get("focusout")?.size, 0);
  } finally {
    globalThis.document = previousDocument;
  }
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

test("battle page shows each Pokémon name and icon together in the side heading", () => {
  const html = readFileSync(new URL("../battle.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/battle-page.js", import.meta.url), "utf8");

  for (const side of ["attacker", "defender"]) {
    assert.match(
      html,
      new RegExp(
        `<div class="battle-side-summary">\\s*<strong id="${side}-summary">—</strong>\\s*<div id="${side}-pokemon-sprite" class="battle-pokemon-sprite"></div>\\s*</div>`,
      ),
    );
    assert.match(source, new RegExp(`${side}PokemonSprite`));
  }
  assert.match(source, /pokemonSpriteElements\(state\.pokemon, \{ size: 56 \}\)/);
  assert.match(
    source,
    /function sideSummary\(state\) \{\s*return localizedName\(state\.pokemon\);\s*\}/,
  );
});

test("lookup selection clears a search query and restores the persistent catalog list", () => {
  const source = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");

  assert.match(source, /elements\.search\.value = "";\s*renderBrowseList\(\);/);
  assert.match(source, /button\.setAttribute\("aria-selected", String\(selected\)\)/);
});

test("battle and builder move-search results render type badges before category metadata", () => {
  const components = readFileSync(new URL("../src/ui/components.js", import.meta.url), "utf8");
  assert.match(
    components,
    /export function moveSearchResultRow\(move, onSelect\) \{\s*const details = document\.createDocumentFragment\(\);\s*details\.append\(typeBadge\(move\.type\), " · ", moveCategoryMark\(move\.category\)\);/,
  );
  assert.match(components, /renderRow: moveSearchResultRow/);
  for (const page of ["battle-page", "set-editor"]) {
    const source = readFileSync(new URL(`../src/ui/${page}.js`, import.meta.url), "utf8");
    assert.match(source, /moveSlotCombobox\(\{/, page);
  }
});

test("lookup move table omits the Champions usage column", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");
  const table = html.match(/<table class="move-table[^"]*">([\s\S]*?)<\/table>/)?.[1] ?? "";

  assert.doesNotMatch(table, />Champions<\/th>/);
  assert.doesNotMatch(source, /formatChampionsUsage\(move/);
});

test("lookup moves use sortable headers, a separate Type column, and no move filters", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");
  const table = html.match(/<table class="move-table[^"]*">([\s\S]*?)<\/table>/)?.[1] ?? "";

  for (const id of ["move-search", "move-type", "move-category", "move-property"]) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`));
  }
  for (const key of ["name", "type", "category", "power", "accuracy", "pp", "effect"]) {
    assert.match(table, new RegExp(`data-sort-key="${key}"`));
  }
  assert.match(source, /sortMoves/);
  assert.match(source, /aria-sort/);
  assert.match(source, /moveSort =/);
  assert.doesNotMatch(table, /<button[^>]+aria-sort/);
  assert.match(table, /data-i18n="label\.type">Type/);
  assert.match(source, /moveNameCell\(move, \{ showType: false \}\)/);
  assert.match(source, /typeCell\.append\(typeBadge\(move\.type\)\)/);
});

test("lookup keeps a compact seven-button sort toolbar on mobile", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const table = html.match(/<table class="move-table lookup-move-table sortable-move-table">([\s\S]*?)<\/table>/)?.[1] ?? "";

  assert.equal((table.match(/class="move-sort-button"/g) ?? []).length, 7);
  assert.match(styles, /\.sortable-move-table thead\s*\{[\s\S]*display: block/);
  assert.match(styles, /\.sortable-move-table thead tr\s*\{[\s\S]*flex-wrap: wrap/);
  assert.match(styles, /th\[aria-sort="ascending"\] \.move-sort-button/);
});

test("standalone moves page keeps the four combined filters and full catalog table", () => {
  const html = readFileSync(new URL("../moves.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/moves-page.js", import.meta.url), "utf8");

  assert.match(html, /<a class="active" href="\.\/moves\.html" aria-current="page">Moves<\/a>/);
  for (const id of ["move-search", "move-type", "move-category", "move-property", "move-count", "move-list"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /src\/ui\/moves-page\.js/);
  assert.match(source, /loadCatalogs/);
  assert.match(source, /filterMoves/);
  assert.match(source, /moveEffect/);
  assert.match(source, /moveNameCell/);
  assert.match(source, /onLocaleChange/);
  assert.match(html, /data-i18n-aria-label="moves\.ariaLabel"/);
  assert.match(html, /data-i18n="moves\.footer"/);
});

test("standalone moves page sorts the catalog table with the same header buttons as Lookup", () => {
  const html = readFileSync(new URL("../moves.html", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/moves-page.js", import.meta.url), "utf8");
  const table = html.match(/<table class="move-table sortable-move-table">([\s\S]*?)<\/table>/)?.[1] ?? "";

  for (const key of ["name", "category", "power", "accuracy", "pp", "effect"]) {
    assert.match(table, new RegExp(`<th scope="col" data-sort-key="${key}" aria-sort="none">`));
    assert.match(table, new RegExp(`<button class="move-sort-button" type="button" data-sort-key="${key}">`));
  }
  assert.equal((table.match(/class="move-sort-button"/g) ?? []).length, 6);
  assert.match(table, /class="move-property-heading"/);
  assert.doesNotMatch(table, /<button[^>]+aria-sort/);
  assert.match(source, /sortMoves\(filtered, moveSort\)/);
  assert.match(source, /aria-sort/);
});

test("all pages expose the Moves navigation link", () => {
  for (const page of ["index.html", "battle.html", "builder.html", "matchups.html", "speed.html", "teams.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /<a href="\.\/moves\.html">Moves<\/a>/, page);
  }
});

test("all pages place Moves in the second navigation slot", () => {
  for (const page of ["index.html", "battle.html", "builder.html", "matchups.html", "speed.html", "teams.html", "moves.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="page-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.deepEqual(
      [...nav.matchAll(/<a(?: class="active")? href="([^"]+)"(?: aria-current="page")?>([^<]+)<\/a>/g)].slice(0, 2).map(([, href, label]) => [href, label]),
      [["./index.html", "Lookup"], ["./moves.html", "Moves"]],
      page,
    );
  }
});

test("every page links Matchups right after Builder, and Matchups marks itself current", () => {
  for (const page of ["index.html", "moves.html", "battle.html", "builder.html", "matchups.html", "speed.html", "teams.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="page-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const links = [...nav.matchAll(/<a(?: class="active")? href="([^"]+)"(?: aria-current="page")?>([^<]+)<\/a>/g)]
      .map(([, href]) => href);
    assert.equal(links[links.indexOf("./builder.html") + 1], "./matchups.html", page);
  }
  const matchups = readFileSync(new URL("../matchups.html", import.meta.url), "utf8");
  assert.match(matchups, /<a class="active" href="\.\/matchups\.html" aria-current="page">Matchups<\/a>/);
  assert.match(matchups, /<script type="module" src="\.\/src\/ui\/matchups-page\.js"><\/script>/);
  const builder = readFileSync(new URL("../builder.html", import.meta.url), "utf8");
  assert.match(builder, /id="builder-matchups-link"[^>]+href="\.\/matchups\.html"/);
});

test("every page orders the nav as the tuning flow: Speed Tiers, Builder, Matchups", () => {
  for (const page of ["index.html", "moves.html", "battle.html", "builder.html", "matchups.html", "speed.html", "teams.html"]) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="page-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    const links = [...nav.matchAll(/<a(?: class="active")? href="([^"]+)"(?: aria-current="page")?>([^<]+)<\/a>/g)]
      .map(([, href]) => href);
    assert.deepEqual(links, [
      "./index.html",
      "./moves.html",
      "./battle.html",
      "./speed.html",
      "./builder.html",
      "./matchups.html",
      "./teams.html",
    ], page);
  }
});

test("matchups page exposes the overview, one filtered results list and the turn grid", () => {
  const html = readFileSync(new URL("../matchups.html", import.meta.url), "utf8");
  for (const id of ["matchups-grid", "matchups-list", "matchups-outcome-filter", "matchups-outcome-select", "matchups-opponent-search", "matchups-share-legend", "matchups-showing"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  for (const key of ["matchups.overview", "matchups.koRace", "matchups.methodText"]) {
    assert.match(html, new RegExp(`data-i18n="${key.replace(".", "\\.")}"`), key);
  }
  assert.match(html, /<caption data-i18n="matchups\.gridCaption">/);
  assert.match(html, /<select id="matchups-speed-mode">/);
  const overview = html.match(/<section id="matchups-overview"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(overview, /id="matchups-grid-view"[^>]*>/);
  assert.doesNotMatch(overview, /id="matchups-grid-view"[^>]*hidden/);
  assert.ok(overview.indexOf('id="matchups-share-note"') < overview.indexOf('id="matchups-grid-view"'));
  assert.doesNotMatch(html, /data-matchups-view/);
});

test("matchups page keeps the method behind a disclosure and the set editor in one region", () => {
  const html = readFileSync(new URL("../matchups.html", import.meta.url), "utf8");
  assert.match(html, /<section id="matchups-editor" class="matchups-editor workspace-sidebar"/);
  assert.match(html, /href="#matchups-overview"/);
  assert.match(html, /<details class="matchups-environment">/);
  assert.match(html, /<details class="matchups-method">\s*<summary data-i18n="matchups\.method">/);
  assert.match(html, /<div id="matchups-set-editor"><\/div>/);
  const editor = readFileSync(new URL("../src/ui/set-editor.js", import.meta.url), "utf8");
  assert.match(editor, /id="\$\{id\("sp-total"\)\}"[^>]+aria-live="polite"/);
  assert.match(html, /id="matchups-summary-card"/);
  assert.ok(html.indexOf("matchups.methodText") < html.indexOf('id="matchups-results"'), "method sits with the overview");
});

test("matchups page tabs pair each tab with its panel", () => {
  const html = readFileSync(new URL("../matchups.html", import.meta.url), "utf8");
  for (const tab of ["common", "beyond"]) {
    assert.match(html, new RegExp(`id="matchups-tab-${tab}"[^>]+role="tab"[^>]+aria-controls="matchups-${tab}-panel"`), tab);
    assert.match(html, new RegExp(`id="matchups-${tab}-panel"[^>]+role="tabpanel"[^>]+aria-labelledby="matchups-tab-${tab}"`), tab);
  }
  assert.match(html, /id="matchups-beyond-panel"[^>]+hidden>/);
  // Tab labels follow the Top N control, so they are set by the page, not data-i18n.
  assert.match(html, /id="matchups-tab-common-label"/);
  assert.match(html, /id="matchups-tab-beyond-label"/);
  for (const [key, en, zh] of [["matchups.topTab", "Top 100", "前 100 名"], ["matchups.beyondTab", "Beyond top 100", "前 100 名之外"]]) {
    assert.equal(tFor("en", key, { count: 100 }), en);
    assert.equal(tFor("zh-TW", key, { count: 100 }), zh);
  }
});

test("matchups page splits beyond-the-usual-sets into popular and rarely used Pokémon", () => {
  const html = readFileSync(new URL("../matchups.html", import.meta.url), "utf8");
  const section = html.match(/<section id="matchups-beyond-panel"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(section, /id="matchups-uncommon-heading"/);
  assert.ok(section.indexOf('id="matchups-uncommon"') < section.indexOf('id="matchups-niche"'), "popular before rarely used");
  assert.match(section, /<details id="matchups-niche-repeats" class="matchups-repeats" hidden>/);
  assert.match(section, /id="matchups-uncommon-status"[^>]+role="status"/);
});

test("set-editing pages name the editors and summary hosts the phone sheets use", () => {
  const read = (page) => readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  const matchups = read("matchups.html");
  assert.match(matchups, /id="matchups-editor"/);
  assert.match(matchups, /id="matchups-summary-card"/);
  const builder = read("builder.html");
  assert.match(builder, /id="builder-editor"/);
  assert.match(builder, /id="builder-summary-card"/);
  const battle = read("battle.html");
  for (const id of ["attacker-editor", "defender-editor", "field-editor", "attacker-summary-card", "defender-summary-card", "field-summary-card"]) {
    assert.match(battle, new RegExp(`id="${id}"`), id);
  }
  for (const [page, controller] of [["matchups.html", "matchups-page"], ["builder.html", "builder-page"], ["battle.html", "battle-page"], ["speed.html", "speed-page"]]) {
    const source = readFileSync(new URL(`../src/ui/${controller}.js`, import.meta.url), "utf8");
    assert.match(source, /mountSetSheet\(/, page);
    assert.match(source, /mountSheetBar\(/, page);
  }
});

test("sidebar routes use the shared Matchups workspace", () => {
  const read = (page) => readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  for (const page of ["moves.html", "builder.html", "matchups.html", "speed.html", "teams.html"]) {
    const html = read(page);
    assert.match(html, /class="workspace[ "]/, page);
    assert.match(html, /<div class="workspace-intro">\s*<h1/, page);
    assert.match(html, /class="[^"]*workspace-sidebar[^"]*"/, page);
    assert.match(html, /<div class="workspace-content">/, page);
    assert.doesNotMatch(html, /class="page-intro"/, page);
  }
  const lookup = read("index.html");
  assert.match(lookup, /class="search-panel workspace-sidebar"/);
  assert.match(lookup, /class="tool-page workspace-content"/);
});

test("battle shows both set summaries and shared field before full-width results", () => {
  const read = (page) => readFileSync(new URL(`../${page}`, import.meta.url), "utf8");
  const battle = read("battle.html");
  assert.match(battle, /class="battle-workspace[ "]/);
  assert.doesNotMatch(battle, /name="battle-side"/);
  const ordered = ["attacker-summary-card", "defender-summary-card", "field-summary-card", "damage-list"];
  for (let index = 1; index < ordered.length; index++) {
    assert.ok(battle.indexOf(`id="${ordered[index - 1]}"`) < battle.indexOf(`id="${ordered[index]}"`));
  }
  assert.match(battle, /id="attacker-editor"/);
  assert.match(battle, /id="defender-editor"/);
  assert.match(battle, /id="field-editor"/);
  assert.match(battle, /id="attacker-mobile-preview"/);
  assert.match(battle, /id="defender-mobile-preview"/);
  assert.match(battle, /id="field-conditions-preview"/);
  assert.equal((battle.match(/data-i18n="label.speed"/g) ?? []).length, 2);
  const controller = read("src/ui/battle-page.js");
  assert.match(controller, /media: "\(min-width: 0px\)"/);
  // Results columns name the direction (attacker → defender) instead of a generic side label.
  assert.match(controller, /t\("battle\.damageDirection"/);
});

test("the set sheet breakpoint matches the stylesheet", async () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const source = readFileSync(new URL("../src/ui/set-sheet.js", import.meta.url), "utf8");
  const query = source.match(/SHEET_MEDIA_QUERY = "([^"]+)"/)?.[1];
  assert.equal(query, "(max-width: 720px)");
  const sheetSection = css.slice(css.indexOf("/* ---------- Set sheet (phones) ---------- */"));
  assert.ok(sheetSection.includes(`@media ${query}`), "the sheet CSS uses the same breakpoint");
});

test("Speed Tiers reuses the shared set editor's slot layout for the set it owns", () => {
  const html = readFileSync(new URL("../speed.html", import.meta.url), "utf8");
  const panel = html.match(/aria-label="Your Speed settings">([\s\S]*?)<\/section>/)?.[1] ?? "";
  const editor = readFileSync(new URL("../src/ui/set-editor.js", import.meta.url), "utf8");

  // Same slot order and classes as mountSetEditor: Pokémon with sprite, nature, ability/item, stat row.
  const slots = ["set-editor-pokemon", "set-editor-sprite", "set-editor-field", "set-editor-fields", "set-editor-stats"];
  const positions = slots.map((slot) => panel.indexOf(`class="${slot}"`));
  assert.ok(positions.every((position) => position >= 0), `missing slot in ${JSON.stringify(positions)}`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  for (const slot of slots) assert.match(editor, new RegExp(`class="${slot}"`));
  assert.match(panel, /<span>Stat<\/span><span>Base<\/span><span>SP<\/span><span>Stage<\/span><span>Final<\/span>/);
  assert.match(panel, /class="set-editor-stat-row"[\s\S]*id="speed-sp"[\s\S]*id="speed-user-stage"[\s\S]*id="speed-user-final"/);
  assert.match(panel, /data-i18n="matchups\.yourSet">Your set</);
  assert.doesNotMatch(html, /speed-spread-controls/);
});

test("Speed Tiers shows localized ability and item names", () => {
  const source = readFileSync(new URL("../src/ui/speed-page.js", import.meta.url), "utf8");

  assert.match(source, /optionElement\(ability\.id, localizedName\(ability\)\)/);
  assert.match(source, /t\("speed\.abilityActive", \{ ability: localizedName\(user\.ability\) \}\)/);
  assert.match(source, /catalogName\(entry\.ability, catalogs\.abilityLookup\)/);
  assert.match(source, /catalogName\(entry\.item, catalogs\.itemLookup\)/);
  assert.doesNotMatch(source, /(?:ability|item)\?*\.name \?\?/);
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

test("speed tier source-backed chips collapse complete details behind native controls", () => {
  const source = readFileSync(new URL("../src/ui/speed-page.js", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(source, /const sourceBacked = entry\.source === "NCP" \|\| entry\.source === "Limitless";/);
  assert.match(source, /document\.createElement\(sourceBacked \? "button" : "span"\)/);
  assert.match(source, /chip\.type = "button"/);
  assert.match(source, /chip\.className = `speed-axis-entry\$\{entry\.isUser \? " user" : ""\}\$\{sourceBacked \? " expandable" : ""\}`/);
  assert.match(source, /chip\.setAttribute\("aria-expanded", "false"\)/);
  assert.match(source, /details\.hidden = sourceBacked/);
  assert.match(source, /chip\.addEventListener\("click"/);
  assert.match(source, /details\.hidden = expanded/);
  assert.match(source, /chip\.setAttribute\("aria-expanded", String\(!expanded\)\)/);
  assert.match(styles, /\.speed-axis-entry\.expandable/);
  assert.match(styles, /\.speed-axis-entry\.expandable\s*\{[^}]*font-family: inherit;/s);
  assert.doesNotMatch(styles, /\.speed-axis-entry\.expandable\s*\{[^}]*font:\s*inherit;/s);
  assert.match(styles, /\.speed-axis-entry\.expandable\[aria-expanded="true"\]/);
  assert.match(styles, /overflow-wrap: anywhere/);
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

test("comboboxes without a list id get unique option ids, aria-controls, and no stale options", () => {
  class FakeTarget {
    constructor() {
      this.attributes = new Map();
      this.listeners = new Map();
      this.children = [];
      this.hidden = true;
      this.id = "";
      this.value = "";
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatch(type, event = { target: this }) {
      for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(target) { return target === this || this.children.includes(target); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    focus() { globalThis.document.activeElement = this; }
    querySelectorAll(selector) {
      return selector === ".search-result" ? this.children.filter((child) => child.className === "search-result") : [];
    }
  }

  const previousDocument = globalThis.document;
  const fakeDocument = new FakeTarget();
  fakeDocument.createElement = () => new FakeTarget();
  globalThis.document = fakeDocument;
  try {
    const pickers = [0, 1].map(() => {
      const input = new FakeTarget();
      const results = new FakeTarget();
      attachCombobox({
        input,
        resultsEl: results,
        getMatches: () => ["Earthquake", "Rock Slide"],
        onSelect: () => {},
        renderRow: () => Object.assign(new FakeTarget(), { className: "search-result" }),
      });
      return { input, results };
    });
    const [first, second] = pickers;
    assert.ok(first.results.id);
    assert.notEqual(first.results.id, second.results.id);
    for (const { input, results } of pickers) {
      assert.equal(input.attributes.get("aria-controls"), results.id);
      assert.equal(input.attributes.get("aria-expanded"), "false");
    }

    first.input.value = "e";
    first.input.dispatch("input");
    second.input.value = "e";
    second.input.dispatch("input");
    const firstIds = first.results.children.map(({ id }) => id);
    const secondIds = second.results.children.map(({ id }) => id);
    assert.equal(firstIds.length, 2);
    assert.equal(new Set([...firstIds, ...secondIds]).size, 4, "option ids are unique across pickers");
    assert.equal(first.input.attributes.get("aria-expanded"), "true");

    first.input.dispatch("keydown", { key: "ArrowDown", preventDefault() {} });
    assert.equal(first.input.attributes.get("aria-activedescendant"), firstIds[0]);
    first.input.dispatch("keydown", { key: "Escape", preventDefault() {} });
    assert.equal(first.results.hidden, true);
    assert.equal(first.results.children.length, 0, "a closed list keeps no stale options");
    assert.equal(first.input.attributes.has("aria-activedescendant"), false);
    assert.equal(first.input.attributes.get("aria-expanded"), "false");
  } finally {
    globalThis.document = previousDocument;
  }
});

test("a ?pokemon= hand-off is consumed once and an unknown id is reported, not ignored", () => {
  const previous = { location: globalThis.location, history: globalThis.history };
  const replaced = [];
  globalThis.location = {
    href: "http://127.0.0.1:4173/builder.html?pokemon=amoonguss&tab=break#bulk",
    search: "?pokemon=amoonguss&tab=break",
  };
  globalThis.history = { state: null, replaceState: (_state, _title, url) => replaced.push(url) };
  try {
    assert.equal(consumeQueryParam("pokemon"), "amoonguss");
    assert.deepEqual(replaced, ["/builder.html?tab=break#bulk"]);
    globalThis.location = { href: "http://127.0.0.1:4173/builder.html", search: "" };
    assert.equal(consumeQueryParam("pokemon"), null);
    assert.equal(replaced.length, 1, "no history update without the parameter");
  } finally {
    globalThis.location = previous.location;
    globalThis.history = previous.history;
  }

  const catalogs = { pokemon: { length: 358 }, abilities: { length: 317 }, moves: { length: 515 } };
  const locale = getLocale();
  try {
    setLocale("en", { persist: false });
    assert.equal(requestedPokemonStatus(catalogs, "amoonguss"), "No Champions-legal Pokémon matches “amoonguss”.");
    assert.equal(requestedPokemonStatus(catalogs), tFor("en", "catalog.loaded", { pokemon: 358, abilities: 317, moves: 515 }));
    setLocale("zh-TW", { persist: false });
    assert.equal(requestedPokemonStatus(catalogs, "amoonguss"), "Champions 圖鑑中沒有符合「amoonguss」的寶可夢。");
  } finally {
    setLocale(locale, { persist: false });
  }
});

test("Builder and Matchups edit the set with the same shared editor", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const editor = read("src/ui/set-editor.js");
  for (const [page, controller, prefix] of [["builder.html", "builder-page", "builder"], ["matchups.html", "matchups-page", "matchups"]]) {
    const html = read(page);
    assert.match(html, new RegExp(`<section id="${prefix}-editor"[^>]+aria-labelledby="${prefix}-set-heading"`), page);
    assert.match(html, new RegExp(`<div id="${prefix}-set-editor"></div>`), page);
    const source = read(`src/ui/${controller}.js`);
    assert.match(source, new RegExp(`mountSetEditor\\(document\\.querySelector\\("#${prefix}-set-editor"\\), \\{\\s*prefix: "${prefix}"`), controller);
    assert.doesNotMatch(source, /moveSlotCombobox|critToggleButton/, controller);
  }
  // Sprite beside the search, no nature summary beside the heading, Stat/Base/SP/Stage/Final,
  // and each move slot led by its type mark (no slot number) with crit and condition controls.
  assert.match(editor, /class="set-editor-sprite"/);
  assert.doesNotMatch(editor, /builder\.summary/);
  assert.match(editor, /<span>Stat<\/span><span>Base<\/span><span>SP<\/span><span>Stage<\/span><span>Final<\/span>/);
  assert.match(editor, /row\.append\(icon, combobox\.element, crit\)/);
  assert.match(editor, /moveConditionSelect\(descriptor/);
});

test("Battle set cards and the shared set editor mark moves with the same round type icon", () => {
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.match(read("src/ui/components.js"), /export function moveTypeIcon\(move/);
  assert.match(read("src/ui/battle-page.js"), /chip\.append\(moveTypeIcon\(move, \{ className: "battle-set-move-type" \}\), localizedName\(move\)\)/);
  assert.match(read("src/ui/set-editor.js"), /const icon = moveTypeIcon\(selected\)/);
  // The Battle edit-set move slots lead with the type mark instead of "Move 1"…"Move 4".
  const battle = read("src/ui/battle-page.js");
  assert.match(battle, /const typeIcon = moveTypeIcon\(selectedMove\)/);
  assert.match(battle, /moveTypeIcon\(picked, \{ icon: typeIcon \}\)/);
  assert.match(battle, /row\.append\(typeIcon, combobox\.element\)/);
  assert.doesNotMatch(battle, /damage-move-number/);
});

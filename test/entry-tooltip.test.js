import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { entryDescription } from "../src/data/catalog.js";
import { abilityTerm, attachEntryTooltip, itemTerm } from "../src/ui/entry-tooltip.js";

test("entryDescription prefers the Champions effect text as a whole", () => {
  assert.equal(entryDescription({ desc: "Long.", shortDesc: "Short." }), "Long.");
  assert.equal(entryDescription({ shortDesc: "Short." }), "Short.");
  assert.equal(
    entryDescription({ desc: "Old long.", shortDesc: "Old.", champions: { desc: "New long.", shortDesc: "New." } }),
    "New long.",
  );
  // Unseen Fist: Champions has only a short description, and the older long one no longer applies.
  assert.equal(
    entryDescription({ desc: "Old long.", shortDesc: "Old.", champions: { legal: true, shortDesc: "New." } }),
    "New.",
  );
  assert.equal(entryDescription({ desc: "Long.", champions: { legal: true, usageCount: 3 } }), "Long.");
  assert.equal(entryDescription(null), "");
  assert.equal(entryDescription({ id: "unknown", name: "Unknown" }), "");
});

test("entryDescription reads the committed Champions overrides", () => {
  const abilities = JSON.parse(readFileSync(new URL("../public/web/abilities.json", import.meta.url)));
  const healer = abilities.find((ability) => ability.id === "healer");
  assert.match(entryDescription(healer), /50% chance/);
});

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.listeners = {};
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

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

function withFakeDocument(run) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  };
  try {
    run();
  } finally {
    globalThis.document = previousDocument;
  }
}

test("ability and item terms are buttons only when there is effect text", () => {
  withFakeDocument(() => {
    const term = abilityTerm({ id: "intimidate", name: "Intimidate", shortDesc: "Lowers Attack." });
    assert.equal(term.tagName, "button");
    assert.equal(term.type, "button");
    assert.equal(term.className, "entry-term");
    assert.equal(term.dataset.entryTip, "term");
    assert.equal(term.children[0].textContent, "Intimidate");

    const item = itemTerm({ id: "leftovers", name: "Leftovers", spritenum: 242, shortDesc: "Heals." });
    assert.equal(item.tagName, "button");
    assert.equal(item.children[0].className, "item-label");

    const plain = abilityTerm({ id: "mystery", name: "Mystery" });
    assert.equal(plain.nodeType, 3);
    assert.equal(plain.textContent, "Mystery");
    assert.equal(itemTerm({ id: "odd", name: "Odd", spritenum: 0 }).className, "item-label");
  });
});

test("attachEntryTooltip marks a select as a details anchor", () => {
  withFakeDocument(() => {
    const select = new FakeElement("select");
    assert.equal(attachEntryTooltip(select, () => null), select);
    assert.equal(select.dataset.entryTip, "select");
    assert.equal(typeof select.listeners.change, "function");
  });
});

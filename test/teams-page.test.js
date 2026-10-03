import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { tFor } from "../src/i18n.js";

// A small DOM fixture runs the real page controller without an extra test dependency.
async function page(total, { failure = false } = {}) {
  const source = readFileSync(new URL("../src/ui/teams-page.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from "[^"]+";\n/g, "")
    .replace("initialize();", "globalThis.ready = initialize();");
  const document = { activeElement: null };
  const node = (tagName = "div") => ({
    tagName, children: [], textContent: "", hidden: false, disabled: false, open: false,
    classList: { add() {} }, attributes: {}, listeners: {},
    get firstElementChild() { return this.children[0]; },
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [
        ...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag),
      ]);
    },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    focus() { document.activeElement = this; },
    click() { if (!this.disabled && !this.hidden) this.listeners.click?.(); },
  });
  const elements = Object.fromEntries(["source", "count", "archive", "status", "more"].map((key) => [key, node()]));
  elements.more.hidden = true;
  elements.more.disabled = true;
  document.querySelector = (selector) => elements[selector.replace(/^#teams-/, "").replace(/^#/, "")];
  document.createElement = node;
  let locale = "en";
  let changeLocale;
  const context = {
    document, console: { error() {} }, Intl,
    initI18n() {}, applyDocumentTranslations() {}, getLocale: () => locale,
    t: (key, params) => tFor(locale, key, params),
    onLocaleChange: (callback) => { changeLocale = callback; },
    loadCatalogs: async () => ({}),
    loadLimitlessTeamArchive: async () => {
      if (failure) throw new Error("offline");
      return { format: "M-C", tournaments: Array.from({ length: total }, (_, index) => ({
        name: `Tournament ${index}`, date: "2026-10-02", players: 40, topCut: [], url: "https://example.test", phases: [],
      })) };
    },
    loadWithRecovery: async (load, { onFailure }) => {
      try { return await load(); } catch (error) { onFailure(error); throw error; }
    },
  };
  runInNewContext(source, context);
  await context.ready;
  return { elements, document, locale(next) { locale = next; changeLocale(); } };
}

test("teams start at ten and append batches without replacing disclosures or focus", async () => {
  const { elements, document } = await page(25);
  assert.equal(elements.archive.children.length, 10);
  assert.equal(elements.count.textContent, "10 / 25 tournaments");
  assert.equal(elements.more.textContent, "Show 10 more");
  const first = elements.archive.children[0];
  first.open = true;
  elements.more.focus();
  elements.more.click();
  assert.equal(elements.archive.children.length, 20);
  assert.equal(elements.archive.children[0], first);
  assert.equal(first.open, true);
  assert.equal(document.activeElement, elements.more);
  assert.equal(elements.more.textContent, "Show 5 more");
  elements.more.click();
  assert.equal(elements.archive.children.length, 25);
  assert.equal(elements.count.textContent, "25 / 25 tournaments");
  assert.equal(elements.more.disabled, true);
  assert.equal(document.activeElement, elements.archive.children[20].firstElementChild);
  elements.more.click();
  assert.equal(elements.archive.children.length, 25);
});

test("locale changes keep the expanded count and localize the next batch", async () => {
  const view = await page(25);
  view.elements.more.click();
  view.elements.archive.children[0].open = true;
  view.locale("zh-TW");
  assert.equal(view.elements.archive.children.length, 20);
  assert.equal(view.elements.count.textContent, "20 / 25 場賽事");
  assert.equal(view.elements.more.textContent, "再顯示 5 場");
  assert.equal(view.elements.archive.children[0].open, true);
  for (const card of view.elements.archive.children) {
    assert.match(card.firstElementChild.firstElementChild.children[1].textContent, /40 位選手/);
  }
  view.locale("en");
  assert.equal(view.elements.archive.children.length, 20);
  assert.equal(view.elements.archive.children[0].open, true);
  for (const card of view.elements.archive.children) {
    assert.match(card.firstElementChild.firstElementChild.children[1].textContent, /40 players/);
  }
});

test("short, empty, and failed archives do not offer expansion", async () => {
  for (const total of [0, 3, 10]) {
    const { elements } = await page(total);
    assert.equal(elements.more.hidden, true);
    assert.equal(elements.more.disabled, true);
    assert.equal(elements.count.textContent, `${total} / ${total} tournaments`);
    if (total === 0) assert.equal(elements.archive.children[0].textContent, tFor("en", "teams.noTournaments"));
  }
  const { elements } = await page(25, { failure: true });
  assert.equal(elements.more.hidden, true);
  assert.equal(elements.more.disabled, true);
  assert.equal(elements.archive.children[0].textContent, tFor("en", "teams.archiveError"));
});

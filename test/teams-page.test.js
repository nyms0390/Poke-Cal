import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { tFor } from "../src/i18n.js";

// A small DOM fixture runs the real page controller without an extra test dependency.
async function page(total, { failure = false, topCut = 0 } = {}) {
  const source = readFileSync(new URL("../src/ui/teams-page.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from "[^"]+";\n/g, "")
    .replace("initialize();", "globalThis.ready = initialize();");
  const document = { activeElement: null };
  const node = (tagName = "div") => ({
    tagName, children: [], textContent: "", hidden: false, disabled: false, open: false, dataset: {},
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
    catalogLoadedStatus: ({ pokemon, abilities, moves }) =>
      tFor(locale, "catalog.loaded", { pokemon: pokemon.length, abilities: abilities.length, moves: moves.length }),
    loadCatalogs: async ({ onStatus, onLoaded }) => {
      // Catalogs finish after the archive has already settled, as on a slow connection.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const data = { pokemon: { length: 358 }, abilities: { length: 2 }, moves: { length: 3 } };
      onStatus?.(tFor(locale, "catalog.loaded", { pokemon: 358, abilities: 2, moves: 3 }), "loaded");
      onLoaded?.(data);
      return data;
    },
    loadLimitlessTeamArchive: async () => {
      if (failure) throw new Error("offline");
      return { format: "M-C", tournaments: Array.from({ length: total }, (_, index) => ({
        name: `Tournament ${index}`, date: "2026-10-02", players: 40, url: "https://example.test", phases: [],
        topCut: Array.from({ length: topCut }, (_, place) => ({
          placing: place + 1, playerName: `Player ${place}`, pokemon: [], url: "https://example.test/team",
        })),
      })) };
    },
    loadWithRecovery: async (load, { onFailure }) => {
      try { return await load(); } catch (error) { onFailure(error); throw error; }
    },
  };
  runInNewContext(source, context);
  await context.ready;
  await new Promise((resolve) => setTimeout(resolve, 10));
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

test("tournament and team cards build their content only when first opened", async () => {
  const view = await page(3, { topCut: 2 });
  const openCard = (details) => {
    details.firstElementChild.listeners.click();
    details.open = true;
    return details;
  };
  const tournament = view.elements.archive.children[0];
  assert.equal(tournament.children.length, 1, "only the summary is rendered up front");
  openCard(tournament);
  assert.equal(tournament.children.length, 2);
  const teams = tournament.children[1].children[1].children;
  assert.equal(teams.length, 2);
  assert.equal(teams[1].children.length, 1);
  openCard(teams[1]);
  assert.equal(teams[1].children.length, 2);
  tournament.firstElementChild.listeners.click();
  assert.equal(tournament.children.length, 2, "content is built once");

  view.locale("zh-TW");
  const [relocalized] = view.elements.archive.children;
  assert.notEqual(relocalized, tournament);
  assert.equal(relocalized.open, true);
  const relocalizedTeams = relocalized.children[1].children[1].children;
  assert.equal(relocalizedTeams[0].open, false);
  assert.equal(relocalizedTeams[1].open, true);
  assert.equal(relocalizedTeams[1].children.length, 2);
  assert.equal(view.elements.archive.children[1].children.length, 1);
});

test("the status line keeps an archive failure and follows the language", async () => {
  const failed = await page(25, { failure: true });
  assert.equal(failed.elements.status.textContent, tFor("en", "teams.loadError"));
  failed.locale("zh-TW");
  assert.equal(failed.elements.status.textContent, tFor("zh-TW", "teams.loadError"));
  assert.equal(failed.elements.source.textContent, tFor("zh-TW", "teams.sourceError"));
  assert.equal(failed.elements.archive.children[0].textContent, tFor("zh-TW", "teams.archiveError"));

  const loaded = await page(3);
  const counts = { pokemon: 358, abilities: 2, moves: 3 };
  assert.equal(loaded.elements.status.textContent, tFor("en", "catalog.loaded", counts));
  loaded.locale("zh-TW");
  assert.equal(loaded.elements.status.textContent, tFor("zh-TW", "catalog.loaded", counts));
  loaded.locale("en");
  assert.equal(loaded.elements.status.textContent, tFor("en", "catalog.loaded", counts));
});

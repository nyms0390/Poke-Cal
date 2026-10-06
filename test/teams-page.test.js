import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as teamSearch from "../src/data/team-search.js";
import { localizedName, tFor, toTraditionalChinese } from "../src/i18n.js";

// A small DOM fixture runs the real page controller without an extra test dependency.
async function page(total, { failure = false, topCut = 0, tournaments } = {}) {
  const source = readFileSync(new URL("../src/ui/teams-page.js", import.meta.url), "utf8")
    .replace(/import[\s\S]*?from "[^"]+";\n/g, "")
    .replace("initialize();", "globalThis.ready = initialize();");
  const document = { activeElement: null };
  const node = (tagName = "div") => ({
    tagName, children: [], textContent: "", hidden: false, disabled: false, open: false, dataset: {}, value: "",
    classList: { add() {} }, attributes: {}, listeners: {},
    get firstElementChild() { return this.children[0]; },
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [
        ...(child.tagName === tag || (tag.startsWith(".") && child.className?.split(" ").includes(tag.slice(1))) ? [child] : []), ...child.querySelectorAll(tag),
      ]);
    },
    contains(target) { return target === this || this.children.some((child) => child.contains(target)); },
    closest(selector) { return selector.startsWith(".") && this.className?.split(" ").includes(selector.slice(1)) ? this : null; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    removeAttribute(name) { delete this.attributes[name]; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    focus() { document.activeElement = this; this.listeners.focus?.(); },
    click() { if (!this.disabled && !this.hidden) this.listeners.click?.(); },
  });
  const elements = Object.fromEntries(["source", "count", "archive", "status", "more", "search-form", "regulation", "query", "suggestions", "search-status", "search-submit", "reset"].map((key) => [key, node()]));
  elements.suggestions.hidden = true;
  elements.more.hidden = true;
  elements.more.disabled = true;
  document.querySelector = (selector) => elements[selector.replace(/^#teams-/, "").replace(/^#/, "")];
  document.createElement = node;
  document.listeners = {};
  document.addEventListener = (name, listener) => { document.listeners[name] = listener; };
  let locale = "en";
  let changeLocale;
  const context = {
    document, console: { error() {} }, Intl, queueMicrotask, ...teamSearch, toTraditionalChinese,
    translateSubtree() {},
    optionElement(value, text) { const option = node("option"); option.value = value; option.textContent = text; return option; },
    normalizeId: (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    pokemonSpriteElements: () => [],
    initI18n() {}, applyDocumentTranslations() {}, getLocale: () => locale,
    localizedName: (entry) => localizedName(entry, locale),
    t: (key, params) => tFor(locale, key, params),
    onLocaleChange: (callback) => { changeLocale = callback; },
    catalogLoadedStatus: ({ pokemon, abilities, moves }) =>
      tFor(locale, "catalog.loaded", { pokemon: pokemon.length, abilities: abilities.length, moves: moves.length }),
    loadCatalogs: async ({ onStatus, onLoaded }) => {
      // Catalogs finish after the archive has already settled, as on a slow connection.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const namedPokemon = [
        { id: "incineroar", name: "Incineroar", aliases: ["熾焰咆哮虎"] },
        { id: "rillaboom", name: "Rillaboom", aliases: ["轟擂金剛猩"] },
      ];
      const data = {
        pokemon: Array.from({ length: 358 }, (_, i) => namedPokemon[i] ?? { id: `fixture${i}`, name: `Fixture ${i}` }),
        abilities: { length: 2 }, moves: { length: 3 },
      };
      onStatus?.(tFor(locale, "catalog.loaded", { pokemon: 358, abilities: 2, moves: 3 }), "loaded");
      onLoaded?.(data);
      return data;
    },
    loadLimitlessTeamArchive: async () => {
      if (failure) throw new Error("offline");
      return { format: "M-C", tournaments: tournaments ?? Array.from({ length: total }, (_, index) => ({
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
  const components = readFileSync(new URL("../src/ui/components.js", import.meta.url), "utf8")
    .replace(/import[^;]+;\n/g, "").replace(/export /g, "");
  runInNewContext(components, context);
  context.pokemonSpriteElements = () => [];
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

const searchTournaments = Array.from({ length: 12 }, (_, i) => ({
  id: `event-${i}`, name: `Tournament ${i}`, date: "2026-10-02", format: i === 0 ? "M-B" : "M-C",
  topCut: [
    { playerName: "Only Incineroar", pokemon: [{ id: "incineroar", name: "Incineroar" }], url: "https://example.test/team" },
    ...(i === 11 || i === 0 ? [{ playerName: "Both Pokémon", pokemon: [{ id: "incineroar", name: "Incineroar" }, { id: "rillaboom", name: "Rillaboom" }], url: "https://example.test/team" }] : []),
  ],
}));
const submit = (view, query) => {
  view.elements.query.value = query;
  view.elements["search-form"].listeners.submit({ preventDefault() {} });
};
test("submitted search finds later tournaments and hides unrelated teams, with localized result status", async () => {
  const view = await page(0, { tournaments: searchTournaments });
  assert.equal(view.elements.regulation.value, "M-C");
  assert.deepEqual(view.elements.regulation.children.map((option) => option.value), ["M-B", "M-C"]);
  view.elements.more.click();
  submit(view, "Incineroar + Rillaboom");
  assert.equal(view.elements.archive.children.length, 1);
  assert.match(view.elements.archive.children[0].firstElementChild.firstElementChild.children[0].textContent, /Tournament 11/);
  const tournament = view.elements.archive.children[0];
  tournament.firstElementChild.listeners.click();
  assert.equal(tournament.children[1].children[1].children.length, 1);
  assert.equal(view.elements.count.textContent, "1 / 1 tournament");
  assert.match(view.elements["search-status"].textContent, /1 matching team/);
  view.locale("zh-TW");
  assert.match(view.elements["search-status"].textContent, /1 組符合/);
  assert.equal(view.elements.query.value, "Incineroar + Rillaboom");
});
test("regulation switches and reset recompute submitted filters and reset pagination", async () => {
  const view = await page(0, { tournaments: searchTournaments });
  submit(view, "熾焰咆哮虎 + 轟擂金剛猩");
  view.elements.regulation.value = "M-B";
  view.elements.regulation.listeners.change();
  assert.equal(view.elements.archive.children.length, 1);
  assert.match(view.elements.archive.children[0].firstElementChild.firstElementChild.children[0].textContent, /Tournament 0/);
  view.elements.reset.click();
  assert.equal(view.elements.query.value, "");
  assert.equal(view.elements.regulation.value, "M-B");
  assert.equal(view.document.activeElement, view.elements.query);
  view.elements.regulation.value = "M-C";
  view.elements.regulation.listeners.change();
  assert.equal(view.elements.archive.children.length, 10);
  assert.equal(view.elements.count.textContent, "10 / 11 tournaments");
});
test("invalid input clears results and provides nearby recovery without broadening", async () => {
  const view = await page(0, { tournaments: searchTournaments });
  submit(view, "Incineroar + Missing");
  assert.equal(view.elements.query.attributes["aria-invalid"], "true");
  assert.match(view.elements["search-status"].textContent, /Missing/);
  assert.equal(view.elements.archive.children.length, 0);
  assert.equal(view.document.activeElement, view.elements.query);
  view.elements.reset.click();
  assert.equal(view.elements.query.attributes["aria-invalid"], undefined);
  assert.equal(view.elements.archive.children.length, 10);
});

test("autocomplete completes each Pokémon without submitting, then Enter searches the completed team", async () => {
  const view = await page(0, { tournaments: searchTournaments });
  const { query, suggestions } = view.elements;
  query.value = "inci";
  query.listeners.input();
  assert.equal(suggestions.hidden, false);
  assert.equal(query.getAttribute("aria-expanded"), "true");
  assert.equal(suggestions.children[0].children[0].textContent, "Incineroar");
  suggestions.children[0].click();
  assert.equal(query.value, "Incineroar");
  assert.equal(suggestions.hidden, true);
  assert.equal(view.elements.archive.children.length, 10, "selection keeps the submitted search unchanged");
  query.value += " + rill";
  query.listeners.input();
  let prevented = false;
  query.listeners.keydown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(query.value, "Incineroar + Rillaboom");
  assert.equal(suggestions.hidden, true);
  prevented = false;
  query.listeners.keydown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, false, "Enter with a closed popup remains available to submit the form");
  view.elements["search-form"].listeners.submit({ preventDefault() {} });
  assert.match(view.elements["search-status"].textContent, /1 matching team/);
});

test("autocomplete supports Chinese input, dismissal, empty fragments, and clear recovery", async () => {
  const view = await page(0, { tournaments: searchTournaments });
  view.locale("zh-TW");
  const { query, suggestions } = view.elements;
  query.value = "熾焰咆哮虎 + 金剛";
  query.listeners.input();
  assert.equal(suggestions.children[0].children[0].textContent, "轟擂金剛猩");
  let escapePrevented = false;
  query.listeners.keydown({ key: "Escape", preventDefault() { escapePrevented = true; } });
  assert.equal(escapePrevented, true, "dismissing suggestions must prevent the native search input from clearing the query");
  assert.equal(query.value, "熾焰咆哮虎 + 金剛");
  assert.equal(suggestions.hidden, true);
  query.listeners.input();
  query.listeners.keydown({ key: "ArrowDown", preventDefault() {} });
  assert.equal(view.document.activeElement, suggestions.children[0]);
  suggestions.listeners.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(view.document.activeElement, query);
  assert.equal(suggestions.hidden, true);
  query.listeners.input();
  suggestions.children[0].click();
  assert.equal(query.value, "熾焰咆哮虎 + 轟擂金剛猩");
  query.value += " + ";
  query.listeners.input();
  assert.equal(suggestions.hidden, true, "a blank next name must not show a false no-match message");
  query.value += "missing";
  query.listeners.input();
  assert.equal(suggestions.children[0].textContent, tFor("zh-TW", "search.noMatches"));
  view.elements.reset.click();
  assert.equal(query.value, "");
  assert.equal(suggestions.hidden, true);
  assert.equal(query.getAttribute("aria-expanded"), "false");
});

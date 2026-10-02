import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  WEB_CATALOG_NAMES,
  deriveWebCatalogs,
  selectChampionsCatalogs,
  serializeWebCatalog,
  stripGenerationHistory,
} from "../src/data/web-catalogs.js";
import { stageSite } from "../scripts/stage-site.mjs";

const readPublic = (path) =>
  readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");

function committedFullCatalogs() {
  const [pokemon, abilities, moves, items, teams] = [
    "pokemon",
    "abilities",
    "moves",
    "items",
    "limitless-teams",
  ].map((name) => JSON.parse(readPublic(`${name}.json`)));
  return { pokemon, abilities, moves, items, teams };
}

test("committed public/web catalogs equal the derivation of the full catalogs", () => {
  const derived = deriveWebCatalogs(committedFullCatalogs());
  for (const name of WEB_CATALOG_NAMES) {
    assert.equal(
      readPublic(`web/${name}.json`),
      serializeWebCatalog(derived[name]),
      `public/web/${name}.json is stale; run npm run build-web-catalogs`,
    );
  }
});

test("the browser selection is idempotent on the slim catalogs", () => {
  const slim = Object.fromEntries(
    ["pokemon", "abilities", "moves", "items"].map((name) => [
      name,
      JSON.parse(readPublic(`web/${name}.json`)),
    ]),
  );
  assert.deepEqual(selectChampionsCatalogs(slim), slim);
});

test("keeps only Champions entries, Mega families, and referenced abilities", () => {
  const derived = deriveWebCatalogs({
    pokemon: [
      { id: "charizard", name: "Charizard", baseSpecies: "Charizard", abilities: ["Blaze"], champions: { legal: true } },
      { id: "charizardmegax", name: "Charizard-Mega-X", baseSpecies: "Charizard", abilities: ["Tough Claws"] },
      { id: "pikachu", name: "Pikachu", baseSpecies: "Pikachu", abilities: ["Static"], champions: { legal: false } },
    ],
    abilities: [
      { id: "blaze", name: "Blaze", champions: { legal: true }, gen5: { desc: "old" } },
      { id: "toughclaws", name: "Tough Claws", champions: { legal: false } },
      { id: "static", name: "Static", champions: { legal: false } },
    ],
    moves: [
      { id: "flamethrower", name: "Flamethrower", basePower: 90, champions: { legal: true }, gen4: { shortDesc: "x" }, gen7letsgo: {} },
      { id: "fakeout", name: "Fake Out", champions: { legal: false } },
    ],
    items: [{ id: "charizarditex", name: "Charizardite X", gen: 6, champions: { legal: true } }],
    teams: { tournaments: [] },
  });

  assert.deepEqual(derived.pokemon.map(({ id }) => id), ["charizard", "charizardmegax"]);
  assert.deepEqual(derived.abilities.map(({ id }) => id), ["blaze", "toughclaws"]);
  assert.equal("gen5" in derived.abilities[0], false);
  assert.deepEqual(derived.moves, [
    { id: "flamethrower", name: "Flamethrower", basePower: 90, champions: { legal: true } },
  ]);
  assert.equal(derived.items[0].gen, 6);
  assert.deepEqual(derived["limitless-teams"], { tournaments: [] });
});

test("strips only per-generation history keys", () => {
  const entry = { id: "a", gen: 3, gen8: {}, gen8bdsp: {}, generation: "keep", desc: "d" };
  assert.deepEqual(stripGenerationHistory(entry), { id: "a", gen: 3, generation: "keep", desc: "d" });
  const untouched = { id: "b" };
  assert.equal(stripGenerationHistory(untouched), untouched);
});

test("slim browser catalogs are minified and much smaller than the full catalogs", () => {
  const full = readPublic("pokemon.json");
  const slim = readPublic("web/pokemon.json");
  assert.equal(slim.includes("\n  "), false);
  assert.ok(slim.length < full.length / 2);
});

test("stages only the browser site for GitHub Pages", async () => {
  const out = await mkdtemp(join(tmpdir(), "pokecal-site-"));
  try {
    const { pages } = await stageSite({ out });
    assert.deepEqual(pages, [
      "battle.html",
      "builder.html",
      "index.html",
      "moves.html",
      "speed.html",
      "teams.html",
    ]);
    const top = (await readdir(out)).sort();
    assert.deepEqual(top, [".nojekyll", ...pages, "public", "src"].sort());
    assert.deepEqual((await readdir(join(out, "public"))).sort(), ["icons", "web"]);
    assert.deepEqual(
      (await readdir(join(out, "public", "web"))).sort(),
      WEB_CATALOG_NAMES.map((name) => `${name}.json`).sort(),
    );
    assert.ok(existsSync(join(out, "src", "ui", "lookup-page.js")));
    assert.ok(existsSync(join(out, "public", "icons", "types", "fire.png")));
    assert.equal(existsSync(join(out, "public", "icons", "README.md")), false);
    assert.equal(existsSync(join(out, "public", "pokemon.json")), false);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

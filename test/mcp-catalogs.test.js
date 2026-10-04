import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MCP_CATALOG_DIRECTORY,
  MCP_CATALOG_NAMES,
  deriveMcpCatalogs,
  serializeMcpCatalog,
} from "../scripts/lib/mcp-catalogs.mjs";

const readPublic = (path) =>
  readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");

function committedFullCatalogs() {
  return Object.fromEntries(
    MCP_CATALOG_NAMES.map((name) => [name, JSON.parse(readPublic(`${name}.json`))]),
  );
}

test("committed public/mcp-catalogs equal the derivation of the full catalogs", () => {
  const derived = deriveMcpCatalogs(committedFullCatalogs());
  for (const name of MCP_CATALOG_NAMES) {
    assert.equal(
      readPublic(`${MCP_CATALOG_DIRECTORY}/${name}.json`),
      serializeMcpCatalog(derived[name]),
      `public/${MCP_CATALOG_DIRECTORY}/${name}.json is stale; run npm run build-web-catalogs`,
    );
  }
});

test("MCP catalogs keep every entry, including non-Champions-legal ones", () => {
  const full = committedFullCatalogs();
  for (const name of MCP_CATALOG_NAMES) {
    const slim = JSON.parse(readPublic(`${MCP_CATALOG_DIRECTORY}/${name}.json`));
    assert.deepEqual(slim.map(({ id }) => id), full[name].map(({ id }) => id), name);
  }
  const slimPokemon = JSON.parse(readPublic(`${MCP_CATALOG_DIRECTORY}/pokemon.json`));
  assert.equal(slimPokemon.find(({ id }) => id === "mewtwo")?.champions?.legal, false);
});

test("MCP derivation drops only fields the Worker never reads", () => {
  const derived = deriveMcpCatalogs({
    pokemon: [
      {
        id: "alpha",
        name: "Alpha",
        num: 1,
        types: ["Fire"],
        baseStats: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
        abilities: ["Blaze"],
        moves: ["ember", "flamethrower"],
        aliases: ["阿爾法"],
        champions: {
          legal: true,
          tier: "OU",
          source: "Limitless",
          sourceUrl: "https://example.test",
          usageCount: 3,
          usagePercent: 10,
          ncp: { sets: [] },
          spreadsMeta: { month: "2026-09" },
          usage: {
            abilities: [{ id: "blaze", name: "Blaze", usagePercent: 100 }],
            items: [
              { id: "b", name: "B Item", usagePercent: 20 },
              { id: "a", name: "A Item", usagePercent: 60 },
            ],
            moves: [{ id: "ember", name: "Ember", usagePercent: 90 }],
            natures: [],
            spreads: [{ name: "Timid:0/0/0/32/2/32", usagePercent: 50 }],
            speedProfiles: [{ speed: 100 }],
          },
        },
      },
      { id: "beta", name: "Beta", moves: ["tackle"], champions: { legal: false } },
      { id: "gamma", name: "Gamma", moves: [] },
    ],
    moves: [
      { id: "ember", name: "Ember", num: 52, desc: "Long.", shortDesc: "Short.", contestType: "Cute", gen4: { desc: "old" }, flags: { protect: 1 }, champions: { legal: true, tier: "OU", sourceUrl: "x", desc: "Champions long." } },
      { id: "oddmove", name: "Odd Move", desc: "Only a long description." },
    ],
    abilities: [{ id: "blaze", name: "Blaze", desc: "Long.", shortDesc: "Short.", aliases: ["猛火"], rating: 2, gen3: {}, champions: { legal: true, usageCount: 4, source: "Limitless" } }],
    items: [{ id: "a", name: "A Item", desc: "Long.", shortDesc: "Short.", spritenum: 1, fling: { basePower: 30 }, champions: { legal: false } }],
  });

  assert.deepEqual(derived.pokemon, [
    {
      id: "alpha",
      name: "Alpha",
      types: ["Fire"],
      baseStats: { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 },
      abilities: ["Blaze"],
      aliases: ["阿爾法"],
      champions: {
        legal: true,
        tier: "OU",
        usageCount: 3,
        usagePercent: 10,
        usage: {
          abilities: [{ id: "blaze", name: "Blaze", usagePercent: 100 }],
          items: [{ id: "a", name: "A Item", usagePercent: 60 }],
          spreads: [{ name: "Timid:0/0/0/32/2/32", usagePercent: 50 }],
        },
      },
    },
    { id: "beta", name: "Beta", champions: { legal: false } },
    { id: "gamma", name: "Gamma" },
  ]);
  assert.deepEqual(derived.moves, [
    { id: "ember", name: "Ember", shortDesc: "Short.", flags: { protect: 1 }, champions: { legal: true, tier: "OU" } },
    { id: "oddmove", name: "Odd Move", desc: "Only a long description." },
  ]);
  assert.deepEqual(derived.abilities, [{ id: "blaze", name: "Blaze", champions: { legal: true, usageCount: 4 } }]);
  assert.deepEqual(derived.items, [{ id: "a", name: "A Item", fling: { basePower: 30 }, champions: { legal: false } }]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import { matchup } from "../src/data/matchups.js";
import { groupNicheThreats, nicheThreatRow, splitByTeams, threatPattern } from "../src/data/niche-threats.js";
import { UNCOMMON_MIN_TEAMS, theoryConfigs } from "../src/data/uncommon-sets.js";

const load = (file) => JSON.parse(readFileSync(new URL(`../public/web/${file}`, import.meta.url), "utf8"));
const pokemonCatalog = load("pokemon.json");
const items = load("items.json");
const lookups = {
  abilityLookup: buildAbilityLookup(load("abilities.json")),
  itemLookup: buildItemLookup(items),
  moveLookup: buildMoveLookup(load("moves.json")),
  items,
};
const species = (name) => pokemonCatalog.find((pokemon) => pokemon.name === name);
const move = (id) => lookups.moveLookup.get(id);

const rillaboom = {
  pokemon: species("Rillaboom"),
  nature: "Adamant",
  sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
  ability: lookups.abilityLookup.get("grassysurge"),
  item: lookups.itemLookup.get("miracleseed"),
  moves: [move("grassyglide"), move("woodhammer"), move("highhorsepower")],
};

// Usage fixtures, so Limitless syncs cannot move the 20-team boundary under the test.
const withTeams = (name, usageCount, usagePercent) => ({
  ...species(name),
  champions: usageCount === null ? undefined : { ...species(name).champions, usageCount, usagePercent },
});

test("splitByTeams puts 20+ Limitless teams in popular and the rest, including unused, in rare", () => {
  assert.equal(UNCOMMON_MIN_TEAMS, 20);
  const catalog = [
    withTeams("Incineroar", 500, 40),
    withTeams("Gholdengo", 20, 3),
    withTeams("Volcarona", 19, 2.9),
    withTeams("Arcanine", null),
    withTeams("Charizard", 0, 0),
    { ...withTeams("Flapple", 50, 5), battleOnly: true },
  ];
  const { popular, rare } = splitByTeams(catalog);
  assert.deepEqual(popular.map(({ pokemon, rank }) => [pokemon.name, rank]), [["Incineroar", 1], ["Gholdengo", 2]]);
  assert.deepEqual(rare.map(({ pokemon, rank }) => [pokemon.name, rank]), [["Volcarona", 3], ["Charizard", 4], ["Arcanine", null]]);
  assert.equal(rare.at(-1).usagePercent, 0);
  assert.deepEqual(splitByTeams(catalog, { minTeams: 19 }).popular.map(({ pokemon }) => pokemon.name), ["Incineroar", "Gholdengo", "Volcarona"]);
});

test("threatPattern keys a threat by its KO move's type and category and whether it walls you", () => {
  const result = (type, category, ourOffenseWalled) => ({ theirs: { best: { move: { type, category } } }, ourOffenseWalled });
  assert.deepEqual(threatPattern(result("Fire", "Special", true)), { type: "Fire", category: "Special", walls: true, key: "Fire|Special|walls" });
  assert.equal(threatPattern(result("Fire", "Special", false)).key, "Fire|Special|");
  assert.equal(threatPattern({ theirs: { best: null } }), null);
});

test("nicheThreatRow returns the harshest theory set that beats you", () => {
  const charizard = withTeams("Charizard", 3, 0.1);
  const row = nicheThreatRow({ pokemon: charizard, rank: 150, usagePercent: 0.1 }, rillaboom, lookups);
  assert.equal(row.id, "charizard");
  assert.equal(row.result.outcome, "loss");
  assert.equal(row.set.source.spread, "theory");
  assert.deepEqual(row.changes, []);
  assert.equal(row.pattern.type, "Fire");
  assert.equal(row.pattern.key, threatPattern(row.result).key);

  // No other theory set beats you harder: decisive first, then the most negative margin.
  const severity = (result) => (result.decisive ? 100 : 0) - result.margin;
  for (const config of theoryConfigs(charizard, rillaboom, lookups)) {
    const result = matchup({ ours: rillaboom, theirs: config.set });
    if (result.outcome === "loss") assert.ok(severity(result) <= severity(row.result), config.template);
  }

  assert.equal(nicheThreatRow({ pokemon: charizard, rank: 150, usagePercent: 0.1 }, { ...rillaboom, moves: [] }, lookups), null);
});

test("groupNicheThreats lists new ways of beating you and folds the rest by type", () => {
  const row = (name, type, category, walls, { decisive = false, margin = -1, rank = null } = {}) => ({
    pokemon: { name },
    rank,
    result: { decisive, margin, theirs: { best: { move: { type, category } } }, ourOffenseWalled: walls },
    pattern: threatPattern({ theirs: { best: { move: { type, category } } }, ourOffenseWalled: walls }),
  });
  const covered = [row("Incineroar", "Fire", "Physical", false).result, row("Talonflame", "Flying", "Physical", false).result];
  const rows = [
    row("Arcanine", "Fire", "Physical", false),
    row("Charizard", "Fire", "Special", true, { decisive: true, margin: -5 }),
    row("Volcarona", "Fire", "Special", true, { decisive: true, margin: -4, rank: 120 }),
    row("Corviknight", "Flying", "Physical", false, { rank: 130 }),
    row("Magmar", "Fire", "Physical", false, { margin: -2 }),
    row("Glalie", "Ice", "Physical", false),
  ];
  const { novel, repeats } = groupNicheThreats(rows, covered);
  assert.deepEqual(novel.map(({ pokemon }) => pokemon.name), ["Charizard", "Volcarona", "Glalie"]);
  assert.deepEqual(repeats.map(({ type, rows: typeRows }) => [type, typeRows.map(({ pokemon }) => pokemon.name)]),
    [["Fire", ["Magmar", "Arcanine"]], ["Flying", ["Corviknight"]]]);
  assert.deepEqual(groupNicheThreats([], covered), { novel: [], repeats: [] });
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import { matchup } from "../src/data/matchups.js";
import {
  MAX_SET_CHANGES,
  candidateMoves,
  findUncommonSet,
  itemRoles,
  setChanges,
  sortUncommonRows,
  theoryConfigs,
  uncommonCandidates,
  uncommonSetRow,
} from "../src/data/uncommon-sets.js";

// Pinned species, moves, abilities and items; every usage profile below is a fixture, so weekly
// Limitless syncs cannot change these expectations.
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

const withUsage = (name, usage, usageCount = 100) => ({
  ...species(name),
  champions: { ...species(name).champions, usageCount, usagePercent: 20, usage },
});
// A Gholdengo whose players never run Steel Beam.
const gholdengo = withUsage("Gholdengo", {
  moves: [
    { id: "makeitrain", name: "Make It Rain", usagePercent: 95 },
    { id: "shadowball", name: "Shadow Ball", usagePercent: 90 },
    { id: "protect", name: "Protect", usagePercent: 80 },
  ],
  items: [{ id: "lifeorb", name: "Life Orb", usagePercent: 40 }, { id: "leftovers", name: "Leftovers", usagePercent: 30 }],
  abilities: [{ id: "goodasgold", name: "Good as Gold", usagePercent: 100 }],
  natures: [{ name: "Modest", usagePercent: 60 }, { name: "Timid", usagePercent: 40 }],
  spreads: [{ name: "Timid:2/0/0/32/0/32", usagePercent: 20 }],
});

test("itemRoles maps type-boosting items and resist berries", () => {
  const { typeBoost, resistBerry } = itemRoles(items);
  assert.equal(typeBoost.Fire.id, "charcoal");
  assert.equal(typeBoost.Grass.id, "miracleseed");
  assert.equal(resistBerry.Fire.id, "occaberry");
  assert.equal(resistBerry.Grass.id, "rindoberry");
});

test("candidate moves are race-eligible attacks, strongest into your types plus common ones", () => {
  const ids = candidateMoves(gholdengo, rillaboom, lookups.moveLookup).map(({ id }) => id);
  assert.ok(ids.includes("steelbeam"), "a strong uncommon option is considered");
  assert.ok(ids.includes("makeitrain") && ids.includes("shadowball"), "common moves are always kept");
  assert.ok(!ids.includes("protect"));
  for (const id of ids) assert.notEqual(move(id).category, "Status");
});

test("setChanges counts only choices below the common share", () => {
  const set = { nature: "Modest", ability: lookups.abilityLookup.get("goodasgold"), item: lookups.itemLookup.get("lifeorb") };
  assert.deepEqual(setChanges(gholdengo, set, move("makeitrain")), []);
  assert.deepEqual(
    setChanges(gholdengo, { ...set, nature: "Bold", item: lookups.itemLookup.get("sitrusberry") }, move("steelbeam")).map(({ kind }) => kind),
    ["item", "nature", "move"],
  );
  // A one-ability Pokémon never counts its ability as a change.
  assert.ok(setChanges(gholdengo, { ...set, ability: { id: "other", name: "Other" } }).every(({ kind }) => kind !== "ability"));
});

test("findUncommonSet finds the one rare move that turns the matchup", () => {
  const found = findUncommonSet(gholdengo, rillaboom, lookups);
  assert.equal(found.result.outcome, "loss");
  assert.deepEqual(found.changes.map(({ kind, id }) => [kind, id]), [["move", "steelbeam"]]);
  assert.equal(found.result.theirs.best.move.id, "steelbeam");
  assert.equal(found.template, "specialAttacker");
});

test("findUncommonSet's pruning matches an exhaustive search", () => {
  for (const opponent of [gholdengo, ...pokemonCatalog
    .filter((pokemon) => (pokemon.champions?.usageCount ?? 0) >= 20)
    .sort((a, b) => b.champions.usagePercent - a.champions.usagePercent)
    .slice(0, 40)]) {
    let exhaustive = null;
    for (const config of theoryConfigs(opponent, rillaboom, lookups)) {
      const result = matchup({ ours: rillaboom, theirs: config.set });
      if (result.outcome !== "loss") continue;
      const changes = setChanges(opponent, config.set, result.theirs.best.move).length;
      if (changes <= MAX_SET_CHANGES && (exhaustive === null || changes < exhaustive)) exhaustive = changes;
    }
    const found = findUncommonSet(opponent, rillaboom, lookups);
    assert.equal(found?.changes.length ?? null, exhaustive, opponent.name);
  }
});

test("uncommonSetRow finds the rare choice, or returns the usual set when it already beats you", () => {
  const row = uncommonSetRow({ pokemon: gholdengo, rank: 5, usagePercent: 20 }, rillaboom, lookups);
  assert.equal(row.usualOutcome === "loss", false);
  assert.equal(row.usualBeats, false);
  assert.equal(row.set.source.spread, "theory");
  assert.deepEqual(row.changes.map(({ id }) => id), ["steelbeam"]);

  // With Steel Beam as a usual move, the usual set wins: the row is that set with no changes,
  // so a popular Pokémon outside the page's top N still shows up.
  const steelBeamUsual = withUsage("Gholdengo", {
    ...gholdengo.champions.usage,
    moves: [...gholdengo.champions.usage.moves, { id: "steelbeam", name: "Steel Beam", usagePercent: 30 }],
    spreads: [{ name: "Modest:32/0/2/32/0/0", usagePercent: 20 }],
  });
  const usualRow = uncommonSetRow({ pokemon: steelBeamUsual, rank: 5, usagePercent: 20 }, rillaboom, lookups);
  assert.equal(usualRow.usualBeats, true);
  assert.equal(usualRow.usualOutcome, "loss");
  assert.equal(usualRow.result.outcome, "loss");
  assert.deepEqual(usualRow.changes, []);
  assert.notEqual(usualRow.set.source.spread, "theory");
  assert.equal(uncommonSetRow({ pokemon: gholdengo, rank: 5, usagePercent: 20 }, { ...rillaboom, moves: [] }, lookups), null);
});

test("only well-sampled opponents are checked and rows sort usual threats first, then fewest changes", () => {
  const small = withUsage("Gholdengo", gholdengo.champions.usage, 19);
  assert.deepEqual(uncommonCandidates([{ pokemon: small }, { pokemon: gholdengo }]).map(({ pokemon }) => pokemon.champions.usageCount), [100]);
  const rows = [
    { changes: [1, 2], usagePercent: 50, rank: 1 },
    { changes: [], usagePercent: 5, rank: 9 },
    { changes: [1], usagePercent: 10, rank: 4 },
    { changes: [1], usagePercent: 30, rank: 2 },
    { usualBeats: true, changes: [], usagePercent: 1, rank: 60 },
  ];
  assert.deepEqual(sortUncommonRows(rows).map(({ rank }) => rank), [60, 9, 2, 4, 1]);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import {
  analyzeMatchups,
  cellOutcome,
  createMatchupPreferencesStore,
  hitBucket,
  matchupSections,
  matchupSetFromSide,
  normalizeOpponentCount,
  normalizeSpeedMode,
  rankedOpponents,
  summarizeMatchups,
} from "../src/data/matchup-analysis.js";
import { normalizeId } from "../src/identifiers.js";

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

// Hand-built rows keep the summary and grouping tests independent of weekly usage data.
const row = (name, { outcome, ourHits, theirHits, usagePercent, rank, decisive = false, walled = false, ourWinChance = null }) => ({
  pokemon: { id: normalizeId(name), name },
  id: normalizeId(name),
  rank,
  usagePercent,
  result: { outcome, ourHits, theirHits, decisive, margin: cap(theirHits) - cap(ourHits), ourOffenseWalled: walled },
  speed: outcome === "speed" ? { ourWinChance } : null,
  cell: { theirs: hitBucket(theirHits), ours: hitBucket(ourHits) },
});
const cap = (hits) => (Number.isFinite(hits) ? hits : 6);
const fixtureRows = [
  row("Counter", { outcome: "loss", theirHits: 1, ourHits: Infinity, usagePercent: 30, rank: 1, decisive: true, walled: true }),
  row("Edge", { outcome: "loss", theirHits: 2, ourHits: 3, usagePercent: 40, rank: 2 }),
  row("Racer", { outcome: "speed", theirHits: 1, ourHits: 1, usagePercent: 10, rank: 3, ourWinChance: 0.25 }),
  row("Mirror", { outcome: "speed", theirHits: 2, ourHits: 2, usagePercent: 10, rank: 4, ourWinChance: 1 }),
  row("Check", { outcome: "win", theirHits: 3, ourHits: 1, usagePercent: 5, rank: 5, decisive: true }),
  row("Edge win", { outcome: "win", theirHits: 3, ourHits: 2, usagePercent: 3, rank: 6 }),
  row("Wall", { outcome: "stalemate", theirHits: Infinity, ourHits: Infinity, usagePercent: 2, rank: 7, walled: true }),
];

test("preferences fall back to the defaults", () => {
  assert.equal(normalizeOpponentCount("100"), 100);
  assert.equal(normalizeOpponentCount(30), 50);
  assert.equal(normalizeSpeedMode("trickRoom"), "trickRoom");
  assert.equal(normalizeSpeedMode("fast"), "auto");
});

test("matchup preferences persist normalized values", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createMatchupPreferencesStore(storage);
  assert.deepEqual(store.read(), { opponentCount: 50, speedMode: "auto" });
  assert.deepEqual(store.write({ opponentCount: "100" }), { opponentCount: 100, speedMode: "auto" });
  assert.deepEqual(store.write({ speedMode: "trickRoom" }), { opponentCount: 100, speedMode: "trickRoom" });
  assert.deepEqual(createMatchupPreferencesStore(storage).read(), { opponentCount: 100, speedMode: "trickRoom" });
  values.set("pokecal.matchup-preferences.v1", "{broken");
  assert.deepEqual(createMatchupPreferencesStore(storage).read(), { opponentCount: 50, speedMode: "auto" });
  assert.deepEqual(createMatchupPreferencesStore(null).write({ speedMode: "normal" }), { opponentCount: 50, speedMode: "normal" });
});

test("hit buckets and grid cells", () => {
  assert.deepEqual([1, 2, 3, 4, 5, Infinity].map(hitBucket), [1, 2, 3, 4, 4, 4]);
  assert.equal(cellOutcome(1, 2), "loss");
  assert.equal(cellOutcome(3, 1), "win");
  assert.equal(cellOutcome(2, 2), "speed");
  assert.equal(cellOutcome(4, 4), "slow");
});

test("summarizeMatchups weights outcomes by usage and fills the grid", () => {
  const summary = summarizeMatchups(fixtureRows);
  assert.equal(summary.count, 7);
  assert.deepEqual(summary.counts, { loss: 2, speed: 2, win: 2, stalemate: 1 });
  assert.equal(summary.shares.loss, 0.7);
  assert.equal(summary.shares.speed, 0.2);
  assert.equal(summary.shares.win, 0.08);
  assert.equal(summary.shares.stalemate, 0.02);
  assert.equal(summary.walledShare, 0.32);
  assert.equal(summary.speedFirstShare, 0.625);
  assert.equal(summary.grid[0][3].count, 1, "they OHKO, you need 4+");
  assert.equal(summary.grid[0][3].outcome, "loss");
  assert.equal(summary.grid[2][0].count, 1);
  assert.equal(summary.grid[3][3].count, 1);
  assert.equal(summary.grid[3][3].outcome, "slow");
  assert.equal(summary.grid.flat().reduce((total, cell) => total + cell.count, 0), 7);
  assert.equal(summarizeMatchups([]).speedFirstShare, null);
});

test("matchupSections orders threats, speed races and good matchups", () => {
  const sections = matchupSections(fixtureRows);
  assert.deepEqual(sections.threats.map(({ pokemon }) => pokemon.name), ["Counter", "Edge"]);
  assert.deepEqual(sections.speed.map(({ pokemon }) => pokemon.name), ["Racer", "Mirror"]);
  assert.deepEqual(sections.favorable.map(({ pokemon }) => pokemon.name), ["Check", "Edge win"]);
  assert.deepEqual(sections.stalemate.map(({ pokemon }) => pokemon.name), ["Wall"]);

  const filtered = matchupSections(fixtureRows, { cell: { theirs: 2, ours: 3 } });
  assert.deepEqual(filtered.threats.map(({ pokemon }) => pokemon.name), ["Edge"]);
  assert.equal(filtered.favorable.length, 0);
});

test("rankedOpponents ranks by usage and skips battle-only forms", () => {
  const ranked = rankedOpponents([
    { id: "a", name: "A", champions: { usagePercent: 5 } },
    { id: "b", name: "B", champions: { usagePercent: 20 } },
    { id: "c", name: "C", battleOnly: "A", champions: { usagePercent: 30 } },
    { id: "d", name: "D", champions: {} },
  ], 50);
  assert.deepEqual(ranked.map(({ pokemon, rank }) => [pokemon.id, rank]), [["b", 1], ["a", 2]]);
});

test("analyzeMatchups races a page set against observed opponent sets", () => {
  const side = {
    pokemon: species("Rillaboom"),
    nature: "Adamant",
    sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
    ability: lookups.abilityLookup.get("grassysurge"),
    item: lookups.itemLookup.get("miracleseed"),
    selectedMoveIds: ["fakeout", "grassyglide", "woodhammer", ""],
  };
  const ours = matchupSetFromSide(side, lookups.moveLookup);
  assert.deepEqual(ours.moves.map(({ id }) => id), ["fakeout", "grassyglide", "woodhammer"]);

  const opponents = rankedOpponents(pokemonCatalog, 5);
  const shares = { overall: { teams: 10, trickRoomTeams: 10, share: 1 }, byPokemon: new Map() };
  const auto = analyzeMatchups({ ours, opponents, lookups, speedMode: "auto", trickRoomShares: shares });
  const normal = analyzeMatchups({ ours, opponents, lookups, speedMode: "auto" });

  assert.equal(auto.rows.length + auto.skipped.length, 5);
  for (const entry of auto.rows) {
    assert.ok(["win", "loss", "speed", "stalemate"].includes(entry.result.outcome));
    assert.equal(entry.cell.theirs, hitBucket(entry.result.theirHits));
    assert.equal(entry.trickRoom.source, "overall");
  }
  // Without team data, auto uses normal move order.
  for (const entry of normal.rows.filter(({ result }) => result.outcome === "speed")) {
    assert.equal(entry.trickRoom, null);
    assert.equal(entry.speed.first, entry.result.order.normal.first);
  }
  assert.deepEqual(analyzeMatchups({ ours: null, opponents }), { rows: [], skipped: [] });
});

test("matchupSetFromSide keeps stages, status and per-slot move settings aligned with moves", () => {
  const side = {
    pokemon: species("Rillaboom"),
    nature: "Adamant",
    sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
    stages: { atk: 1, def: 0, spa: 0, spd: 0, spe: -1 },
    ability: lookups.abilityLookup.get("grassysurge"),
    item: lookups.itemLookup.get("miracleseed"),
    status: "",
    soaked: true,
    selectedMoveIds: ["fakeout", "", "woodhammer", "grassyglide"],
    critMoves: [false, true, true, false],
  };
  const ours = matchupSetFromSide(side, lookups.moveLookup, {
    moveOptions: (index, move) => ({ slot: index, id: move.id }),
  });
  assert.deepEqual(ours.moves.map(({ id }) => id), ["fakeout", "woodhammer", "grassyglide"]);
  assert.deepEqual(ours.moveSettings, [
    { critical: false, moveOptions: { slot: 0, id: "fakeout" } },
    { critical: true, moveOptions: { slot: 2, id: "woodhammer" } },
    { critical: false, moveOptions: { slot: 3, id: "grassyglide" } },
  ]);
  assert.deepEqual(ours.stages, side.stages);
  assert.equal(ours.soaked, true);
});

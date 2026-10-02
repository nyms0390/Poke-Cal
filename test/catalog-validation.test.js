import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MINIMUMS,
  METRIC_GROUPS,
  METRIC_NAMES,
  assertValidCatalogs,
  computeCatalogMetrics,
  validateCatalogMetrics,
  validateCatalogs,
} from "../src/data/catalog-validation.js";

const tinyMinimums = Object.fromEntries(METRIC_NAMES.map((name) => [name, 1]));

function syntheticCatalogs({ usage = true, spreads = true, ncp = true, aliases = true } = {}) {
  const legal = (id, extra = {}) => ({
    id,
    name: id,
    aliases: aliases ? ["皮卡丘"] : [],
    champions: {
      legal: true,
      ...(usage ? { usageCount: 3 } : {}),
      ...(spreads ? { usage: { spreads: [{ name: "Timid:2/0/0/32/0/32" }] } } : {}),
      ...(ncp ? { ncp: { sets: [{ name: "Set" }] } } : {}),
    },
  });
  return {
    pokemon: [
      legal("pikachu"),
      legal("raichu"),
      legal("pichu"),
      legal("mew"),
      { id: "missingno", name: "MissingNo", aliases: ["Alias"], champions: { legal: false } },
    ],
    moves: [
      { id: "thunderbolt", aliases: aliases ? ["十萬伏特"] : [], champions: { legal: true } },
      { id: "tackle", champions: { legal: false } },
    ],
    items: [{ id: "lightball", aliases: aliases ? ["電氣球"] : [], champions: { legal: true } }],
    abilities: [{ id: "static", aliases: aliases ? ["靜電"] : [], champions: { legal: true } }],
    teams: { tournaments: [{ topCut: [{}, {}] }, { topCut: [{}] }] },
  };
}

test("computes catalog metrics from synthetic catalogs", () => {
  assert.deepEqual(computeCatalogMetrics(syntheticCatalogs()), {
    pokemon: 5,
    championsLegalPokemon: 4,
    legalPokemonWithUsage: 4,
    legalPokemonWithSpreads: 4,
    legalPokemonWithNcpSets: 4,
    pokemonWithZhAliases: 4,
    legalPokemonWithZhAliases: 4,
    moves: 2,
    championsLegalMoves: 1,
    movesWithZhAliases: 1,
    items: 1,
    championsLegalItems: 1,
    itemsWithZhAliases: 1,
    abilities: 1,
    abilitiesWithZhAliases: 1,
    teamTournaments: 2,
    teamCount: 3,
  });
});

test("reports missing catalogs as null metrics that fail validation", () => {
  const metrics = computeCatalogMetrics({});
  assert.equal(metrics.pokemon, null);
  assert.equal(metrics.teamCount, null);
  const result = validateCatalogMetrics(metrics, { minimums: tinyMinimums });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /pokemon: missing/);
});

test("passes healthy catalogs and fails absolute minimums", () => {
  assert.equal(validateCatalogs(syntheticCatalogs(), { minimums: tinyMinimums }).ok, true);

  const result = validateCatalogs(syntheticCatalogs(), {
    minimums: { ...tinyMinimums, pokemon: 10 },
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["pokemon: 5 is below the minimum of 10"]);
});

test("detects empty upstream data: Limitless, Smogon, NCP, and zh-TW aliases", () => {
  const degraded = syntheticCatalogs({ usage: false, spreads: false, ncp: false, aliases: false });
  degraded.teams = { tournaments: [] };
  const result = validateCatalogs(degraded, { minimums: tinyMinimums });

  assert.equal(result.ok, false);
  for (const name of [
    "legalPokemonWithUsage",
    "legalPokemonWithSpreads",
    "legalPokemonWithNcpSets",
    "pokemonWithZhAliases",
    "movesWithZhAliases",
    "itemsWithZhAliases",
    "abilitiesWithZhAliases",
    "teamTournaments",
    "teamCount",
  ]) {
    assert.ok(
      result.errors.some((error) => error.startsWith(`${name}:`)),
      `expected an error for ${name}`,
    );
  }
});

test("fails a shrink of more than the allowed fraction versus the baseline", () => {
  const baseline = syntheticCatalogs();
  const shrunk = syntheticCatalogs();
  shrunk.pokemon = shrunk.pokemon.slice(2); // 4 legal -> 2 legal (50%)

  const result = validateCatalogs(shrunk, { baseline, minimums: tinyMinimums });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => /championsLegalPokemon: 2 shrank 50%/.test(error)));

  // A 25% drop (4 -> 3) is still allowed by default.
  const slightlyShrunk = syntheticCatalogs();
  slightlyShrunk.pokemon = slightlyShrunk.pokemon.slice(1);
  assert.equal(
    validateCatalogs(slightlyShrunk, { baseline, minimums: tinyMinimums }).ok,
    true,
  );

  // Metrics objects work as baselines too, and --allow-shrink style overrides skip the check.
  assert.equal(
    validateCatalogs(shrunk, {
      baseline: computeCatalogMetrics(baseline),
      minimums: tinyMinimums,
      allowShrink: true,
    }).ok,
    true,
  );
});

test("checks only the requested metric group and throws a combined error", () => {
  const catalogs = syntheticCatalogs({ ncp: false });
  assert.equal(
    validateCatalogs(catalogs, { minimums: tinyMinimums, metrics: METRIC_GROUPS.smogon }).ok,
    true,
  );
  assert.throws(
    () =>
      assertValidCatalogs(catalogs, {
        label: "NCP curated sets",
        minimums: tinyMinimums,
        metrics: METRIC_GROUPS.ncp,
      }),
    /NCP curated sets failed validation; nothing was written:\n {2}- legalPokemonWithNcpSets: 0/,
  );
});

test("every metric belongs to exactly one sync group and has a documented minimum", () => {
  const grouped = Object.values(METRIC_GROUPS).flat();
  assert.deepEqual([...grouped].sort(), [...METRIC_NAMES].sort());
  for (const name of METRIC_NAMES) assert.ok(DEFAULT_MINIMUMS[name] > 0, name);
});

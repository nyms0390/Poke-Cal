import test from "node:test";
import assert from "node:assert/strict";

import {
  SMOGON_STATS_URL,
  buildSmogonSpreads,
  chaosUrl,
  discoverChampionsFormats,
  latestStatsMonth,
  mergeSmogonSpreads,
} from "../src/data/smogon-data.js";
import { downloadSmogonChampionsSpreads } from "../scripts/sync-champions-spreads.mjs";

const statsIndexHtml = `
<a href="../">../</a>
<a href="2026-05/">2026-05/</a>
<a href="2026-06/">2026-06/</a>
<a href="2020-06-DLC1/">2020-06-DLC1/</a>
`;

const chaosIndexHtml = `
<a href="gen9champions4v4doublesuu-1760.json">gen9champions4v4doublesuu-1760.json</a>
<a href="gen9championsbssregmb-1760.json">gen9championsbssregmb-1760.json</a>
<a href="gen9championsvgc2026regma-1760.json">gen9championsvgc2026regma-1760.json</a>
<a href="gen9championsvgc2026regmabo3-1760.json">gen9championsvgc2026regmabo3-1760.json</a>
<a href="gen9championsvgc2026regmb-1760.json">gen9championsvgc2026regmb-1760.json</a>
<a href="gen9championsvgc2026regmb-1500.json">gen9championsvgc2026regmb-1500.json</a>
<a href="gen9championsvgc2026regmbbo3-1760.json">gen9championsvgc2026regmbbo3-1760.json</a>
`;

const compressedChaosIndexHtml = `
<a href="gen9champions4v4doublesuu-1760.json.gz">gen9champions4v4doublesuu-1760.json.gz</a>
<a href="gen9championsvgc2026regma-1760.json.gz">gen9championsvgc2026regma-1760.json.gz</a>
<a href="gen9championsvgc2026regmabo3-1760.json.gz">gen9championsvgc2026regmabo3-1760.json.gz</a>
<a href="gen9championsvgc2026regmb-1500.json.gz">gen9championsvgc2026regmb-1500.json.gz</a>
<a href="gen9championsvgc2026regmb-1760.json.gz">gen9championsvgc2026regmb-1760.json.gz</a>
<a href="gen9championsvgc2026regmbbo3-1760.json.gz">gen9championsvgc2026regmbbo3-1760.json.gz</a>
`;

const mixedChaosIndexHtml = `
<a href="gen9championsvgc2026regma-1760.json">gen9championsvgc2026regma-1760.json</a>
<a href="gen9championsvgc2026regmb-1760.json">gen9championsvgc2026regmb-1760.json</a>
<a href="gen9championsvgc2026regmb-1760.json.gz">gen9championsvgc2026regmb-1760.json.gz</a>
<a href="gen9championsvgc2026regmbbo3-1760.json.gz">gen9championsvgc2026regmbbo3-1760.json.gz</a>
<a href="gen9championsvgc2026regmbbo3-1500.json">gen9championsvgc2026regmbbo3-1500.json</a>
<a href="gen9championsbssregmb-1760.json.gz">gen9championsbssregmb-1760.json.gz</a>
`;

const chaosBo1 = {
  info: { metagame: "gen9championsvgc2026regmb", cutoff: 1760, "number of battles": 100 },
  data: {
    Mienshao: {
      Spreads: {
        "Jolly:2/32/0/0/0/32": 60,
        "Adamant:2/32/0/0/0/32": 30,
        "Jolly:0/999/0/0/0/32": 5,
        "NotANature:0/0/0/0/0/0": 5,
      },
    },
  },
};

const chaosBo3 = {
  info: { metagame: "gen9championsvgc2026regmbbo3", cutoff: 1760, "number of battles": 50 },
  data: {
    Mienshao: {
      Spreads: {
        "Adamant:2/32/0/0/0/32": 10,
      },
    },
    "Urshifu-Rapid-Strike": {
      Spreads: {
        "Adamant:12/32/0/0/0/20": 20,
      },
    },
  },
};

test("finds the latest monthly stats directory", () => {
  assert.equal(latestStatsMonth(statsIndexHtml), "2026-06");
  assert.equal(latestStatsMonth(""), null);
});

test("discovers the newest Champions VGC regulation formats", () => {
  assert.deepEqual(discoverChampionsFormats(chaosIndexHtml, { cutoff: 1760 }), [
    "gen9championsvgc2026regmb",
    "gen9championsvgc2026regmbbo3",
  ]);
  assert.deepEqual(discoverChampionsFormats("", { cutoff: 1760 }), []);
});

test("discovers Champions formats from compressed-only listings", () => {
  assert.deepEqual(discoverChampionsFormats(compressedChaosIndexHtml, { cutoff: 1760 }), [
    "gen9championsvgc2026regmb",
    "gen9championsvgc2026regmbbo3",
  ]);
});

test("deduplicates mixed JSON and compressed Champions listings", () => {
  assert.deepEqual(discoverChampionsFormats(mixedChaosIndexHtml, { cutoff: 1760 }), [
    "gen9championsvgc2026regmb",
    "gen9championsvgc2026regmbbo3",
  ]);
});

test("builds chaos stats URLs", () => {
  assert.equal(
    chaosUrl({ month: "2026-06", format: "gen9championsvgc2026regmb", cutoff: 1760 }),
    `${SMOGON_STATS_URL}2026-06/chaos/gen9championsvgc2026regmb-1760.json`,
  );
});

test("downloads selected Champions spreads through ordinary JSON URLs", async () => {
  const month = "2026-07";
  const indexUrl = `${SMOGON_STATS_URL}${month}/chaos/`;
  const bo1Url = chaosUrl({ month, format: "gen9championsvgc2026regmb", cutoff: 1760 });
  const bo3Url = chaosUrl({ month, format: "gen9championsvgc2026regmbbo3", cutoff: 1760 });
  const responses = new Map([
    [SMOGON_STATS_URL, statsIndexHtml.replace("2026-06", month)],
    [indexUrl, compressedChaosIndexHtml],
    [bo1Url, JSON.stringify(chaosBo1)],
    [bo3Url, JSON.stringify(chaosBo3)],
  ]);
  const requested = [];

  const usage = await downloadSmogonChampionsSpreads({
    fetcher: async (url) => {
      requested.push(url);
      if (!responses.has(url)) throw new Error(`Unexpected request: ${url}`);
      return responses.get(url);
    },
  });

  assert.deepEqual(requested, [SMOGON_STATS_URL, indexUrl, bo1Url, bo3Url]);
  assert.equal(usage.month, month);
  assert.deepEqual(usage.formats, [
    "gen9championsvgc2026regmb",
    "gen9championsvgc2026regmbbo3",
  ]);
  assert.equal(usage.cutoff, 1760);
  assert.ok(usage.pokemon.length > 0);
});

test("merges spread usage across chaos files and drops invalid spreads", () => {
  const usage = buildSmogonSpreads([chaosBo1, chaosBo3], { top: 2, month: "2026-06" });

  assert.equal(usage.source, "Smogon");
  assert.equal(usage.month, "2026-06");
  assert.equal(usage.cutoff, 1760);
  assert.equal(usage.battleCount, 150);
  assert.deepEqual(usage.formats, [
    "gen9championsvgc2026regmb",
    "gen9championsvgc2026regmbbo3",
  ]);

  const [mienshao, urshifu] = usage.pokemon;
  assert.equal(mienshao.name, "Mienshao");
  assert.deepEqual(mienshao.spreads, [
    { name: "Jolly:2/32/0/0/0/32", usageCount: 60, usagePercent: 60 },
    { name: "Adamant:2/32/0/0/0/32", usageCount: 40, usagePercent: 40 },
  ]);
  assert.equal(urshifu.id, "urshifurapidstrike");
});

test("merges spreads into the Pokémon catalog and clears stale spreads", () => {
  const usage = buildSmogonSpreads([chaosBo1, chaosBo3], { top: 2, month: "2026-06" });
  const merged = mergeSmogonSpreads(
    [
      { id: "mienshao", name: "Mienshao", champions: { legal: true, usage: { natures: [] } } },
      {
        id: "pikachu",
        name: "Pikachu",
        champions: { legal: true, usage: { spreads: [{ name: "stale" }] }, spreadsMeta: {} },
      },
    ],
    usage,
  );

  const [mienshao, pikachu] = merged;
  assert.equal(mienshao.champions.usage.spreads.length, 2);
  assert.deepEqual(mienshao.champions.usage.natures, []);
  assert.equal(mienshao.champions.spreadsMeta.source, "Smogon");
  assert.equal(mienshao.champions.spreadsMeta.month, "2026-06");
  assert.equal(mienshao.champions.legal, true);

  assert.equal("spreadsMeta" in pikachu.champions, false);
  assert.equal("usage" in pikachu.champions, false);
});

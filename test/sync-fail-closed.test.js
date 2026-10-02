// The sync scripts must fail closed: when an upstream source silently degrades (empty
// Limitless tournament list, empty NCP setdex, Smogon month without data, empty PokeAPI CSVs),
// the script rejects and leaves public/*.json untouched instead of committing empty data.
import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { updatePublicData as updateNcp } from "../scripts/sync-ncp-spreads.mjs";
import { updatePublicData as updateLimitless } from "../scripts/sync-limitless-champions-usage.mjs";
import { updatePublicData as updateSmogon } from "../scripts/sync-champions-spreads.mjs";
import { syncPokemonData } from "../scripts/sync-pokemon-data.mjs";
import { SMOGON_STATS_URL } from "../src/data/smogon-data.js";
import { validateDataDirectory } from "../scripts/validate-data.mjs";

const CATALOG_FILES = ["pokemon", "abilities", "moves", "items", "limitless-teams"];

async function withCommittedCatalogs(run) {
  const directory = await mkdtemp(join(tmpdir(), "pokecal-fail-closed-"));
  try {
    for (const name of CATALOG_FILES) {
      await copyFile(new URL(`../public/${name}.json`, import.meta.url), join(directory, `${name}.json`));
    }
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          CATALOG_FILES.map(async (name) => [name, await readFile(join(directory, `${name}.json`), "utf8")]),
        ),
      );
    await run({ directory: pathToFileURL(`${directory}/`), path: directory, snapshot });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("NCP sync refuses an empty setdex and writes nothing", async () => {
  await withCommittedCatalogs(async ({ directory, snapshot }) => {
    const before = await snapshot();
    await assert.rejects(
      updateNcp({ directory, fetcher: async () => "var SETDEX_GEN10 = {};" }),
      /NCP curated sets failed validation; nothing was written[\s\S]*legalPokemonWithNcpSets: 0/,
    );
    assert.deepEqual(await snapshot(), before);
  });
});

test("NCP sync still writes when the fresh setdex is healthy", async () => {
  await withCommittedCatalogs(async ({ directory, path }) => {
    const pokemon = JSON.parse(await readFile(join(path, "pokemon.json"), "utf8"));
    const setdex = {};
    for (const entry of pokemon) {
      for (const set of entry.champions?.ncp?.sets ?? []) {
        const { hp, atk, def, spa, spd, spe } = set.sps;
        setdex[entry.name] ??= {};
        setdex[entry.name][set.name] = {
          nature: set.nature,
          ability: set.ability,
          item: set.item,
          moves: set.moves,
          sps: { hp, at: atk, df: def, sa: spa, sd: spd, sp: spe },
        };
      }
    }
    const ncp = await updateNcp({
      directory,
      fetcher: async () => `// comment\nvar SETDEX_GEN10 = ${JSON.stringify(setdex)};`,
    });
    assert.ok(ncp.pokemon.length >= 40);
    const written = JSON.parse(await readFile(join(path, "pokemon.json"), "utf8"));
    assert.equal(
      written.filter((entry) => entry.champions?.ncp?.sets?.length).length,
      pokemon.filter((entry) => entry.champions?.ncp?.sets?.length).length,
    );
  });
});

test("Limitless sync refuses an empty tournament list (after the M-B fallback) and writes nothing", async () => {
  await withCommittedCatalogs(async ({ directory, snapshot }) => {
    const before = await snapshot();
    const formats = [];
    await assert.rejects(
      updateLimitless({
        directory,
        apiDelayMs: 0,
        fetcher: async (url) => {
          formats.push(new URL(url).searchParams.get("format"));
          return [];
        },
      }),
      /Limitless usage and team archive failed validation[\s\S]*legalPokemonWithUsage: 0[\s\S]*teamTournaments: 0/,
    );
    assert.deepEqual(formats, ["M-C", "M-B"]);
    assert.deepEqual(await snapshot(), before);
  });
});

test("Limitless sync rejects a non-array tournament response", async () => {
  await withCommittedCatalogs(async ({ directory, snapshot }) => {
    const before = await snapshot();
    await assert.rejects(
      updateLimitless({ directory, apiDelayMs: 0, fetcher: async () => ({ error: "maintenance" }) }),
      /did not return a JSON array/,
    );
    assert.deepEqual(await snapshot(), before);
  });
});

test("Smogon sync refuses chaos stats without data and writes nothing", async () => {
  await withCommittedCatalogs(async ({ directory, snapshot }) => {
    const before = await snapshot();
    const month = "2026-09";
    const responses = new Map([
      [SMOGON_STATS_URL, `<a href="${month}/">${month}/</a>`],
      [
        `${SMOGON_STATS_URL}${month}/chaos/`,
        '<a href="gen9championsvgc2026regmc-1760.json">x</a>',
      ],
      [
        `${SMOGON_STATS_URL}${month}/chaos/gen9championsvgc2026regmc-1760.json`,
        JSON.stringify({ info: { metagame: "gen9championsvgc2026regmc", cutoff: 1760 }, data: {} }),
      ],
    ]);
    await assert.rejects(
      updateSmogon({
        directory,
        fetcher: async (url) => {
          if (!responses.has(url)) throw new Error(`Unexpected request: ${url}`);
          return responses.get(url);
        },
      }),
      /Smogon SP spreads failed validation[\s\S]*legalPokemonWithSpreads: 0/,
    );
    assert.deepEqual(await snapshot(), before);
  });
});

test("Showdown/PokeAPI sync refuses degraded catalogs and writes nothing", async () => {
  await withCommittedCatalogs(async ({ directory, snapshot }) => {
    const before = await snapshot();
    const emptyTable = (name) => `export const ${name}: any = {};`;
    await assert.rejects(
      syncPokemonData({
        directory,
        fetcher: async (url) => {
          if (url.endsWith(".csv")) return "id,local_language_id,name\n";
          const name = /formats-data/.test(url)
            ? "FormatsData"
            : /learnsets/.test(url)
              ? "Learnsets"
              : /text\/abilities/.test(url)
                ? "AbilitiesText"
                : /text\/moves/.test(url)
                  ? "MovesText"
                  : /text\/items/.test(url)
                    ? "ItemsText"
                    : /pokedex/.test(url)
                      ? "Pokedex"
                      : /abilities/.test(url)
                        ? "Abilities"
                        : /moves/.test(url)
                          ? "Moves"
                          : "Items";
          return emptyTable(name);
        },
      }),
      /Showdown\/PokeAPI catalogs failed validation[\s\S]*pokemon: 0 is below the minimum/,
    );
    assert.deepEqual(await snapshot(), before);
  });
});

test("validate-data passes the committed catalogs and fails a shrunken copy against them", async () => {
  const committed = new URL("../public/", import.meta.url);
  const healthy = await validateDataDirectory({ directory: committed, baselineDirectory: committed });
  assert.equal(healthy.ok, true, healthy.errors.join("\n"));

  await withCommittedCatalogs(async ({ path }) => {
    await writeFile(
      join(path, "limitless-teams.json"),
      JSON.stringify({ version: 1, tournaments: [] }),
    );
    const result = await validateDataDirectory({ directory: path, baselineDirectory: committed });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.startsWith("teamTournaments: 0 is below")));
    assert.ok(result.errors.some((error) => /teamCount: 0 shrank 100%/.test(error)));
  });
});

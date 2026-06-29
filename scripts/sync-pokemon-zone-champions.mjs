import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  mergePokemonZoneCatalogs,
  parsePokemonZoneCatalog,
  parsePokemonZonePokemonDetail,
} from "../src/pokemon-zone-data.js";

const POKEMON_ZONE_CHAMPIONS_URL = "https://www.pokemon-zone.com/champions/";
const CATALOGS = ["pokemon", "moves", "items", "abilities"];
const outputDirectory = new URL("../public/", import.meta.url);

export async function downloadPokemonZoneChampions({ fetcher = fetchText, snapshotDirectory } = {}) {
  const entries = {};

  for (const catalog of CATALOGS) {
    if (snapshotDirectory) {
      entries[catalog] = await readSnapshotCatalog(snapshotDirectory, catalog);
      continue;
    }

    const html = await fetcher(`${POKEMON_ZONE_CHAMPIONS_URL}${catalog}/`);
    entries[catalog] = parsePokemonZoneCatalog(html, catalog);
    if (!snapshotDirectory && catalog !== CATALOGS.at(-1)) await delay(750);
  }

  entries.pokemon = await withPokemonDetails(entries.pokemon, { fetcher, snapshotDirectory });
  return entries;
}

async function readSnapshotCatalog(snapshotDirectory, catalog) {
  const directoryUrl = pathToFileURL(`${snapshotDirectory}/`);
  try {
    return JSON.parse(
      await readFile(new URL(`pokemon-zone-champions-${catalog}.json`, directoryUrl), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const html = await readFile(
    new URL(`pokemon-zone-champions-${catalog}.html`, directoryUrl),
    "utf8",
  );
  return parsePokemonZoneCatalog(html, catalog);
}

async function withPokemonDetails(pokemon, { fetcher, snapshotDirectory }) {
  const detailed = [];

  for (const entry of pokemon) {
    const detail = snapshotDirectory
      ? await readSnapshotPokemonDetail(snapshotDirectory, entry)
      : await fetchPokemonDetail(fetcher, entry);
    detailed.push(detail ? { ...entry, ...detail } : entry);
    if (!snapshotDirectory && entry !== pokemon.at(-1)) await delay(300);
  }

  return detailed;
}

async function fetchPokemonDetail(fetcher, entry) {
  if (!entry.sourceUrl) return null;
  const html = await fetcher(entry.sourceUrl);
  return parsePokemonZonePokemonDetail(html);
}

async function readSnapshotPokemonDetail(snapshotDirectory, entry) {
  const directoryUrl = pathToFileURL(`${snapshotDirectory}/`);
  const slug = pokemonDetailSlug(entry);
  if (!slug) return null;

  try {
    return JSON.parse(
      await readFile(new URL(`pokemon-zone-champions-pokemon-${slug}.json`, directoryUrl), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    const html = await readFile(
      new URL(`pokemon-zone-champions-pokemon-${slug}.html`, directoryUrl),
      "utf8",
    );
    return parsePokemonZonePokemonDetail(html);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return null;
  }
}

function pokemonDetailSlug(entry) {
  try {
    return new URL(entry.sourceUrl).pathname.match(/\/champions\/pokemon\/([^/]+)\//)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function updatePublicData({ snapshotDirectory } = {}) {
  const [pokemon, abilities, moves, items] = await Promise.all([
    readJson("pokemon"),
    readJson("abilities"),
    readJson("moves"),
    readJson("items"),
  ]);
  const catalogs = await downloadPokemonZoneChampions({ snapshotDirectory });
  const merged = mergePokemonZoneCatalogs({ pokemon, abilities, moves, items }, catalogs);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJson("pokemon", merged.pokemon),
    writeJson("abilities", merged.abilities),
    writeJson("moves", merged.moves),
    writeJson("items", merged.items),
  ]);

  return {
    pokemon: catalogs.pokemon.length,
    abilities: catalogs.abilities.length,
    moves: catalogs.moves.length,
    items: catalogs.items.length,
  };
}

async function readJson(name) {
  return JSON.parse(await readFile(new URL(`${name}.json`, outputDirectory), "utf8"));
}

async function writeJson(name, data) {
  await writeFile(new URL(`${name}.json`, outputDirectory), `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+https://www.pokemon-zone.com/champions/; 4 list pages, no retries)",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: ${response.status}. ` +
        "Pokemon Zone may block command-line fetches; use --snapshot-dir with saved catalog pages.",
    );
  }
  return response.text();
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseArguments(argv) {
  const snapshotDirectoryIndex = argv.indexOf("--snapshot-dir");
  return {
    snapshotDirectory:
      snapshotDirectoryIndex === -1 ? undefined : argv[snapshotDirectoryIndex + 1],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const counts = await updatePublicData(parseArguments(process.argv.slice(2)));
    console.log(
      `Updated public/*.json with Pokemon Zone Champions data: ` +
        `${counts.pokemon} Pokémon/forms, ${counts.abilities} abilities, ` +
        `${counts.moves} moves, ${counts.items} items.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

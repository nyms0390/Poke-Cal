import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  LIMITLESS_API_BASE_URL,
  buildLimitlessUsage,
  mergeLimitlessUsage,
} from "../src/limitless-data.js";

const outputDirectory = new URL("../public/", import.meta.url);
const DEFAULT_GAME = "VGC";
const DEFAULT_FORMAT = "M-B";
const DEFAULT_LIMIT = 50;

export async function downloadLimitlessChampionsUsage({
  fetcher = fetchJson,
  game = DEFAULT_GAME,
  format = DEFAULT_FORMAT,
  limit = DEFAULT_LIMIT,
} = {}) {
  const tournaments = (await fetcher(tournamentsUrl({ game, limit }))).filter(
    (tournament) => !format || tournament.format === format,
  );
  const standingsByTournament = new Map();

  for (const tournament of tournaments) {
    standingsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/standings`),
    );
    if (tournament !== tournaments.at(-1)) await delay(250);
  }

  return buildLimitlessUsage(tournaments, standingsByTournament);
}

export async function updatePublicData(options = {}) {
  const [pokemon, abilities, moves, items] = await Promise.all([
    readJson("pokemon"),
    readJson("abilities"),
    readJson("moves"),
    readJson("items"),
  ]);
  const usage = await downloadLimitlessChampionsUsage(options);
  const merged = mergeLimitlessUsage({ pokemon, abilities, moves, items }, usage);

  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeJson("pokemon", merged.pokemon),
    writeJson("abilities", merged.abilities),
    writeJson("moves", merged.moves),
    writeJson("items", merged.items),
  ]);

  return usage;
}

function tournamentsUrl({ game, limit }) {
  const url = new URL(`${LIMITLESS_API_BASE_URL}/tournaments`);
  url.searchParams.set("game", game);
  url.searchParams.set("limit", String(limit));
  return url.href;
}

async function readJson(name) {
  return JSON.parse(await readFile(new URL(`${name}.json`, outputDirectory), "utf8"));
}

async function writeJson(name, data) {
  await writeFile(new URL(`${name}.json`, outputDirectory), `${JSON.stringify(data, null, 2)}\n`);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+https://play.limitlesstcg.com/tournaments; VGC usage)",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

function parseArguments(argv) {
  return {
    game: valueAfter(argv, "--game") ?? DEFAULT_GAME,
    format: valueAfter(argv, "--format") ?? DEFAULT_FORMAT,
    limit: Number(valueAfter(argv, "--limit") ?? DEFAULT_LIMIT),
  };
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const usage = await updatePublicData(parseArguments(process.argv.slice(2)));
    console.log(
      `Updated public/*.json with Limitless Champions usage: ` +
        `${usage.tournamentCount} tournaments, ${usage.teamCount} teams, ` +
        `${usage.pokemon.length} Pokémon/forms.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

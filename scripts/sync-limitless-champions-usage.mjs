import {
  LIMITLESS_API_BASE_URL,
  buildLimitlessUsage,
  mergeLimitlessUsage,
} from "../src/data/limitless-data.js";
import {
  argumentValue,
  isMainModule,
  readJson,
  writeJsonEntries,
} from "./lib/sync-utils.mjs";

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
    readJson(outputDirectory, "pokemon"),
    readJson(outputDirectory, "abilities"),
    readJson(outputDirectory, "moves"),
    readJson(outputDirectory, "items"),
  ]);
  const usage = await downloadLimitlessChampionsUsage(options);
  const merged = mergeLimitlessUsage({ pokemon, abilities, moves, items }, usage);

  await writeJsonEntries(outputDirectory, merged);

  return usage;
}

function tournamentsUrl({ game, limit }) {
  const url = new URL(`${LIMITLESS_API_BASE_URL}/tournaments`);
  url.searchParams.set("game", game);
  url.searchParams.set("limit", String(limit));
  return url.href;
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
    game: argumentValue(argv, "--game") ?? DEFAULT_GAME,
    format: argumentValue(argv, "--format") ?? DEFAULT_FORMAT,
    limit: Number(argumentValue(argv, "--limit") ?? DEFAULT_LIMIT),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (isMainModule(import.meta.url)) {
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

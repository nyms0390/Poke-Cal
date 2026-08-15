import {
  LIMITLESS_API_BASE_URL,
  buildLimitlessUsage,
  mergeLimitlessUsage,
} from "../src/data/limitless-data.js";
import { buildLimitlessTeamArchive } from "../src/data/limitless-teams.js";
import {
  argumentValue,
  isMainModule,
  readJson,
  writeJson,
  writeJsonEntries,
} from "./lib/sync-utils.mjs";

const outputDirectory = new URL("../public/", import.meta.url);
const DEFAULT_GAME = "VGC";
const DEFAULT_FORMAT = "M-B";
const DEFAULT_LIMIT = 50;
const DEFAULT_ARCHIVE_LIMIT = 10;
const API_DELAY_MS = 1250;

export async function downloadLimitlessChampionsData({
  fetcher = fetchJson,
  game = DEFAULT_GAME,
  format = DEFAULT_FORMAT,
  limit = DEFAULT_LIMIT,
  archiveLimit = DEFAULT_ARCHIVE_LIMIT,
  catalogs,
  pokemon,
  items,
} = {}) {
  const tournaments = (await fetcher(tournamentsUrl({ game, format, limit }))).filter(
    (tournament) => !format || tournament.format === format,
  );
  const standingsByTournament = new Map();
  const detailsByTournament = new Map();
  const pairingsByTournament = new Map();

  for (const tournament of tournaments) {
    standingsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/standings`),
    );
    await delay(API_DELAY_MS);
  }

  const archiveTournaments = [];
  for (const tournament of tournaments) {
    detailsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/details`),
    );
    archiveTournaments.push(tournament);
    await delay(API_DELAY_MS);

    const hasBracket = detailsByTournament.get(tournament.id)?.phases?.some((phase) =>
      /bracket/i.test(String(phase?.type ?? "")),
    );
    if (!hasBracket) continue;

    pairingsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/pairings`),
    );
    await delay(API_DELAY_MS);

    const partialArchive = buildLimitlessTeamArchive(
      archiveTournaments,
      detailsByTournament,
      standingsByTournament,
      pairingsByTournament,
      { limit: archiveLimit },
    );
    if (partialArchive.tournaments.length >= archiveLimit) break;
  }

  return {
    usage: buildLimitlessUsage(tournaments, standingsByTournament, catalogs ?? { pokemon, items }),
    teams: buildLimitlessTeamArchive(
      archiveTournaments,
      detailsByTournament,
      standingsByTournament,
      pairingsByTournament,
      { limit: archiveLimit },
    ),
  };
}

export async function downloadLimitlessChampionsUsage(options = {}) {
  const { usage } = await downloadLimitlessChampionsData(options);
  return usage;
}

export async function updatePublicData(options = {}) {
  const [pokemon, abilities, moves, items] = await Promise.all([
    readJson(outputDirectory, "pokemon"),
    readJson(outputDirectory, "abilities"),
    readJson(outputDirectory, "moves"),
    readJson(outputDirectory, "items"),
  ]);
  const { usage, teams } = await downloadLimitlessChampionsData({
    ...options,
    catalogs: { pokemon, items },
  });
  const merged = mergeLimitlessUsage({ pokemon, abilities, moves, items }, usage);

  await writeJsonEntries(outputDirectory, merged);
  await writeJson(outputDirectory, "limitless-teams", teams);

  return { usage, teams };
}

function tournamentsUrl({ game, format, limit }) {
  const url = new URL(`${LIMITLESS_API_BASE_URL}/tournaments`);
  url.searchParams.set("game", game);
  if (format) url.searchParams.set("format", format);
  url.searchParams.set("limit", String(limit));
  return url.href;
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "PokéCal data sync (+https://play.limitlesstcg.com/tournaments; VGC usage)",
      },
    });
    if (response.ok) return response.json();
    if (response.status !== 429 || attempt === 3) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    await delay(retryDelay(response, attempt));
  }
  throw new Error(`Failed to fetch ${url}: rate limit retry exhausted`);
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
  const resetSeconds = Number(/(?:^|;\s*)t=(\d+)/.exec(response.headers.get("ratelimit") ?? "")?.[1]);
  if (Number.isFinite(resetSeconds) && resetSeconds >= 0) return (resetSeconds + 1) * 1000;
  return 1000 * 2 ** attempt;
}

function parseArguments(argv) {
  return {
    game: argumentValue(argv, "--game") ?? DEFAULT_GAME,
    format: argumentValue(argv, "--format") ?? DEFAULT_FORMAT,
    limit: Number(argumentValue(argv, "--limit") ?? DEFAULT_LIMIT),
    archiveLimit: Number(argumentValue(argv, "--archive-limit") ?? DEFAULT_ARCHIVE_LIMIT),
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (isMainModule(import.meta.url)) {
  try {
    const { usage, teams } = await updatePublicData(parseArguments(process.argv.slice(2)));
    console.log(
      `Updated public/*.json with Limitless Champions usage: ` +
        `${usage.tournamentCount} tournaments, ${usage.teamCount} teams, ` +
        `${usage.pokemon.length} Pokémon/forms; ` +
        `archived ${teams.tournaments.length} tournament team lists.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

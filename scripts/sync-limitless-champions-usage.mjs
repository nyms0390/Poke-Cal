import {
  LIMITLESS_API_BASE_URL,
  buildLimitlessUsage,
  mergeLimitlessUsage,
} from "../src/data/limitless-data.js";
import { buildLimitlessTeamArchive } from "../src/data/limitless-teams.js";
import { METRIC_GROUPS, assertValidCatalogs } from "../src/data/catalog-validation.js";
import {
  argumentValue,
  delay,
  fetchJson as fetchUpstreamJson,
  hasFlag,
  isMainModule,
  readJson,
  readJsonIfExists,
  writeJson,
  writeJsonEntries,
} from "./lib/sync-utils.mjs";

const outputDirectory = new URL("../public/", import.meta.url);
const DEFAULT_GAME = "VGC";
const DEFAULT_FORMAT = "M-C";
const DEFAULT_FALLBACK_FORMAT = "M-B";
const DEFAULT_LIMIT = 50;
const DEFAULT_ARCHIVE_LIMIT = 10;
const API_DELAY_MS = 1250;

export async function downloadLimitlessChampionsData({
  fetcher = fetchJson,
  game = DEFAULT_GAME,
  format = DEFAULT_FORMAT,
  limit = DEFAULT_LIMIT,
  archiveLimit = DEFAULT_ARCHIVE_LIMIT,
  apiDelayMs = API_DELAY_MS,
  catalogs,
  pokemon,
  items,
} = {}) {
  let selectedFormat = format;
  let tournaments = tournamentList(await fetcher(tournamentsUrl({ game, format, limit }))).filter(
    (tournament) => !format || tournament.format === format,
  );
  if (tournaments.length === 0 && format === DEFAULT_FORMAT) {
    selectedFormat = DEFAULT_FALLBACK_FORMAT;
    tournaments = tournamentList(
      await fetcher(tournamentsUrl({ game, format: selectedFormat, limit })),
    ).filter((tournament) => tournament.format === selectedFormat);
  }
  const standingsByTournament = new Map();
  const detailsByTournament = new Map();
  const pairingsByTournament = new Map();

  for (const tournament of tournaments) {
    standingsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/standings`),
    );
    await delay(apiDelayMs);
  }

  const archiveTournaments = [];
  for (const tournament of tournaments) {
    detailsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/details`),
    );
    archiveTournaments.push(tournament);
    await delay(apiDelayMs);

    const hasBracket = detailsByTournament.get(tournament.id)?.phases?.some((phase) =>
      /bracket/i.test(String(phase?.type ?? "")),
    );
    if (!hasBracket) continue;

    pairingsByTournament.set(
      tournament.id,
      await fetcher(`${LIMITLESS_API_BASE_URL}/tournaments/${tournament.id}/pairings`),
    );
    await delay(apiDelayMs);

    const partialArchive = buildLimitlessTeamArchive(
      archiveTournaments,
      detailsByTournament,
      standingsByTournament,
      pairingsByTournament,
      { limit: archiveLimit, format: selectedFormat },
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
      { limit: archiveLimit, format: selectedFormat },
    ),
  };
}

export async function downloadLimitlessChampionsUsage(options = {}) {
  const { usage } = await downloadLimitlessChampionsData(options);
  return usage;
}

// Fails closed: when the fresh usage/team archive fails the Limitless checks in
// src/data/catalog-validation.js (e.g. Limitless returned no tournaments), nothing is written.
export async function updatePublicData({
  directory = outputDirectory,
  allowShrink = false,
  minimums,
  ...options
} = {}) {
  const [pokemon, abilities, moves, items, previousTeams] = await Promise.all([
    readJson(directory, "pokemon"),
    readJson(directory, "abilities"),
    readJson(directory, "moves"),
    readJson(directory, "items"),
    readJsonIfExists(directory, "limitless-teams"),
  ]);
  const { usage, teams } = await downloadLimitlessChampionsData({
    ...options,
    catalogs: { pokemon, items },
  });
  const merged = mergeLimitlessUsage({ pokemon, abilities, moves, items }, usage);

  assertValidCatalogs(
    { ...merged, teams },
    {
      label: "Limitless usage and team archive",
      baseline: { pokemon, abilities, moves, items, teams: previousTeams },
      metrics: METRIC_GROUPS.limitless,
      allowShrink,
      ...(minimums ? { minimums } : {}),
    },
  );

  await writeJsonEntries(directory, merged);
  await writeJson(directory, "limitless-teams", teams);

  return { usage, teams };
}

function tournamentList(value) {
  if (!Array.isArray(value)) {
    throw new Error("Limitless /tournaments did not return a JSON array.");
  }
  return value;
}

function tournamentsUrl({ game, format, limit }) {
  const url = new URL(`${LIMITLESS_API_BASE_URL}/tournaments`);
  url.searchParams.set("game", game);
  if (format) url.searchParams.set("format", format);
  url.searchParams.set("limit", String(limit));
  return url.href;
}

function fetchJson(url) {
  return fetchUpstreamJson(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+https://play.limitlesstcg.com/tournaments; VGC usage)",
    },
  });
}

function parseArguments(argv) {
  return {
    game: argumentValue(argv, "--game") ?? DEFAULT_GAME,
    format: argumentValue(argv, "--format") ?? DEFAULT_FORMAT,
    limit: Number(argumentValue(argv, "--limit") ?? DEFAULT_LIMIT),
    archiveLimit: Number(argumentValue(argv, "--archive-limit") ?? DEFAULT_ARCHIVE_LIMIT),
    allowShrink: hasFlag(argv, "--allow-shrink"),
  };
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

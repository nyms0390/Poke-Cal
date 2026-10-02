import {
  SMOGON_STATS_URL,
  buildSmogonSpreads,
  chaosUrl,
  discoverChampionsFormats,
  mergeSmogonSpreads,
  statsMonths,
} from "../src/data/smogon-data.js";
import { METRIC_GROUPS, assertValidCatalogs } from "../src/data/catalog-validation.js";
import {
  argumentValue,
  fetchText as fetchUpstreamText,
  hasFlag,
  isMainModule,
  readJson,
  writeJson,
} from "./lib/sync-utils.mjs";

const outputDirectory = new URL("../public/", import.meta.url);
const DEFAULT_CUTOFF = 1760;
const DEFAULT_TOP = 6;
// Smogon publishes a new month directory before every metagame's stats are in it; with
// `--month latest` we walk back at most this many months to find Champions formats.
export const MAX_MONTH_FALLBACK = 3;

export async function downloadSmogonChampionsSpreads({
  fetcher = fetchText,
  month = "latest",
  formats = "auto",
  cutoff = DEFAULT_CUTOFF,
  top = DEFAULT_TOP,
  maxMonthFallback = MAX_MONTH_FALLBACK,
} = {}) {
  const { month: resolvedMonth, formats: resolvedFormats } = await resolveMonthAndFormats({
    fetcher,
    month,
    formats,
    cutoff,
    maxMonthFallback,
  });

  const chaosDataList = [];
  for (const format of resolvedFormats) {
    const url = chaosUrl({ month: resolvedMonth, format, cutoff });
    try {
      chaosDataList.push(JSON.parse(await fetcher(url)));
    } catch (error) {
      console.warn(`Skipping ${url}: ${error.message}`);
    }
  }
  if (chaosDataList.length === 0) {
    throw new Error(`Failed to download any chaos stats for ${resolvedFormats.join(", ")}.`);
  }

  return buildSmogonSpreads(chaosDataList, { top, month: resolvedMonth });
}

async function resolveMonthAndFormats({ fetcher, month, formats, cutoff, maxMonthFallback }) {
  const explicitFormats =
    formats === "auto"
      ? null
      : formats
          .split(",")
          .map((format) => format.trim())
          .filter(Boolean);
  if (explicitFormats && explicitFormats.length === 0) {
    throw new Error("--formats did not name any formats.");
  }

  let candidateMonths;
  if (month === "latest") {
    candidateMonths = statsMonths(await fetcher(SMOGON_STATS_URL)).slice(
      0,
      Math.max(1, maxMonthFallback),
    );
    if (candidateMonths.length === 0) {
      throw new Error(`No monthly stats directories found at ${SMOGON_STATS_URL}`);
    }
  } else {
    candidateMonths = [month];
  }
  if (explicitFormats) return { month: candidateMonths[0], formats: explicitFormats };

  for (const candidate of candidateMonths) {
    let chaosIndex;
    try {
      chaosIndex = await fetcher(`${SMOGON_STATS_URL}${candidate}/chaos/`);
    } catch (error) {
      console.warn(`Skipping ${candidate}: ${error.message}`);
      continue;
    }
    const discovered = discoverChampionsFormats(chaosIndex, { cutoff });
    if (discovered.length > 0) {
      if (candidate !== candidateMonths[0]) {
        console.warn(
          `No Champions VGC stats in ${candidateMonths[0]} yet; using ${candidate} instead.`,
        );
      }
      return { month: candidate, formats: discovered };
    }
  }

  throw new Error(
    `No Champions VGC chaos stats found for ${candidateMonths.join(", ")} at cutoff ${cutoff}. ` +
      `Pass --month/--formats to select them explicitly.`,
  );
}

// Fails closed: when the merged catalog fails the Smogon checks in
// src/data/catalog-validation.js (e.g. chaos files without data), nothing is written.
export async function updatePublicData({
  directory = outputDirectory,
  allowShrink = false,
  minimums,
  ...options
} = {}) {
  const pokemon = await readJson(directory, "pokemon");
  const usage = await downloadSmogonChampionsSpreads(options);
  const merged = mergeSmogonSpreads(pokemon, usage);

  assertValidCatalogs(
    { pokemon: merged },
    {
      label: "Smogon SP spreads",
      baseline: { pokemon },
      metrics: METRIC_GROUPS.smogon,
      allowShrink,
      ...(minimums ? { minimums } : {}),
    },
  );

  await writeJson(directory, "pokemon", merged);

  return usage;
}

function fetchText(url) {
  return fetchUpstreamText(url, {
    // Directory listings are HTML; chaos stats must be JSON.
    expect: url.endsWith("/") ? "html" : "text",
    headers: {
      "User-Agent": "PokéCal data sync (+https://www.smogon.com/stats/; Champions SP spreads)",
    },
  });
}

function parseArguments(argv) {
  return {
    month: argumentValue(argv, "--month") ?? "latest",
    formats: argumentValue(argv, "--formats") ?? "auto",
    cutoff: Number(argumentValue(argv, "--cutoff") ?? DEFAULT_CUTOFF),
    top: Number(argumentValue(argv, "--top") ?? DEFAULT_TOP),
    allowShrink: hasFlag(argv, "--allow-shrink"),
  };
}

if (isMainModule(import.meta.url)) {
  try {
    const usage = await updatePublicData(parseArguments(process.argv.slice(2)));
    console.log(
      `Updated public/pokemon.json with Smogon Champions SP spreads: ` +
        `${usage.month}, ${usage.formats.join(" + ")} (cutoff ${usage.cutoff}), ` +
        `${usage.pokemon.length} Pokémon/forms.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

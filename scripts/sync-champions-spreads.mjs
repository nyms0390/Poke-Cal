import {
  SMOGON_STATS_URL,
  buildSmogonSpreads,
  chaosUrl,
  discoverChampionsFormats,
  latestStatsMonth,
  mergeSmogonSpreads,
} from "../src/data/smogon-data.js";
import { argumentValue, isMainModule, readJson, writeJson } from "./lib/sync-utils.mjs";

const outputDirectory = new URL("../public/", import.meta.url);
const DEFAULT_CUTOFF = 1760;
const DEFAULT_TOP = 6;

export async function downloadSmogonChampionsSpreads({
  fetcher = fetchText,
  month = "latest",
  formats = "auto",
  cutoff = DEFAULT_CUTOFF,
  top = DEFAULT_TOP,
} = {}) {
  const resolvedMonth =
    month === "latest" ? latestStatsMonth(await fetcher(SMOGON_STATS_URL)) : month;
  if (!resolvedMonth) throw new Error(`No monthly stats directories found at ${SMOGON_STATS_URL}`);

  const resolvedFormats =
    formats === "auto"
      ? discoverChampionsFormats(await fetcher(`${SMOGON_STATS_URL}${resolvedMonth}/chaos/`), {
          cutoff,
        })
      : formats
          .split(",")
          .map((format) => format.trim())
          .filter(Boolean);
  if (resolvedFormats.length === 0) {
    throw new Error(
      `No Champions VGC chaos stats found for ${resolvedMonth} at cutoff ${cutoff}. ` +
        `Pass --formats to select formats explicitly.`,
    );
  }

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

export async function updatePublicData(options = {}) {
  const pokemon = await readJson(outputDirectory, "pokemon");
  const usage = await downloadSmogonChampionsSpreads(options);
  const merged = mergeSmogonSpreads(pokemon, usage);

  await writeJson(outputDirectory, "pokemon", merged);

  return usage;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+https://www.smogon.com/stats/; Champions SP spreads)",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function parseArguments(argv) {
  return {
    month: argumentValue(argv, "--month") ?? "latest",
    formats: argumentValue(argv, "--formats") ?? "auto",
    cutoff: Number(argumentValue(argv, "--cutoff") ?? DEFAULT_CUTOFF),
    top: Number(argumentValue(argv, "--top") ?? DEFAULT_TOP),
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

import {
  NCP_SETDEX_URL,
  buildNcpSets,
  mergeNcpSets,
  parseNcpSetdex,
} from "../src/data/ncp-data.js";
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

export async function downloadNcpSets({ fetcher = fetchText, url = NCP_SETDEX_URL } = {}) {
  return buildNcpSets(parseNcpSetdex(await fetcher(url)), { dataUrl: url });
}

// Fails closed: when the merged catalog fails the NCP checks in src/data/catalog-validation.js
// (e.g. the setdex was `var SETDEX_GEN10 = {};`), nothing is written.
export async function updatePublicData({
  directory = outputDirectory,
  allowShrink = false,
  minimums,
  ...options
} = {}) {
  const pokemon = await readJson(directory, "pokemon");
  const ncp = await downloadNcpSets(options);
  const merged = mergeNcpSets(pokemon, ncp);

  assertValidCatalogs(
    { pokemon: merged },
    {
      label: "NCP curated sets",
      baseline: { pokemon },
      metrics: METRIC_GROUPS.ncp,
      allowShrink,
      ...(minimums ? { minimums } : {}),
    },
  );

  await writeJson(directory, "pokemon", merged);

  return ncp;
}

function fetchText(url) {
  return fetchUpstreamText(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+NCP Champions curated sets)",
    },
  });
}

if (isMainModule(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    const ncp = await updatePublicData({
      url: argumentValue(argv, "--url") ?? NCP_SETDEX_URL,
      allowShrink: hasFlag(argv, "--allow-shrink"),
    });
    const setCount = ncp.pokemon.reduce((sum, entry) => sum + entry.sets.length, 0);
    console.log(
      `Updated public/pokemon.json with NCP Champions sets: ` +
        `${ncp.pokemon.length} Pokémon, ${setCount} sets.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

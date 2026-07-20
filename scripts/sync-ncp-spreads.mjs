import {
  NCP_SETDEX_URL,
  buildNcpSets,
  mergeNcpSets,
  parseNcpSetdex,
} from "../src/data/ncp-data.js";
import { argumentValue, isMainModule, readJson, writeJson } from "./lib/sync-utils.mjs";

const outputDirectory = new URL("../public/", import.meta.url);

export async function downloadNcpSets({ fetcher = fetchText, url = NCP_SETDEX_URL } = {}) {
  return buildNcpSets(parseNcpSetdex(await fetcher(url)), { dataUrl: url });
}

export async function updatePublicData(options = {}) {
  const pokemon = await readJson(outputDirectory, "pokemon");
  const ncp = await downloadNcpSets(options);
  const merged = mergeNcpSets(pokemon, ncp);

  await writeJson(outputDirectory, "pokemon", merged);

  return ncp;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PokéCal data sync (+NCP Champions curated sets)",
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

if (isMainModule(import.meta.url)) {
  try {
    const ncp = await updatePublicData({
      url: argumentValue(process.argv.slice(2), "--url") ?? NCP_SETDEX_URL,
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

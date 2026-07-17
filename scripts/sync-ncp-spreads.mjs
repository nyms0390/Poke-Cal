import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  NCP_SETDEX_URL,
  buildNcpSets,
  mergeNcpSets,
  parseNcpSetdex,
} from "../src/data/ncp-data.js";

const outputDirectory = new URL("../public/", import.meta.url);

export async function downloadNcpSets({ fetcher = fetchText, url = NCP_SETDEX_URL } = {}) {
  return buildNcpSets(parseNcpSetdex(await fetcher(url)), { dataUrl: url });
}

export async function updatePublicData(options = {}) {
  const pokemon = JSON.parse(
    await readFile(new URL("pokemon.json", outputDirectory), "utf8"),
  );
  const ncp = await downloadNcpSets(options);
  const merged = mergeNcpSets(pokemon, ncp);

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    new URL("pokemon.json", outputDirectory),
    `${JSON.stringify(merged, null, 2)}\n`,
  );

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const ncp = await updatePublicData({
      url: valueAfter(process.argv.slice(2), "--url") ?? NCP_SETDEX_URL,
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

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

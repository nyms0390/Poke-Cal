// Derives the slim browser catalogs in public/web/*.json from the full public/*.json catalogs
// (see src/data/web-catalogs.js). Run after any sync; `npm run sync-all` does this last.
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import {
  WEB_CATALOG_NAMES,
  deriveWebCatalogs,
  serializeWebCatalog,
} from "../src/data/web-catalogs.js";
import { isMainModule, readJson } from "./lib/sync-utils.mjs";

const sourceDirectory = new URL("../public/", import.meta.url);
const webDirectory = new URL("../public/web/", import.meta.url);

export async function readFullCatalogs(directory = sourceDirectory) {
  const [pokemon, abilities, moves, items, teams] = await Promise.all(
    ["pokemon", "abilities", "moves", "items", "limitless-teams"].map((name) =>
      readJson(directory, name),
    ),
  );
  return { pokemon, abilities, moves, items, teams };
}

export async function buildWebCatalogs({
  source = sourceDirectory,
  output = webDirectory,
} = {}) {
  const derived = deriveWebCatalogs(await readFullCatalogs(source));
  await mkdir(output, { recursive: true });
  const files = WEB_CATALOG_NAMES.map((name) => ({
    name,
    contents: serializeWebCatalog(derived[name]),
  }));
  await Promise.all(
    files.map(({ name, contents }) => writeFile(new URL(`${name}.json`, output), contents)),
  );
  return files.map(({ name, contents }) => ({
    name,
    entries: Array.isArray(derived[name]) ? derived[name].length : undefined,
    bytes: Buffer.byteLength(contents),
    gzipBytes: gzipSync(contents).length,
  }));
}

if (isMainModule(import.meta.url)) {
  try {
    const files = await buildWebCatalogs();
    for (const { name, entries, bytes, gzipBytes } of files) {
      const count = entries === undefined ? "" : ` (${entries} entries)`;
      console.log(`public/web/${name}.json${count}: ${bytes} bytes, ${gzipBytes} gzip`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

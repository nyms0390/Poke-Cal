// Derives the slim browser catalogs in public/web/*.json (see src/data/web-catalogs.js) and the
// minified MCP Worker catalogs in public/mcp-catalogs/*.json (see scripts/lib/mcp-catalogs.mjs)
// from the full public/*.json catalogs. Run after any sync; `npm run sync-all` does this last.
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import {
  WEB_CATALOG_NAMES,
  deriveWebCatalogs,
  serializeWebCatalog,
} from "../src/data/web-catalogs.js";
import {
  MCP_CATALOG_DIRECTORY,
  MCP_CATALOG_NAMES,
  deriveMcpCatalogs,
  serializeMcpCatalog,
} from "./lib/mcp-catalogs.mjs";
import { isMainModule, readJson } from "./lib/sync-utils.mjs";

const sourceDirectory = new URL("../public/", import.meta.url);
const webDirectory = new URL("../public/web/", import.meta.url);
const mcpDirectory = new URL(`../public/${MCP_CATALOG_DIRECTORY}/`, import.meta.url);

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

export async function buildMcpCatalogs({
  source = sourceDirectory,
  output = mcpDirectory,
} = {}) {
  const derived = deriveMcpCatalogs(await readFullCatalogs(source));
  await mkdir(output, { recursive: true });
  const files = MCP_CATALOG_NAMES.map((name) => ({
    name,
    contents: serializeMcpCatalog(derived[name]),
  }));
  await Promise.all(
    files.map(({ name, contents }) => writeFile(new URL(`${name}.json`, output), contents)),
  );
  return files.map(({ name, contents }) => ({
    name,
    entries: derived[name].length,
    bytes: Buffer.byteLength(contents),
    gzipBytes: gzipSync(contents).length,
  }));
}

if (isMainModule(import.meta.url)) {
  try {
    const outputs = [
      ["public/web", await buildWebCatalogs()],
      [`public/${MCP_CATALOG_DIRECTORY}`, await buildMcpCatalogs()],
    ];
    for (const [directory, files] of outputs) {
      for (const { name, entries, bytes, gzipBytes } of files) {
        const count = entries === undefined ? "" : ` (${entries} entries)`;
        console.log(`${directory}/${name}.json${count}: ${bytes} bytes, ${gzipBytes} gzip`);
      }
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

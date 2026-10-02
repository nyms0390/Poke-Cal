// Validates the generated catalogs in public/ (or --dir) against the absolute minimums and the
// maximum-shrink rule in src/data/catalog-validation.js. With --baseline <dir>, every metric may
// shrink by at most --max-shrink (default 0.25) versus the catalogs in that directory.
//
//   node scripts/validate-data.mjs [--dir public] [--baseline <dir>] [--max-shrink 0.25]
//                                  [--allow-shrink] [--json]
//
// Exits 1 (after listing every failed check) when validation fails.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_MAX_SHRINK,
  DEFAULT_MINIMUMS,
  METRIC_NAMES,
  computeCatalogMetrics,
  validateCatalogMetrics,
} from "../src/data/catalog-validation.js";
import { argumentValue, hasFlag, isMainModule, readCatalogs } from "./lib/sync-utils.mjs";

const defaultDirectory = new URL("../public/", import.meta.url);

export async function validateDataDirectory({
  directory = defaultDirectory,
  baselineDirectory,
  maxShrink = DEFAULT_MAX_SHRINK,
  allowShrink = false,
} = {}) {
  const metrics = computeCatalogMetrics(await readCatalogs(toDirectoryUrl(directory)));
  const baseline = baselineDirectory
    ? computeCatalogMetrics(await readCatalogs(toDirectoryUrl(baselineDirectory)))
    : undefined;
  return { ...validateCatalogMetrics(metrics, { baseline, maxShrink, allowShrink }), baseline };
}

export function formatReport({ metrics, baseline, errors }) {
  const rows = METRIC_NAMES.map((name) => {
    const value = metrics[name] ?? "missing";
    const before = baseline ? ` (baseline ${baseline[name] ?? "missing"})` : "";
    return `  ${name.padEnd(28)} ${String(value).padStart(6)}  min ${DEFAULT_MINIMUMS[name]}${before}`;
  });
  const status = errors.length === 0 ? "OK" : `FAILED (${errors.length})`;
  return [
    "Catalog metrics:",
    ...rows,
    `Validation ${status}`,
    ...errors.map((error) => `  - ${error}`),
  ].join("\n");
}

function toDirectoryUrl(directory) {
  if (directory instanceof URL) return directory;
  return pathToFileURL(`${resolve(directory)}/`);
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    const result = await validateDataDirectory({
      directory: argumentValue(argv, "--dir") ?? defaultDirectory,
      baselineDirectory: argumentValue(argv, "--baseline"),
      maxShrink: Number(argumentValue(argv, "--max-shrink") ?? DEFAULT_MAX_SHRINK),
      allowShrink: hasFlag(argv, "--allow-shrink"),
    });
    console.log(hasFlag(argv, "--json") ? JSON.stringify(result, null, 2) : formatReport(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

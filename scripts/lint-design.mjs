// Checks src/styles.css, the HTML entry points, and src/**/*.js against the static parts of
// DESIGN.md (rules in scripts/lib/design-lint.mjs). Known violations live in
// scripts/design-lint-baseline.json: a new violation fails, and so does a baseline entry nothing
// matches any more, so the baseline only shrinks.
//
//   node scripts/lint-design.mjs [--update-baseline] [--all] [--json]
//
// --all lists every violation, baseline included, grouped by rule. Exits 1 on new or stale entries.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { RULES, compareWithBaseline, lintCss, lintHtml, lintScript } from "./lib/design-lint.mjs";
import { hasFlag, isMainModule } from "./lib/sync-utils.mjs";

const rootUrl = new URL("../", import.meta.url);
export const BASELINE_URL = new URL("design-lint-baseline.json", import.meta.url);

async function scriptFiles(directory) {
  const entries = await readdir(new URL(directory, rootUrl), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) return scriptFiles(`${path}/`);
    return entry.name.endsWith(".js") ? [path] : [];
  }));
  return nested.flat();
}

export async function lintDesign() {
  const read = (path) => readFile(new URL(path, rootUrl), "utf8");
  const pages = (await readdir(rootUrl)).filter((name) => name.endsWith(".html")).sort();
  const scripts = (await scriptFiles("src/")).sort();
  return [
    ...lintCss(await read("src/styles.css"), { file: "src/styles.css" }),
    ...(await Promise.all(pages.map(async (file) => lintHtml(await read(file), { file })))).flat(),
    ...(await Promise.all(scripts.map(async (file) => lintScript(await read(file), { file })))).flat(),
  ];
}

export async function readBaseline() {
  return JSON.parse(await readFile(BASELINE_URL, "utf8"));
}

function formatFinding(finding) {
  return `  ${finding.file}:${finding.line}  ${finding.key}`;
}

export function formatReport({ findings, fresh, stale, all = false }) {
  const lines = [];
  if (all) {
    for (const rule of Object.keys(RULES)) {
      const matching = findings.filter((finding) => finding.rule === rule);
      if (matching.length === 0) continue;
      lines.push(`${rule} (${matching.length}): ${RULES[rule]}`, ...matching.map(formatFinding));
    }
  }
  for (const finding of fresh) {
    lines.push(`${finding.file}:${finding.line}  ${finding.rule}: ${RULES[finding.rule]}`, `    ${finding.key}`);
  }
  if (stale.length > 0) {
    lines.push("Fixed, remove from scripts/design-lint-baseline.json (or run with --update-baseline):",
      ...stale.map((key) => `  ${key}`));
  }
  const known = findings.length - fresh.length;
  lines.push(fresh.length === 0 && stale.length === 0
    ? `Design lint OK (${known} known violations in the baseline)`
    : `Design lint FAILED: ${fresh.length} new, ${stale.length} stale baseline entries`);
  return lines.join("\n");
}

if (isMainModule(import.meta.url)) {
  const argv = process.argv.slice(2);
  const findings = await lintDesign();
  if (hasFlag(argv, "--update-baseline")) {
    const keys = findings.map((finding) => finding.key).sort();
    await writeFile(BASELINE_URL, `${JSON.stringify(keys, null, 2)}\n`);
    console.log(`Wrote ${keys.length} entries to ${fileURLToPath(BASELINE_URL)}`);
  } else {
    const { fresh, stale } = compareWithBaseline(findings, await readBaseline());
    if (hasFlag(argv, "--json")) console.log(JSON.stringify({ findings, fresh, stale }, null, 2));
    else console.log(formatReport({ findings, fresh, stale, all: hasFlag(argv, "--all") }));
    process.exitCode = fresh.length === 0 && stale.length === 0 ? 0 : 1;
  }
}

// Fails when `npm audit` reports a high or critical advisory in the MCP Worker's dependency tree,
// except for the advisories listed below. Run with `npm run audit` from mcp/.
import { execFileSync } from "node:child_process";

// Each entry needs a reason it cannot reach the deployed Worker. Remove it once a fixed version
// exists (`npm audit` then shows "fix available" for it) and the update has landed.
const IGNORED = new Map([
  [
    "GHSA-fc5q-39xc-vjpf",
    "picomatch ReDoS: no patched release. Only agents -> @rolldown/plugin-babel (a Vite build plugin) " +
      "pulls it in, and it is not in the wrangler bundle, so the Worker never runs it.",
  ],
]);
const FAILING = new Set(["high", "critical"]);

function runAudit() {
  try {
    return execFileSync("npm", ["audit", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  } catch (error) {
    // npm audit exits non-zero whenever it finds anything; the JSON report is still on stdout.
    if (error.stdout) return error.stdout;
    throw error;
  }
}

function advisoryId(url) {
  return url?.match(/GHSA-[\w-]+$/)?.[0] ?? url;
}

const report = JSON.parse(runAudit());
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(2);
}

const blocking = [];
const ignored = new Set();
for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vulnerability.via) {
    // String entries point at another vulnerable package, which has its own entry.
    if (typeof via === "string" || !FAILING.has(via.severity)) continue;
    const id = advisoryId(via.url);
    if (IGNORED.has(id)) {
      ignored.add(id);
    } else {
      blocking.push(`${via.severity}: ${via.name} ${via.range} — ${via.title} (${via.url})`);
    }
  }
}

for (const id of ignored) console.log(`Ignored ${id}: ${IGNORED.get(id)}`);
for (const id of IGNORED.keys()) {
  if (!ignored.has(id)) console.log(`Note: ${id} is no longer reported; remove it from IGNORED in scripts/check-audit.mjs.`);
}
if (blocking.length > 0) {
  console.error(`npm audit found ${blocking.length} high or critical advisories:\n${[...new Set(blocking)].join("\n")}`);
  process.exit(1);
}
console.log("npm audit: no unignored high or critical advisories.");

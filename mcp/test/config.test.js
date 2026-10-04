import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));

// wrangler.jsonc allows full-line // comments; strip them before JSON.parse.
function parseJsonc(text) {
  return JSON.parse(text.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n"));
}

test("Wrangler runs the Worker for MCP and health paths without a zone route", async () => {
  const config = parseJsonc(await readFile(configPath, "utf8"));
  assert.equal("route" in config, false);
  assert.equal("routes" in config, false);
  assert.deepEqual(config.assets.run_worker_first, ["/mcp", "/health"]);
});

test("Wrangler rate-limit namespace uses the project's own id, not the docs example", async () => {
  const text = await readFile(configPath, "utf8");
  const config = parseJsonc(text);
  const limiter = config.ratelimits.find(({ name }) => name === "MCP_RATE_LIMITER");
  assert.ok(limiter);
  assert.equal(limiter.namespace_id, "20261");
  assert.deepEqual(limiter.simple, { limit: 120, period: 60 });
  assert.doesNotMatch(text, /OWNER ACTION REQUIRED/);
  assert.match(text, /unique[\s\S]*"namespace_id"/);
  const readme = await readFile(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  assert.match(readme, /namespace_id/);
  assert.match(readme, /"20261"/);
});

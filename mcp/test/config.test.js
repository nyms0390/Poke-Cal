import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

test("Wrangler runs the Worker for MCP and health paths without a zone route", async () => {
  const configPath = fileURLToPath(new URL("../wrangler.jsonc", import.meta.url));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal("route" in config, false);
  assert.equal("routes" in config, false);
  assert.deepEqual(config.assets.run_worker_first, ["/mcp", "/health"]);
});

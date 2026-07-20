import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  argumentValue,
  isMainModule,
  readJson,
  writeJson,
  writeJsonEntries,
} from "../scripts/lib/sync-utils.mjs";

test("reads command-line flag values", () => {
  const argv = ["--month", "2026-06", "--top", "8"];

  assert.equal(argumentValue(argv, "--month"), "2026-06");
  assert.equal(argumentValue(argv, "--top"), "8");
  assert.equal(argumentValue(argv, "--cutoff"), undefined);
});

test("detects whether an ES module is the process entry point", () => {
  const moduleUrl = pathToFileURL("/tmp/pokecal-script.mjs").href;

  assert.equal(isMainModule(moduleUrl, ["node", "/tmp/pokecal-script.mjs"]), true);
  assert.equal(isMainModule(moduleUrl, ["node", "/tmp/other-script.mjs"]), false);
  assert.equal(isMainModule(moduleUrl, ["node"]), false);
});

test("reads and writes consistently formatted JSON catalogs", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pokecal-sync-utils-"));
  const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);

  try {
    await writeJsonEntries(directoryUrl, {
      pokemon: [{ id: "pikachu" }],
      moves: [{ id: "thunderbolt" }],
    });
    await writeJson(directoryUrl, "items", [{ id: "lightball" }]);

    assert.deepEqual(await readJson(directoryUrl, "pokemon"), [{ id: "pikachu" }]);
    assert.equal(
      await readFile(new URL("items.json", directoryUrl), "utf8"),
      '[\n  {\n    "id": "lightball"\n  }\n]\n',
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

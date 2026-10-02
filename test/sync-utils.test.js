import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  argumentValue,
  fetchJson,
  fetchText,
  fetchWithRetry,
  hasFlag,
  isMainModule,
  looksLikeHtml,
  readCatalogs,
  readJson,
  retryDelay,
  writeJson,
  writeJsonEntries,
} from "../scripts/lib/sync-utils.mjs";

function fakeFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    const { status = 200, body = "", headers = {} } = next;
    return new Response(body, { status, headers });
  };
  return { fetchImpl, calls };
}

const noSleep = async () => {};

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

test("detects boolean flags", () => {
  assert.equal(hasFlag(["--allow-shrink"], "--allow-shrink"), true);
  assert.equal(hasFlag([], "--allow-shrink"), false);
});

test("reads all catalogs, treating missing files as undefined", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "pokecal-sync-utils-"));
  const directoryUrl = pathToFileURL(`${temporaryDirectory}/`);
  try {
    await writeJson(directoryUrl, "pokemon", [{ id: "pikachu" }]);
    const catalogs = await readCatalogs(directoryUrl);
    assert.deepEqual(catalogs.pokemon, [{ id: "pikachu" }]);
    assert.equal(catalogs.teams, undefined);
    assert.equal(catalogs.moves, undefined);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("fetch helper passes a timeout signal and returns text or parsed JSON", async () => {
  const { fetchImpl, calls } = fakeFetch([
    { body: "export const Pokedex = {};", headers: { "content-type": "text/plain" } },
    { body: '[{"id":1}]', headers: { "content-type": "application/json" } },
  ]);

  assert.equal(await fetchText("https://example.test/a.ts", { fetchImpl }), "export const Pokedex = {};");
  assert.deepEqual(await fetchJson("https://example.test/b", { fetchImpl, headers: { "User-Agent": "x" } }), [
    { id: 1 },
  ]);
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(calls[1].init.headers, { "User-Agent": "x" });
});

test("fetch helper retries network errors, timeouts, and 5xx with backoff", async () => {
  const timeout = new DOMException("timed out", "TimeoutError");
  const { fetchImpl, calls } = fakeFetch([
    new TypeError("fetch failed"),
    timeout,
    { status: 503 },
    { body: "ok" },
  ]);
  const sleeps = [];

  const body = await fetchWithRetry("https://example.test/data.csv", {
    fetchImpl,
    retries: 3,
    baseDelayMs: 10,
    sleep: async (ms) => sleeps.push(ms),
  });

  assert.equal(body, "ok");
  assert.equal(calls.length, 4);
  assert.deepEqual(sleeps, [10, 20, 40]);
});

test("fetch helper gives up after the retry budget", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 502 }, { status: 502 }, { status: 502 }]);
  await assert.rejects(
    fetchWithRetry("https://example.test/x", { fetchImpl, retries: 2, sleep: noSleep }),
    /HTTP 502/,
  );
  assert.equal(calls.length, 3);
});

test("fetch helper does not retry 4xx and honors Retry-After on 429", async () => {
  const notFound = fakeFetch([{ status: 404 }, { body: "never" }]);
  await assert.rejects(
    fetchWithRetry("https://example.test/missing", { fetchImpl: notFound.fetchImpl, sleep: noSleep }),
    (error) => error.status === 404 && !error.retryable,
  );
  assert.equal(notFound.calls.length, 1);

  const limited = fakeFetch([{ status: 429, headers: { "retry-after": "2" } }, { body: "[]" }]);
  const sleeps = [];
  assert.deepEqual(
    await fetchJson("https://example.test/limited", {
      fetchImpl: limited.fetchImpl,
      sleep: async (ms) => sleeps.push(ms),
    }),
    [],
  );
  assert.deepEqual(sleeps, [2000]);
});

test("fetch helper rejects HTML where data is expected but allows it for listings", async () => {
  const htmlType = fakeFetch([{ body: "id,name", headers: { "content-type": "text/html; charset=utf-8" } }]);
  await assert.rejects(
    fetchText("https://example.test/items.csv", { fetchImpl: htmlType.fetchImpl, sleep: noSleep }),
    /received an HTML page/,
  );

  const htmlBody = fakeFetch([{ body: "\n<!DOCTYPE html><html><body>Rate limited</body></html>" }]);
  await assert.rejects(
    fetchJson("https://example.test/api", { fetchImpl: htmlBody.fetchImpl, sleep: noSleep }),
    /received an HTML page/,
  );

  const invalidJson = fakeFetch([{ body: "{not json" }]);
  await assert.rejects(
    fetchJson("https://example.test/api", { fetchImpl: invalidJson.fetchImpl, sleep: noSleep }),
    /Invalid JSON/,
  );

  const listing = fakeFetch([{ body: "<html><a href=\"2026-09/\">", headers: { "content-type": "text/html" } }]);
  assert.match(
    await fetchText("https://example.test/stats/", { fetchImpl: listing.fetchImpl, expect: "html" }),
    /2026-09/,
  );
});

test("detects HTML documents and computes rate-limit delays", () => {
  assert.equal(looksLikeHtml("<!doctype html><p>"), true);
  assert.equal(looksLikeHtml("  <html>"), true);
  assert.equal(looksLikeHtml("var SETDEX_GEN10 = {};"), false);
  assert.equal(looksLikeHtml("pokemon_species_id,local_language_id,name"), false);

  const headers = (values) => ({ headers: new Headers(values) });
  assert.equal(retryDelay(headers({ "retry-after": "3" }), 0), 3000);
  assert.equal(retryDelay(headers({ ratelimit: "limit=10, remaining=0;t=4" }), 0), 5000);
  assert.equal(retryDelay(headers({}), 2, 100), 400);
});

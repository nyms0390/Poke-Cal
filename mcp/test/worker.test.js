import test from "node:test";
import assert from "node:assert/strict";

import worker, { createWorker } from "../src/worker.js";

const assets = {
  fetch: async (request) => {
    const name = new URL(request.url).pathname.split("/").pop();
    const values = {
      "pokemon.json": [{ id: "alpha", name: "Alpha", types: ["Electric"], baseStats: { hp: 80, atk: 70, def: 60, spa: 100, spd: 70, spe: 100 }, abilities: ["Static"] }],
      "moves.json": [{ id: "thunderbolt", name: "Thunderbolt", type: "Electric", category: "Special", basePower: 90 }],
      "abilities.json": [{ id: "static", name: "Static" }],
      "items.json": [],
    };
    return values[name] ? Response.json(values[name]) : new Response("missing", { status: 404 });
  },
};
const env = { ASSETS: assets };

test("Worker serves health and JSON 404", async () => {
  const app = createWorker(env);
  assert.deepEqual(await (await app.fetch(new Request("https://example.test/health"), env)).json(), { service: "pokecal-mcp", status: "ok" });
  assert.equal((await app.fetch(new Request("https://example.test/nope"), env)).status, 404);
});

test("Worker serves stateless MCP initialize, tools/list, and tools/call", async () => {
  const request = (body, id) => new Request("https://example.test/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id, ...body }) });
  const app = createWorker(env);
  const initialized = await app.fetch(request({ method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, 1), env);
  assert.equal(initialized.status, 200);
  const initJson = await readMcpResponse(initialized);
  assert.equal(initJson.result.serverInfo.name, "PokéCal Champions Strategy");
  const listed = await app.fetch(request({ method: "tools/list", params: {} }, 2), env);
  const listJson = await readMcpResponse(listed);
  assert.equal(listJson.result.tools.length, 5);
  const called = await app.fetch(request({ method: "tools/call", params: { name: "lookup_pokemon", arguments: { query: "Alpha" } } }, 3), env);
  const callJson = await readMcpResponse(called);
  assert.match(callJson.result.content[0].text, /Alpha/);
});

async function readMcpResponse(response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "));
    return JSON.parse(data.slice(6));
  }
  return JSON.parse(text);
}

test("default worker export is available", () => assert.equal(typeof worker.fetch, "function"));

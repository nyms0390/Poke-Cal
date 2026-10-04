import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createStrategyContext } from "../../src/data/strategy-tools.js";
import { CATALOG_PATH, loadCatalogs } from "../src/catalogs.js";
import { callTool, createToolServer } from "../src/tools.js";

const NAMES = ["pokemon", "moves", "abilities", "items"];
const publicUrl = new URL("../../public/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, publicUrl), "utf8"));
const catalogs = (prefix) => Object.fromEntries(NAMES.map((name) => [name, read(`${prefix}${name}.json`)]));

const full = catalogs("");
const slim = catalogs(`${CATALOG_PATH}/`);
const fullServer = createToolServer(createStrategyContext(full));
const slimServer = createToolServer(createStrategyContext(slim));

async function outcome(server, name, input) {
  try {
    return { value: await callTool(server, name, input) };
  } catch (error) {
    return { error: error.message };
  }
}

async function assertSameOutputs(calls) {
  let succeeded = 0;
  for (const [name, input] of calls) {
    const expected = await outcome(fullServer, name, input);
    assert.deepEqual(await outcome(slimServer, name, input), expected, `${name} ${JSON.stringify(input)}`);
    if (expected.value) succeeded += 1;
  }
  return succeeded;
}

const every = (entries, step, offset = 0) => entries.filter((_, index) => index % step === offset);
const pokemonIds = [
  ...every(full.pokemon, 23).map(({ id }) => id),
  "mewtwo", "incineroar", "whimsicott", "shedinja", "milotic", "eelektrossmega", "pelipper", "kingambit", "flutter mane",
];
const damagingMoves = full.moves.filter(({ category }) => category === "Physical" || category === "Special");
const moveIds = [
  ...every(damagingMoves, 17).map(({ id }) => id),
  "psystrike", "thunder", "earthquake", "fakeout", "bodypress", "foulplay", "weatherball", "heatwave", "superfang", "seismictoss",
];

test("the Worker loads the minified catalogs from the public assets directory", async () => {
  const config = readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8");
  assert.match(config, /"directory": "\.\.\/public"/);
  for (const name of NAMES) {
    assert.equal(existsSync(new URL(`${CATALOG_PATH}/${name}.json`, publicUrl)), true, name);
  }
  const requested = [];
  const env = {
    ASSETS: {
      fetch: async (request) => {
        const path = new URL(request.url).pathname.slice(1);
        requested.push(path);
        return new Response(readFileSync(new URL(path, publicUrl)), { headers: { "content-type": "application/json" } });
      },
    },
  };
  const context = await loadCatalogs(env);
  assert.deepEqual(requested.sort(), NAMES.map((name) => `${CATALOG_PATH}/${name}.json`).sort());
  assert.equal(context.pokemon.length, full.pokemon.length);
});

test("lookup tools return identical results from the minified catalogs", async () => {
  const queries = ["mew", "char", "incineroar", "暴雪王", "pika", "landorus", "a", "ogerpon", "rotom"];
  const moveQueries = ["thunder", "protect", "hits adjacent", "psy", "ice", "raises", "priority", "z"];
  const succeeded = await assertSameOutputs([
    ...queries.map((query) => ["lookup_pokemon", { query, limit: 10 }]),
    ...moveQueries.map((query) => ["lookup_move", { query, limit: 10 }]),
  ]);
  assert.equal(succeeded, queries.length + moveQueries.length);
});

test("speed comparisons are identical with the minified catalogs", async () => {
  const calls = [];
  pokemonIds.forEach((left, index) => {
    const right = pokemonIds[(index * 7 + 3) % pokemonIds.length];
    calls.push(["compare_speed", { left, right }]);
    calls.push(["compare_speed", { left, right, trickRoom: true, leftTailwind: true, rightItem: "choicescarf", weather: "rain" }]);
  });
  calls.push(["compare_speed", { left: "mewtwo", right: "incineroar", leftSpread: "Timid:0/0/0/32/2/32" }]);
  assert.equal(await assertSameOutputs(calls) > pokemonIds.length, true);
});

test("damage and survival results are identical with the minified catalogs", async () => {
  const calls = [];
  pokemonIds.forEach((attacker, index) => {
    const defender = pokemonIds[(index * 5 + 1) % pokemonIds.length];
    for (const [offset, tool] of [[0, "calculate_damage"], [1, "check_survival"]]) {
      const move = moveIds[(index * 3 + offset) % moveIds.length];
      calls.push([tool, { attacker, defender, move }]);
      calls.push([tool, { attacker, defender, move, critical: true, weather: "sun", terrain: "psychic", reflect: true, helpingHand: true, defenderHpFraction: 0.5 }]);
    }
  });
  calls.push(["calculate_damage", { attacker: "mewtwo", defender: "incineroar", move: "psystrike" }]);
  calls.push(["check_survival", { attacker: "eelektrossmega", defender: "whimsicott", move: "thunder", defenderItem: "focussash" }]);
  calls.push(["check_survival", { attacker: "incineroar", defender: "milotic", move: "fakeout", attackerAbility: "intimidate", defenderItem: "none" }]);
  assert.equal(await assertSameOutputs(calls) > pokemonIds.length, true);
});

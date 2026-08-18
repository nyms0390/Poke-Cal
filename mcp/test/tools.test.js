import test from "node:test";
import assert from "node:assert/strict";

import { createStrategyContext } from "../../src/data/strategy-tools.js";
import { callTool, createToolServer } from "../src/tools.js";

const context = createStrategyContext({
  pokemon: [
    { id: "alpha", name: "Alpha", types: ["Electric"], baseStats: { hp: 80, atk: 70, def: 60, spa: 100, spd: 70, spe: 100 }, abilities: ["Static"], champions: { legal: true, usagePercent: 12.5 } },
    { id: "beta", name: "Beta", types: ["Water"], baseStats: { hp: 100, atk: 60, def: 100, spa: 80, spd: 100, spe: 60 }, abilities: ["Water Absorb"], champions: { legal: true } },
  ],
  abilities: [{ id: "static", name: "Static" }, { id: "waterabsorb", name: "Water Absorb" }],
  items: [{ id: "leftovers", name: "Leftovers" }],
  moves: [{ id: "thunderbolt", name: "Thunderbolt", type: "Electric", category: "Special", basePower: 90, accuracy: 100, priority: 0, target: "normal", shortDesc: "A strong electric attack.", champions: { legal: true } }],
});

test("MCP tools expose lookup, speed, damage, and survival results", async () => {
  const server = createToolServer(context);
  const pokemon = await callTool(server, "lookup_pokemon", { query: "Alpha" });
  assert.equal(pokemon[0].name, "Alpha");
  const move = await callTool(server, "lookup_move", { query: "Thunderbolt" });
  assert.equal(move[0].type, "Electric");
  const speed = await callTool(server, "compare_speed", { left: "Alpha", right: "Beta" });
  assert.equal(speed.left.name, "Alpha");
  const damage = await callTool(server, "calculate_damage", { attacker: "Alpha", defender: "Beta", move: "Thunderbolt" });
  assert.equal(damage.supported, true);
  const survival = await callTool(server, "check_survival", { attacker: "Alpha", defender: "Beta", move: "Thunderbolt" });
  assert.equal(survival.damage.supported, true);
  assert.equal(survival.remainingHp.min, survival.damage.defenderCurrentHp - survival.damage.maxDamage);
});

test("MCP tools validate limits and unknown entities", async () => {
  const server = createToolServer(context);
  await assert.rejects(() => callTool(server, "lookup_pokemon", { query: "a", limit: 11 }), /limit/i);
  await assert.rejects(() => callTool(server, "lookup_move", { query: "Missing" }), /Unknown move/);
  await assert.rejects(() => callTool(server, "calculate_damage", { attacker: "Missing", defender: "Beta", move: "Thunderbolt" }), /Unknown Pokémon/);
  await assert.rejects(() => callTool(server, "calculate_damage", { attacker: "Alpha", defender: "Beta", move: "Missing" }), /Unknown move/);
});

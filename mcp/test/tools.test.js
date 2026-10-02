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
  await assert.rejects(() => callTool(server, "lookup_pokemon", { query: "   " }), /at least 1|too small|>=1/i);
  await assert.rejects(() => callTool(server, "lookup_move", { query: "\t\n" }), /at least 1|too small|>=1/i);
  await assert.rejects(() => callTool(server, "lookup_move", { query: "Missing" }), /Unknown move/);
  await assert.rejects(() => callTool(server, "calculate_damage", { attacker: "Missing", defender: "Beta", move: "Thunderbolt" }), /Unknown Pokémon/);
  await assert.rejects(() => callTool(server, "calculate_damage", { attacker: "Alpha", defender: "Beta", move: "Missing" }), /Unknown move/);
});

test("MCP lookup ranks exact identifiers before prefixes, substrings, and descriptions", async () => {
  const relevanceContext = createStrategyContext({
    pokemon: [
      { id: "alphaform", name: "Alpha Form", champions: { legal: true, usagePercent: 99 } },
      { id: "alpha", name: "Alpha", champions: { legal: false } },
      { id: "xalpha", name: "Xalpha", champions: { legal: true, usagePercent: 1 } },
    ],
    abilities: [], items: [],
    moves: [
      { id: "protective", name: "Protective", shortDesc: "Protects the user.", champions: { legal: true, usagePercent: 2 } },
      { id: "protect", name: "Protect", shortDesc: "Protects the user.", champions: { legal: false } },
      { id: "xprotectx", name: "XprotectX", shortDesc: "A move that protects.", champions: { legal: true, usagePercent: 1 } },
      { id: "guardmove", name: "Guard Move", shortDesc: "May protect the user.", champions: { legal: true, usagePercent: 100 } },
    ],
  });
  const server = createToolServer(relevanceContext);
  const pokemon = await callTool(server, "lookup_pokemon", { query: "alpha", limit: 3 });
  assert.deepEqual(pokemon.map((entry) => entry.id), ["alpha", "alphaform", "xalpha"]);
  const moves = await callTool(server, "lookup_move", { query: "protect", limit: 4 });
  assert.deepEqual(moves.map((entry) => entry.id), ["protect", "protective", "xprotectx", "guardmove"]);
});

test("MCP enum-like inputs normalise aliases to engine values", async () => {
  const fieldContext = createStrategyContext({
    pokemon: [
      { id: "attacker", name: "Attacker", types: ["Water"], baseStats: { hp: 80, atk: 100, def: 80, spa: 100, spd: 80, spe: 100 }, abilities: ["Static"], champions: { legal: true } },
      { id: "target", name: "Target", types: ["Normal"], baseStats: { hp: 100, atk: 80, def: 100, spa: 80, spd: 100, spe: 50 }, abilities: ["Static"], champions: { legal: true } },
    ],
    abilities: [{ id: "static", name: "Static" }], items: [],
    moves: [{ id: "surf", name: "Surf", type: "Water", category: "Special", basePower: 90, target: "normal", champions: { legal: true } }],
  });
  const server = createToolServer(fieldContext);
  const base = { attacker: "Attacker", defender: "Target", move: "Surf", format: "singles" };
  const neutral = await callTool(server, "calculate_damage", base);
  for (const weather of ["rain", "raindance", "RainDance", "Rain Dance"]) {
    const rain = await callTool(server, "calculate_damage", { ...base, weather });
    assert.ok(rain.maxDamage > neutral.maxDamage, weather);
  }
  for (const weather of ["sun", "sunnyday"]) {
    assert.ok((await callTool(server, "calculate_damage", { ...base, weather })).maxDamage < neutral.maxDamage, weather);
  }
  assert.equal((await callTool(server, "calculate_damage", { ...base, weather: "none" })).maxDamage, neutral.maxDamage);
  assert.equal((await callTool(server, "calculate_damage", { ...base, targetType: "fire" })).typeEffectiveness, 2);
  assert.equal((await callTool(server, "calculate_damage", { ...base, targetType: "GRASS" })).typeEffectiveness, 0.5);
  const paralyzed = await callTool(server, "compare_speed", { left: "Attacker", right: "Attacker", leftStatus: "par" });
  assert.equal(paralyzed.verdict, "RIGHT");
  assert.equal((await callTool(server, "compare_speed", { left: "Attacker", right: "Attacker", leftStatus: "paralyzed" })).verdict, "RIGHT");
  const schema = server.__pokecalTools.calculate_damage.schema;
  const parsed = schema.parse({ ...base, weather: "hail", terrain: "electric", attackerStatus: "brn", defenderStatus: "tox", attackerTeraType: "fairy" });
  assert.equal(parsed.weather, "Snowscape");
  assert.equal(parsed.terrain, "Electric Terrain");
  assert.equal(parsed.attackerStatus, "burn");
  assert.equal(parsed.defenderStatus, "toxic");
  assert.equal(parsed.attackerTeraType, "Fairy");
  assert.deepEqual(schema.parse(parsed).weather, "Snowscape", "canonical values parse idempotently");
  for (const [alias, value] of [["sand", "Sandstorm"], ["snow", "Snowscape"], ["sunny day", "SunnyDay"]]) assert.equal(schema.parse({ ...base, weather: alias }).weather, value);
  for (const [alias, value] of [["grassy", "Grassy Terrain"], ["misty", "Misty Terrain"], ["Psychic Terrain", "Psychic Terrain"]]) assert.equal(schema.parse({ ...base, terrain: alias }).terrain, value);
  for (const [alias, value] of [["paralysis", "paralysis"], ["burn", "burn"], ["psn", "poison"], ["slp", "sleep"], ["frz", "freeze"]]) assert.equal(schema.parse({ ...base, attackerStatus: alias }).attackerStatus, value);
});

test("MCP rejects unknown enum values and unbounded text without echoing it", async () => {
  const server = createToolServer(context);
  const base = { attacker: "Alpha", defender: "Beta", move: "Thunderbolt" };
  await assert.rejects(() => callTool(server, "calculate_damage", { ...base, weather: "acid" }), /weather: Unknown weather "acid"\. Use one of: RainDance/);
  await assert.rejects(() => callTool(server, "calculate_damage", { ...base, targetType: "Foo" }), /Unknown targetType "Foo"/);
  await assert.rejects(() => callTool(server, "calculate_damage", { ...base, terrain: "lava" }), /Unknown terrain/);
  await assert.rejects(() => callTool(server, "compare_speed", { left: "Alpha", right: "Beta", leftStatus: "confused" }), /Unknown status "confused"/);
  const long = "Z".repeat(5000);
  for (const input of [{ ...base, attacker: long }, { ...base, attackerItem: long }, { ...base, weather: long }]) {
    await assert.rejects(() => callTool(server, "calculate_damage", input), (error) => {
      assert.match(error.message, /Invalid arguments/);
      assert.ok(!error.message.includes("Z".repeat(50)), "error must not echo long input");
      assert.ok(error.message.length < 400);
      return true;
    });
  }
  await assert.rejects(() => callTool(server, "lookup_pokemon", { query: long }), /Too big|<=100/);
  const near = "Q".repeat(100);
  await assert.rejects(() => callTool(server, "lookup_pokemon", { query: near }), (error) => !error.message.includes("Q".repeat(50)));
});

test("MCP flags results for Pokémon or moves that are not Champions-legal", async () => {
  const legalityContext = createStrategyContext({
    pokemon: [
      { id: "mewtwo", name: "Mewtwo", types: ["Psychic"], baseStats: { hp: 106, atk: 110, def: 90, spa: 154, spd: 90, spe: 130 }, abilities: ["Pressure"], champions: { legal: false } },
      { id: "beta", name: "Beta", types: ["Water"], baseStats: { hp: 100, atk: 60, def: 100, spa: 80, spd: 100, spe: 60 }, abilities: ["Pressure"], champions: { legal: true } },
    ],
    abilities: [{ id: "pressure", name: "Pressure" }], items: [],
    moves: [
      { id: "psystrike", name: "Psystrike", type: "Psychic", category: "Special", basePower: 100, target: "normal", champions: { legal: false } },
      { id: "psychic", name: "Psychic", type: "Psychic", category: "Special", basePower: 90, target: "normal", champions: { legal: true } },
    ],
  });
  const server = createToolServer(legalityContext);
  const illegal = await callTool(server, "calculate_damage", { attacker: "Mewtwo", defender: "Beta", move: "Psystrike" });
  assert.equal(illegal.legal, false);
  assert.equal(illegal.warnings.length, 2);
  assert.match(illegal.warnings.join(" "), /Mewtwo is not legal in Pokémon Champions/);
  assert.match(illegal.warnings.join(" "), /Psystrike is not legal/);
  const survival = await callTool(server, "check_survival", { attacker: "Beta", defender: "Beta", move: "Psystrike" });
  assert.equal(survival.legal, false);
  assert.deepEqual(survival.warnings, ["Psystrike is not legal in Pokémon Champions; result is a hypothetical calculation."]);
  const legal = await callTool(server, "calculate_damage", { attacker: "Beta", defender: "Beta", move: "Psychic" });
  assert.equal(legal.legal, true);
  assert.deepEqual(legal.warnings, []);
  const speed = await callTool(server, "compare_speed", { left: "Mewtwo", right: "Beta" });
  assert.equal(speed.legal, false);
  assert.match(speed.warnings[0], /Mewtwo/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createStrategyContext } from "../../src/data/strategy-tools.js";
import { USAGE_LIST_LIMIT } from "../../src/data/strategy-analysis.js";
import { CATALOG_PATH } from "../src/catalogs.js";
import { PASTE_MAX, callTool, createToolServer } from "../src/tools.js";

// Runs on the committed minified catalogs (what the Worker serves), so assertions are about
// structure and consistency between tools rather than this week's usage numbers.
const read = (name) => JSON.parse(readFileSync(new URL(`../../public/${CATALOG_PATH}/${name}.json`, import.meta.url), "utf8"));
const context = createStrategyContext({ pokemon: read("pokemon"), moves: read("moves"), abilities: read("abilities"), items: read("items") });
const server = createToolServer(context);
const call = (name, input) => callTool(server, name, input);

const GARCHOMP = "Garchomp @ Choice Scarf\nAbility: Rough Skin\nSPs: 2 HP / 32 Atk / 32 Spe\nJolly Nature\n- Earthquake\n- Dragon Claw";

test("get_sets lists capped, sorted usage, Smogon spreads and NCP sets with loadable pastes", async () => {
  const sets = await call("get_sets", { pokemon: "Incineroar" });
  assert.equal(sets.pokemon.name, "Incineroar");
  assert.equal(sets.legal, true);
  for (const key of ["abilities", "items", "moves", "natures", "teammates"]) {
    const list = sets.limitless[key];
    assert.ok(list.length > 0 && list.length <= USAGE_LIST_LIMIT, key);
    assert.deepEqual(list.map(({ usagePercent }) => usagePercent), [...list.map(({ usagePercent }) => usagePercent)].sort((a, b) => b - a), key);
  }
  assert.ok(sets.smogonSpreads.every(({ sp, nature }) => nature && Object.values(sp).reduce((a, b) => a + b, 0) <= 66));
  assert.ok(sets.ncpSets.length > 0);
  for (const set of sets.ncpSets) {
    const damage = await call("calculate_damage", { attackerSet: set.paste, defender: "Garchomp", move: set.moves.find(Boolean) ?? "Flare Blitz" });
    assert.equal(damage.attacker.id, "incineroar");
    assert.equal(damage.pasteWarnings, undefined, set.name);
  }
  await assert.rejects(() => call("get_sets", { pokemon: "Missingno" }), /Unknown Pokémon/);
});

test("a set paste gives the same results as the equivalent explicit fields", async () => {
  const explicit = { attacker: "Garchomp", attackerSpread: "Jolly:2/32/0/0/0/32", attackerItem: "Choice Scarf", attackerAbility: "Rough Skin", defender: "Incineroar", move: "Earthquake" };
  const pasted = { attackerSet: GARCHOMP, defender: "Incineroar", move: "Earthquake" };
  assert.deepEqual(await call("calculate_damage", pasted), await call("calculate_damage", explicit));
  assert.deepEqual(await call("check_survival", pasted), await call("check_survival", explicit));
  assert.deepEqual(
    await call("compare_speed", { leftSet: GARCHOMP, right: "Dragapult" }),
    await call("compare_speed", { left: "Garchomp", leftSpread: "Jolly:2/32/0/0/0/32", leftItem: "Choice Scarf", leftAbility: "Rough Skin", right: "Dragapult" }),
  );
  // Explicit fields override the paste; a paste without an item holds none.
  const overridden = await call("calculate_damage", { attackerSet: GARCHOMP, attackerItem: "Life Orb", defender: "Incineroar", move: "Earthquake" });
  assert.equal(overridden.minDamage, (await call("calculate_damage", { ...explicit, attackerItem: "Life Orb" })).minDamage);
  const itemless = await call("compare_speed", { leftSet: "Garchomp\nSPs: 32 Spe\nJolly Nature", right: "Dragapult" });
  assert.equal(itemless.left.speed, (await call("compare_speed", { left: "Garchomp", leftSpread: "Jolly:0/0/0/0/0/32", leftItem: "none", right: "Dragapult" })).left.speed);
});

test("set pastes report unknown entries and are bounded", async () => {
  const warned = await call("calculate_damage", { attackerSet: "Garchomp @ Mystery Orb\nAbility: Rough Skin\nWeird Nature", defender: "Incineroar", move: "Earthquake" });
  assert.deepEqual(warned.pasteWarnings, ["Unknown item: Mystery Orb", "Unknown nature: Weird"]);
  await assert.rejects(() => call("calculate_damage", { defender: "Incineroar", move: "Earthquake" }), /Pokémon name or set paste is required/);
  await assert.rejects(() => call("calculate_damage", { attackerSet: "Nobody\n- Tackle", defender: "Incineroar", move: "Earthquake" }), /does not name a known Pokémon/);
  await assert.rejects(() => call("compare_speed", { leftSet: "x".repeat(PASTE_MAX + 1), right: "Dragapult" }), /Invalid arguments: leftSet/);
});

test("speed_tiers agrees with compare_speed and flips under Trick Room", async () => {
  const tiers = await call("speed_tiers", { set: GARCHOMP, count: 10, includeAllSets: true });
  assert.equal(tiers.user.speed, (await call("compare_speed", { leftSet: GARCHOMP, right: "Incineroar" })).left.speed);
  assert.ok(tiers.opponents.length >= 10);
  assert.equal(tiers.opponents.some(({ id }) => id === "garchomp"), false);
  const counted = tiers.summary.youMoveFirst + tiers.summary.theyMoveFirst + tiers.summary.speedTie;
  assert.equal(counted, tiers.opponents.filter(({ likely }) => likely).length);
  for (const opponent of tiers.opponents) {
    assert.ok(opponent.sets.length > 0, opponent.name);
    for (const set of opponent.sets) {
      const expected = set.speed > tiers.user.speed ? "opponent" : set.speed < tiers.user.speed ? "you" : "tie";
      assert.equal(set.movesFirst, expected, `${opponent.name} ${set.set}`);
    }
  }
  const trickRoom = await call("speed_tiers", { set: GARCHOMP, count: 10, trickRoom: true });
  assert.equal(trickRoom.summary.youMoveFirst, tiers.summary.theyMoveFirst);
  assert.equal(trickRoom.summary.theyMoveFirst, tiers.summary.youMoveFirst);
  assert.equal(trickRoom.opponents.every(({ sets }) => sets === undefined), true);
  await assert.rejects(() => call("speed_tiers", { pokemon: "Garchomp", count: 15 }), /Invalid arguments: count/);
});

test("speed_tiers gives the SP to outspeed each faster likely set", async () => {
  const tiers = await call("speed_tiers", { pokemon: "Incineroar", spread: "Careful:32/0/14/0/20/0", count: 20 });
  const faster = tiers.opponents.find(({ likely }) => likely?.movesFirst === "opponent" && likely.toOutspeed?.length);
  assert.ok(faster, "a faster opponent with an outspeed point");
  const { nature, requiredSp } = faster.likely.toOutspeed.at(-1);
  const comparison = await call("compare_speed", { left: "Incineroar", leftSpread: `${nature}:0/0/0/0/0/${requiredSp}`, leftItem: "Sitrus Berry", right: "Incineroar" });
  assert.ok(comparison.left.speed > faster.likely.speed);
});

test("bulk_points steps match calculate_damage at the suggested spreads", async () => {
  const input = { pokemon: "Incineroar", spread: "Adamant:0/32/0/0/0/0", attacker: "Dragapult", move: "Draco Meteor" };
  const bulk = await call("bulk_points", input);
  assert.equal(bulk.legal, true);
  assert.equal(bulk.defenseStat, "spd");
  assert.equal(bulk.budget, 34);
  assert.ok(bulk.fromCurrent.length > 0);
  for (const point of bulk.fromCurrent) {
    assert.ok(point.totalSp <= bulk.budget);
    const damage = await call("calculate_damage", {
      attacker: "Dragapult", move: "Draco Meteor", defender: "Incineroar",
      defenderSpread: `Adamant:${point.hp}/32/0/0/${point.spd}/0`,
    });
    assert.equal(damage.koChance.text, point.koText);
  }
  const noRoom = await call("bulk_points", { ...input, budget: 0 });
  assert.deepEqual(noRoom.fromCurrent, []);
});

test("break_points steps match calculate_damage at the suggested SP", async () => {
  const breaks = await call("break_points", { pokemon: "Garchomp", spread: "Jolly:2/0/0/0/0/32", target: "Incineroar", move: "Earthquake" });
  assert.equal(breaks.attackStat, "atk");
  assert.ok(breaks.points.length > 0);
  for (const point of breaks.points) {
    const nature = point.requiresPlusNature ? "Adamant" : "Jolly";
    const damage = await call("calculate_damage", {
      attacker: "Garchomp", attackerSpread: `${nature}:2/${point.sp}/0/0/0/32`, defender: "Incineroar", move: "Earthquake",
    });
    assert.equal(damage.koChance.text, point.achieves, `${point.sp} ${nature}`);
  }
  const hypothetical = await call("break_points", { pokemon: "Mewtwo", target: "Incineroar", move: "Psystrike" });
  assert.equal(hypothetical.legal, false);
  assert.equal(hypothetical.warnings.length, 2);
});

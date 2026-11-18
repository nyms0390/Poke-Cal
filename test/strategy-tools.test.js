import test from "node:test";
import assert from "node:assert/strict";

import {
  checkSurvival,
  compareSpeed,
  createStrategyContext,
  damageField,
  parseBooleanOption,
  resolveMove,
  resolvePokemon,
  sideState,
} from "../src/data/strategy-tools.js";

const stats = (spe) => ({ hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe });
const context = createStrategyContext({
  pokemon: [
    { id: "swiftmon", name: "Swiftmon", types: ["Normal"], baseStats: stats(120), abilities: ["Run Away"] },
    { id: "slowmon", name: "Slowmon", types: ["Water"], baseStats: stats(40), abilities: ["Run Away"] },
  ],
  abilities: [{ id: "runaway", name: "Run Away" }],
  moves: [{ id: "tackle", name: "Tackle", type: "Normal", category: "Physical", basePower: 40, accuracy: 100, target: "normal", flags: { contact: 1 } }],
  items: [{ id: "focussash", name: "Focus Sash" }],
});

test("parseBooleanOption reads CLI words and rejects anything else", () => {
  for (const value of [undefined, null, false, 0, "false", "0", "No", " off "]) assert.equal(parseBooleanOption(value), false, String(value));
  for (const value of [true, 1, "true", "1", "YES", "on"]) assert.equal(parseBooleanOption(value), true, String(value));
  assert.throws(() => parseBooleanOption("maybe", "trickRoom"), /trickRoom must be true or false \(got maybe\)/);
});

test("lookups accept names or ids and name what is unknown", () => {
  assert.equal(resolvePokemon(context, "Swift Mon").id, "swiftmon");
  assert.equal(resolveMove(context, "TACKLE").name, "Tackle");
  assert.throws(() => resolvePokemon(context, "Missingno"), /Unknown Pokémon: Missingno/);
  assert.throws(() => resolveMove(context, "Splash"), /Unknown move: Splash/);
});

test("damageField defaults to doubles with every flag off and parses string flags", () => {
  const field = damageField();
  assert.equal(field.format, "doubles");
  assert.equal(field.attackerSide.helpingHand, false);
  assert.equal(field.defenderSide.reflect, false);
  const set = damageField({ format: "singles", helpingHand: "yes", reflect: "1", gravity: "on" });
  assert.equal(set.format, "singles");
  assert.equal(set.attackerSide.helpingHand, true);
  assert.equal(set.defenderSide.reflect, true);
  assert.equal(set.gravity, true);
  assert.throws(() => damageField({ reflect: "sometimes" }), /reflect must be true or false/);
});

test("sideState validates stages and HP fractions at the boundary", () => {
  assert.equal(sideState(context, "Swiftmon").currentHpFraction, 1);
  assert.throws(() => sideState(context, "Swiftmon", { stages: { spe: 7 } }), /spe stage must be an integer from -6 to 6/);
  assert.throws(() => sideState(context, "Swiftmon", { currentHpFraction: 0 }), /HP fraction/);
  assert.throws(() => sideState(context, ""), /A Pokémon name or set paste is required/);
});

test("compareSpeed names the faster side, flips in Trick Room, and reports ties", () => {
  const normal = compareSpeed(context, { left: "Swiftmon", right: "Slowmon" });
  assert.equal(normal.verdict, "LEFT");
  assert.match(normal.summary, /^Swiftmon is faster — \d+ vs \d+\.$/);
  assert.ok(normal.left.speed > normal.right.speed);

  const trickRoom = compareSpeed(context, { left: "Swiftmon", right: "Slowmon", trickRoom: "true" });
  assert.equal(trickRoom.verdict, "RIGHT");
  assert.match(trickRoom.summary, /^Slowmon moves first in Trick Room/);

  const tie = compareSpeed(context, { left: "Slowmon", right: "Slowmon" });
  assert.equal(tie.verdict, "TIE");
  assert.match(tie.summary, /^Speed tie — \d+ each\.$/);

  const tailwind = compareSpeed(context, { left: "Slowmon", right: "Slowmon", leftTailwind: "yes" });
  assert.equal(tailwind.left.speed, tie.left.speed * 2);
});

test("checkSurvival gives a YES/ROLL/NO verdict that matches the damage range", () => {
  const result = checkSurvival(context, { attacker: "Swiftmon", defender: "Slowmon", move: "Tackle" });
  assert.equal(result.verdict, "YES");
  assert.equal(result.survivalChance, 1);
  assert.ok(result.maxDamage > 0);
  assert.match(result.summary, /^YES — Slowmon survives \d+–\d+ damage/);

  const low = checkSurvival(context, { attacker: "Swiftmon", defender: "Slowmon", move: "Tackle", defenderHpFraction: 0.01 });
  assert.equal(low.verdict, "NO");
  assert.match(low.summary, /^NO — Slowmon is always KO'd/);
});

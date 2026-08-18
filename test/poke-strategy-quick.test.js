import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  calculateDamageMatchup,
  checkSurvival,
  compareSpeed,
  loadQuickContext,
} from "../.agents/skills/poke-strategy/scripts/quick.mjs";

const context = await loadQuickContext();
const quickScript = fileURLToPath(new URL(
  "../.agents/skills/poke-strategy/scripts/quick.mjs",
  import.meta.url,
));

test("Quick mode reports the faster Pokemon from explicit Champions spreads", () => {
  const result = compareSpeed(context, {
    left: "pelipper",
    right: "eelektrossmega",
    leftSpread: "Modest:31/0/1/5/18/11",
    rightSpread: "Timid:2/0/0/32/0/32",
  });

  assert.equal(result.verdict, "RIGHT");
  assert.equal(result.left.speed, 96);
  assert.equal(result.right.speed, 145);
  assert.equal(result.summary, "Eelektross-Mega is faster — 145 vs 96.");
});

test("Quick mode includes Speed stages in the comparison", () => {
  const result = compareSpeed(context, {
    left: "pelipper",
    right: "eelektrossmega",
    leftSpread: "Modest:31/0/1/5/18/11",
    rightSpread: "Timid:2/0/0/32/0/32",
    leftSpeedStage: 2,
  });

  assert.equal(result.verdict, "LEFT");
  assert.equal(result.left.speed, 192);
  assert.equal(result.summary, "Pelipper is faster — 192 vs 145.");
});

test("Quick mode reports guaranteed survival with a compact damage range", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "milotic",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Calm:20/0/20/4/8/14",
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.verdict, "YES");
  assert.deepEqual([result.minDamage, result.maxDamage], [152, 182]);
  assert.deepEqual([result.minPercent, result.maxPercent], [80, 95.7]);
  assert.equal(result.survivalChance, 1);
  assert.equal(result.summary, "YES — Milotic survives 152–182 damage (80–95.7%) at full HP.");
});

test("Quick mode exposes a deterministic damage matchup result", () => {
  const result = calculateDamageMatchup(context, {
    attacker: "eelektrossmega",
    defender: "milotic",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Calm:20/0/20/4/8/14",
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.supported, true);
  assert.deepEqual([result.minDamage, result.maxDamage], [152, 182]);
  assert.deepEqual([result.minPercent, result.maxPercent], [80, 95.7]);
});

test("Quick mode reports a supplied current HP fraction", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "milotic",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Calm:20/0/20/4/8/14",
    defenderHpFraction: 0.8,
    targetType: "Water",
    weather: "RainDance",
    lightScreen: true,
  });

  assert.equal(result.verdict, "YES");
  assert.equal(result.summary, "YES — Milotic survives 101–121 damage (53.1–63.6%) at 80% HP.");
});

test("Quick mode includes offensive stages in survival checks", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "milotic",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Calm:20/0/20/4/8/14",
    attackerSpaStage: 1,
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.verdict, "NO");
  assert.deepEqual([result.minDamage, result.maxDamage], [228, 270]);
});

test("Quick mode distinguishes roll-dependent survival", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "incineroar",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Careful:32/0/21/0/11/2",
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.verdict, "ROLL");
  assert.equal(result.survivalChance, 0.3125);
  assert.equal(result.summary, "ROLL — Incineroar has a 31.3% survival chance (95–112.8%).");
});

test("Quick mode applies an intact Focus Sash after engine damage", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "whimsicott",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Timid:2/0/0/32/0/32",
    defenderItem: "focussash",
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.verdict, "YES");
  assert.equal(result.reason, "Focus Sash");
  assert.equal(result.survivalChance, 1);
  assert.equal(result.summary, "YES — Whimsicott survives with Focus Sash (197–232.1%).");
});

test("Quick mode can explicitly clear a usage-default item", () => {
  const result = checkSurvival(context, {
    attacker: "eelektrossmega",
    defender: "whimsicott",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Timid:2/0/0/32/0/32",
    defenderItem: "none",
    targetType: "Water",
    weather: "RainDance",
  });

  assert.equal(result.verdict, "NO");
});

test("Quick mode CLI prints only the compact answer", () => {
  const result = spawnSync(process.execPath, [
    quickScript,
    "speed",
    "--left", "pelipper",
    "--right", "eelektrossmega",
    "--left-spread", "Modest:31/0/1/5/18/11",
    "--right-spread", "Timid:2/0/0/32/0/32",
  ], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "Eelektross-Mega is faster — 145 vs 96.\n");
});

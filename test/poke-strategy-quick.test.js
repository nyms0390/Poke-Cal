import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  calculateDamageMatchup,
  checkSurvival,
  compareSpeed,
  loadQuickContext,
  parseOptions,
} from "../.agents/skills/poke-strategy/scripts/quick.mjs";
import { parseBooleanOption } from "../src/data/strategy-tools.js";

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

test("boolean options parse CLI words instead of treating any string as true", () => {
  for (const value of [true, 1, "true", "1", "yes", "on", "TRUE", " On "]) {
    assert.equal(parseBooleanOption(value), true, String(value));
  }
  for (const value of [undefined, null, false, 0, "false", "0", "no", "off", "OFF"]) {
    assert.equal(parseBooleanOption(value), false, String(value));
  }
  assert.throws(() => parseBooleanOption("maybe", "trickRoom"), /trickRoom must be true or false/);
});

test("Quick mode CLI options keep bare flags true and pass values through", () => {
  assert.deepEqual(
    parseOptions(["--trick-room", "false", "--critical", "--left-speed-stage", "-1", "--json"]),
    { trickRoom: "false", critical: true, leftSpeedStage: "-1", json: true },
  );
});

test("Quick mode treats --trick-room false as no Trick Room", () => {
  const base = {
    left: "pelipper",
    right: "eelektrossmega",
    leftSpread: "Modest:31/0/1/5/18/11",
    rightSpread: "Timid:2/0/0/32/0/32",
  };
  const plain = compareSpeed(context, base);
  for (const off of ["false", "0", "no", "off"]) {
    assert.deepEqual(compareSpeed(context, { ...base, trickRoom: off }), plain, off);
  }
  for (const on of ["true", "1", "yes", "on", true]) {
    const result = compareSpeed(context, { ...base, trickRoom: on });
    assert.equal(result.verdict, "LEFT", String(on));
    assert.equal(result.summary, "Pelipper moves first in Trick Room — 96 vs 145.");
  }
  assert.deepEqual(compareSpeed(context, { ...base, leftTailwind: "false" }), plain);
});

test("Quick mode treats --critical false as a normal hit", () => {
  const base = {
    attacker: "eelektrossmega",
    defender: "milotic",
    move: "thunder",
    attackerSpread: "Quiet:32/2/0/32/0/0",
    defenderSpread: "Calm:20/0/20/4/8/14",
    targetType: "Water",
    weather: "RainDance",
  };
  const normal = checkSurvival(context, base);
  const critical = checkSurvival(context, { ...base, critical: true });
  assert.notDeepEqual(critical, normal);
  assert.deepEqual(checkSurvival(context, { ...base, critical: "false" }), normal);
  assert.deepEqual(checkSurvival(context, { ...base, critical: "off", lightScreen: "no" }), normal);
  assert.deepEqual(checkSurvival(context, { ...base, critical: "yes" }), critical);
});

test("Quick mode CLI honours explicit false boolean values", () => {
  const run = (...flags) => spawnSync(process.execPath, [
    quickScript,
    "speed",
    "--left", "pelipper",
    "--right", "eelektrossmega",
    "--left-spread", "Modest:31/0/1/5/18/11",
    "--right-spread", "Timid:2/0/0/32/0/32",
    ...flags,
  ], { encoding: "utf8" });

  const off = run("--trick-room", "false", "--json", "no");
  assert.equal(off.status, 0, off.stderr);
  assert.equal(off.stdout, "Eelektross-Mega is faster — 145 vs 96.\n");

  const on = run("--trick-room");
  assert.equal(on.status, 0, on.stderr);
  assert.equal(on.stdout, "Pelipper moves first in Trick Room — 96 vs 145.\n");

  const invalid = run("--trick-room", "maybe");
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /trickRoom must be true or false/);
});

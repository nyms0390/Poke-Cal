import test from "node:test";
import assert from "node:assert/strict";

import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  evaluateInSandbox,
  extractAbilities,
  extractCatalogEntries,
  extractLearnsetMoves,
  parseShowdownExport,
  stripTypeAssertions,
} from "../src/data/showdown-data.js";

test("parses Showdown TypeScript exports", () => {
  const source = `export const Pokedex: import('../sim/dex-species').SpeciesDataTable = {
    pikachu: {
      num: 25,
      name: "Pikachu",
      baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
      abilities: { 0: "Static", H: "Lightning Rod" },
    },
  };`;

  const pokedex = parseShowdownExport(source, "Pokedex");

  assert.equal(pokedex.pikachu.name, "Pikachu");
  assert.deepEqual(extractAbilities(pokedex.pikachu), ["Lightning Rod", "Static"]);
});

test("extracts sorted learnset moves and falls back to base species", () => {
  const learnsets = {
    charizard: {
      learnset: {
        flamethrower: ["9L1"],
        airslash: ["9L1"],
      },
    },
    charizardmegax: {
      eventOnly: true,
    },
  };

  assert.deepEqual(extractLearnsetMoves(learnsets, "charizardmegax", "Charizard"), [
    "airslash",
    "flamethrower",
  ]);
});

test("extracts serializable catalog metadata", () => {
  const catalog = extractCatalogEntries({
    static: {
      name: "Static",
      shortDesc: "30% chance a Pokemon making contact with this Pokemon will be paralyzed.",
      rating: 2,
      onDamagingHit() {
        return true;
      },
    },
  });

  assert.deepEqual(catalog, [
    {
      id: "static",
      name: "Static",
      shortDesc: "30% chance a Pokemon making contact with this Pokemon will be paralyzed.",
      rating: 2,
    },
  ]);
});

test("strips TypeScript assertions without changing string data", () => {
  const source = `
    name: "Good as Gold",
    onStart(pokemon) {
      ((this.effect as any).onStart as (p: Pokemon) => void).call(this, pokemon);
      if ((effect as Move)?.status) return;
      let i: BoostID;
      const boosts: SparseBoostsTable = {};
      if (boost[i]! < 0) return;
      boost[i]! *= -1;
      const sides = [this.sides[0], this.sides[2]!];
      for (const action of this.queue.list as MoveAction[]) return action;
      onResidual(target: Pokemon) { return target; },
    },
  `;

  const stripped = stripTypeAssertions(source);

  assert.equal(stripped.includes('"Good as Gold"'), true);
  assert.equal(stripped.includes("as any"), false);
  assert.equal(stripped.includes("as (p: Pokemon) => void"), false);
  assert.equal(stripped.includes("as Move"), false);
  assert.equal(stripped.includes("i: BoostID"), false);
  assert.equal(stripped.includes("boosts: SparseBoostsTable"), false);
  assert.equal(stripped.includes("boost[i]!"), false);
  assert.equal(stripped.includes("this.sides[2]!"), false);
  assert.equal(stripped.includes("as MoveAction[]"), false);
  assert.equal(stripped.includes("this.queue.list]"), false);
  assert.equal(stripped.includes("target: Pokemon"), false);
});

test("keeps undefined overrides and drops functions when parsing in the sandbox", () => {
  const moves = parseShowdownExport(
    `export const Moves: import('../sim/dex-moves').ModdedMoveDataTable = {
      tackle: { inherit: true, isNonstandard: undefined, basePower: 40, onHit(target) { return target; }, flags: { contact: 1 } },
    };`,
    "Moves",
  );

  assert.equal("isNonstandard" in moves.tackle, true);
  assert.equal(moves.tackle.isNonstandard, undefined);
  assert.equal("onHit" in moves.tackle, false);
  assert.deepEqual(moves.tackle.flags, { contact: 1 });
  assert.equal(moves.tackle.basePower, 40);
});

test("blocks the vm constructor escape used against the old in-process parser", () => {
  const pokedex = parseShowdownExport(
    `export const Pokedex: any = (function () {
      const attempts = {};
      const tries = {
        thisConstructor: () => this.constructor.constructor("return process")(),
        exportsConstructor: () => exports.constructor.constructor("return process")(),
        literalConstructor: () => ({}).constructor.constructor("return process")(),
        evalCall: () => eval("process"),
      };
      for (const [name, attempt] of Object.entries(tries)) {
        try {
          const leaked = attempt();
          attempts[name] = leaked && typeof leaked.env === "object" ? "escaped" : "no-process";
        } catch (error) {
          attempts[name] = "blocked";
        }
      }
      return { probe: { name: "Probe", attempts } };
    })();`,
    "Pokedex",
  );

  assert.deepEqual(pokedex.probe.attempts, {
    thisConstructor: "blocked",
    exportsConstructor: "blocked",
    literalConstructor: "blocked",
    evalCall: "blocked",
  });
});

test("contains a successful escape: no env secrets, process spawning, or file access", () => {
  const directory = mkdtempSync(join(tmpdir(), "pokecal-sandbox-"));
  const target = join(directory, "pwned.txt");
  const existing = join(directory, "secret.txt");
  writeFileSync(existing, "top secret");
  const previousSecret = process.env.POKECAL_SANDBOX_SECRET;
  process.env.POKECAL_SANDBOX_SECRET = "github-token-value";

  try {
    // simulateSandboxEscape hands the child's real `process` to the payload, i.e. it models
    // an attacker who already broke out of the vm context.
    const report = evaluateInSandbox(
      `const p = process;
      const report = {
        secret: p.env.POKECAL_SANDBOX_SECRET ?? null,
        envKeys: Object.keys(p.env).length,
      };
      const attempt = (name, run) => {
        try { run(); report[name] = "allowed"; } catch (error) { report[name] = error.code ?? String(error); }
      };
      attempt("spawn", () => p.getBuiltinModule("node:child_process").execFileSync(p.execPath, ["-e", "1"]));
      attempt("write", () => p.getBuiltinModule("node:fs").writeFileSync(${JSON.stringify(target)}, "pwned"));
      attempt("read", () => p.getBuiltinModule("node:fs").readFileSync(${JSON.stringify(existing)}, "utf8"));
      attempt("worker", () => new (p.getBuiltinModule("node:worker_threads").Worker)("1", { eval: true }));
      exports.Probe = report;`,
      "Probe",
      { simulateSandboxEscape: true },
    );

    assert.equal(report.secret, null);
    assert.equal(report.envKeys, 0);
    assert.equal(report.spawn, "ERR_ACCESS_DENIED");
    assert.equal(report.write, "ERR_ACCESS_DENIED");
    assert.equal(report.read, "ERR_ACCESS_DENIED");
    assert.equal(report.worker, "ERR_ACCESS_DENIED");
    assert.equal(existsSync(target), false);
  } finally {
    if (previousSecret === undefined) delete process.env.POKECAL_SANDBOX_SECRET;
    else process.env.POKECAL_SANDBOX_SECRET = previousSecret;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reports sandbox evaluation errors and infinite loops as parse failures", () => {
  assert.throws(
    () => parseShowdownExport("export const Items: any = (() => { throw new Error('boom'); })();", "Items"),
    /failed to evaluate: boom/,
  );
  assert.throws(
    () => evaluateInSandbox("while (true) {}", "Items", { timeoutMs: 200 }),
    /failed to evaluate/,
  );
});

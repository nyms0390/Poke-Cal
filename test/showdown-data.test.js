import test from "node:test";
import assert from "node:assert/strict";

import {
  extractAbilities,
  extractCatalogEntries,
  extractLearnsetMoves,
  normalizeChaosUsageStats,
  parseShowdownExport,
  stripTypeAssertions,
} from "../src/showdown-data.js";

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

test("normalizes Smogon chaos usage stats", () => {
  const usage = normalizeChaosUsageStats(
    {
      data: {
        Pikachu: {
          "Raw count": 200,
          usage: 0.125,
          Abilities: {
            Static: 145,
            "Lightning Rod": 55,
          },
          Items: {
            "Light Ball": 176.4,
          },
          Moves: {
            Thunderbolt: 182.8,
            "Quick Attack": 88.2,
          },
          Spreads: {
            "Timid:0/0/0/252/4/252": 126.4,
          },
        },
      },
    },
    { month: "2026-05", format: "gen9championsbssregma-0" },
  );

  assert.deepEqual(usage, {
    source: "Smogon / Pokémon Showdown",
    month: "2026-05",
    format: "gen9championsbssregma-0",
    pokemon: {
      pikachu: {
        usagePercent: 12.5,
        abilities: [
          { id: "static", name: "Static", usagePercent: 72.5 },
          { id: "lightningrod", name: "Lightning Rod", usagePercent: 27.5 },
        ],
        items: [{ id: "lightball", name: "Light Ball", usagePercent: 88.2 }],
        moves: [
          { id: "thunderbolt", name: "Thunderbolt", usagePercent: 91.4 },
          { id: "quickattack", name: "Quick Attack", usagePercent: 44.1 },
        ],
        spreads: [{ name: "Timid:0/0/0/252/4/252", usagePercent: 63.2 }],
      },
    },
  });
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

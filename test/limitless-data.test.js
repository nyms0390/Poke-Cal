import test from "node:test";
import assert from "node:assert/strict";

import { buildLimitlessUsage, mergeLimitlessUsage } from "../src/data/limitless-data.js";

test("aggregates Limitless standings into usage rates", () => {
  const tournaments = [{ id: "event-1", game: "VGC", format: "M-B" }];
  const standings = new Map([
    [
      "event-1",
      [
        {
          decklist: [
            {
              id: "raichu",
              name: "Raichu",
              item: "Raichunite Y",
              ability: "Lightning Rod",
              attacks: ["Fake Out", "Zap Cannon", "Protect", "Focus Blast"],
              nature: "Timid",
              tera: "Electric",
            },
            {
              id: "sneasler",
              name: "Sneasler",
              item: "White Herb",
              ability: "Unburden",
              attacks: ["Fake Out", "Dire Claw", "Close Combat", "Protect"],
              nature: "Jolly",
              tera: "Water",
            },
          ],
        },
        {
          decklist: [
            {
              id: "raichu",
              name: "Raichu",
              item: "Focus Sash",
              ability: "Lightning Rod",
              attacks: ["Fake Out", "Zap Cannon", "Grass Knot", "Protect"],
              nature: "Modest",
              tera: "Fire",
            },
          ],
        },
      ],
    ],
  ]);

  const usage = buildLimitlessUsage(tournaments, standings);

  assert.equal(usage.source, "Limitless");
  assert.equal(usage.tournamentCount, 1);
  assert.equal(usage.teamCount, 2);
  assert.deepEqual(
    usage.pokemon.map(({ id, usageCount, usagePercent }) => [id, usageCount, usagePercent]),
    [
      ["raichu", 2, 100],
      ["sneasler", 1, 50],
    ],
  );
  assert.deepEqual(
    usage.pokemon[0].usage.items.map(({ id, usageCount, usagePercent }) => [
      id,
      usageCount,
      usagePercent,
    ]),
    [
      ["focussash", 1, 50],
      ["raichunitey", 1, 50],
    ],
  );
  assert.deepEqual(
    usage.pokemon[0].usage.moves.map(({ id, usageCount }) => [id, usageCount]).slice(0, 2),
    [
      ["fakeout", 2],
      ["protect", 2],
    ],
  );
  assert.deepEqual(
    usage.pokemon[0].usage.teras.map(({ id, usageCount, usagePercent }) => [id, usageCount, usagePercent]),
    [["electric", 1, 50], ["fire", 1, 50]],
  );
});

test("merges Limitless usage without keeping old catalog-source metadata", () => {
  const usage = {
    pokemon: [
      {
        id: "raichu",
        name: "Raichu",
        usageCount: 2,
        usagePercent: 100,
        usage: {
          abilities: [{ id: "lightningrod", name: "Lightning Rod", usageCount: 2, usagePercent: 100 }],
          items: [{ id: "raichunitey", name: "Raichunite Y", usageCount: 2, usagePercent: 100 }],
          moves: [{ id: "fakeout", name: "Fake Out", usageCount: 2, usagePercent: 100 }],
          natures: [{ id: "timid", name: "Timid", usageCount: 2, usagePercent: 100 }],
          teras: [{ id: "fire", name: "Fire", usageCount: 2, usagePercent: 100 }],
        },
      },
    ],
    abilities: [{ id: "lightningrod", name: "Lightning Rod", usageCount: 2, usagePercent: 100 }],
    items: [{ id: "raichunitey", name: "Raichunite Y", usageCount: 2, usagePercent: 100 }],
    moves: [{ id: "fakeout", name: "Fake Out", usageCount: 2, usagePercent: 100 }],
  };

  const merged = mergeLimitlessUsage(
    {
      pokemon: [
        {
          id: "raichu",
          name: "Raichu",
          champions: { source: "Legacy Catalog", sourceUrl: "https://example.test/raichu", usageCount: 418 },
        },
        {
          id: "pikachu",
          name: "Pikachu",
          champions: { source: "Legacy Catalog", sourceUrl: "https://example.test/pikachu", usageCount: 8 },
        },
      ],
      abilities: [{ id: "lightningrod", name: "Lightning Rod" }],
      items: [{ id: "raichunitey", name: "Raichunite Y" }],
      moves: [{ id: "fakeout", name: "Fake Out" }],
    },
    usage,
  );

  assert.equal(merged.pokemon[1].champions.source, "Limitless");
  assert.equal(merged.pokemon[1].champions.catalogSource, undefined);
  assert.equal(merged.pokemon[1].champions.usageCount, 2);
  assert.equal(merged.pokemon[1].champions.usage.items[0].id, "raichunitey");
  assert.equal(merged.pokemon[1].champions.usage.teras[0].id, "fire");
  assert.equal(merged.pokemon[0].champions.source, undefined);
  assert.equal(merged.pokemon[0].champions.usageCount, undefined);
  assert.equal(merged.pokemon[0].champions.catalogSource, undefined);
});

test("keeps Smogon SP spreads when merging or clearing Limitless usage", () => {
  const spreads = [{ name: "Jolly:2/32/0/0/0/32", usageCount: 60, usagePercent: 60 }];
  const usage = {
    pokemon: [
      {
        id: "raichu",
        name: "Raichu",
        usageCount: 2,
        usagePercent: 100,
        usage: { abilities: [], items: [], moves: [], natures: [] },
      },
    ],
    abilities: [],
    items: [],
    moves: [],
  };

  const merged = mergeLimitlessUsage(
    {
      pokemon: [
        {
          id: "raichu",
          name: "Raichu",
          champions: { legal: true, spreadsMeta: { source: "Smogon" }, usage: { spreads } },
        },
        {
          id: "pikachu",
          name: "Pikachu",
          champions: {
            legal: true,
            source: "Limitless",
            usageCount: 4,
            spreadsMeta: { source: "Smogon" },
            usage: { spreads, moves: [{ id: "fakeout", name: "Fake Out" }] },
          },
        },
      ],
      abilities: [],
      items: [],
      moves: [],
    },
    usage,
  );

  const [pikachu, raichu] = merged.pokemon;
  assert.deepEqual(raichu.champions.usage.spreads, spreads);
  assert.deepEqual(raichu.champions.usage.abilities, []);
  assert.equal(raichu.champions.spreadsMeta.source, "Smogon");
  assert.equal(raichu.champions.legal, true);

  assert.deepEqual(pikachu.champions.usage, { spreads });
  assert.equal(pikachu.champions.usageCount, undefined);
  assert.equal(pikachu.champions.spreadsMeta.source, "Smogon");
  assert.equal(pikachu.champions.legal, true);
});

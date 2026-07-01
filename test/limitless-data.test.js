import test from "node:test";
import assert from "node:assert/strict";

import { buildLimitlessUsage, mergeLimitlessUsage } from "../src/limitless-data.js";

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
            },
            {
              id: "sneasler",
              name: "Sneasler",
              item: "White Herb",
              ability: "Unburden",
              attacks: ["Fake Out", "Dire Claw", "Close Combat", "Protect"],
              nature: "Jolly",
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
});

test("merges Limitless usage without keeping old Pokemon Zone counts", () => {
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
          champions: { source: "Pokemon Zone", sourceUrl: "https://example.test/raichu", usageCount: 418 },
        },
        {
          id: "pikachu",
          name: "Pikachu",
          champions: { source: "Pokemon Zone", sourceUrl: "https://example.test/pikachu", usageCount: 8 },
        },
      ],
      abilities: [{ id: "lightningrod", name: "Lightning Rod" }],
      items: [{ id: "raichunitey", name: "Raichunite Y" }],
      moves: [{ id: "fakeout", name: "Fake Out" }],
    },
    usage,
  );

  assert.equal(merged.pokemon[1].champions.source, "Limitless");
  assert.equal(merged.pokemon[1].champions.catalogSource, "Pokemon Zone");
  assert.equal(merged.pokemon[1].champions.usageCount, 2);
  assert.equal(merged.pokemon[1].champions.usage.items[0].id, "raichunitey");
  assert.equal(merged.pokemon[0].champions.source, undefined);
  assert.equal(merged.pokemon[0].champions.usageCount, undefined);
  assert.equal(merged.pokemon[0].champions.catalogSource, "Pokemon Zone");
});

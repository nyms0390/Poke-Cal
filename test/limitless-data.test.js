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
  assert.equal("teras" in usage.pokemon[0].usage, false);
});

test("derives form-specific Mega usage from matching legal stones", () => {
  const tournaments = [{ id: "event-1", game: "VGC", format: "M-B" }];
  const standings = new Map([
    [
      "event-1",
      [
        {
          decklist: [
            {
              id: "charizard",
              name: "Charizard",
              item: "Charizardite X",
              ability: "Blaze",
              attacks: ["Flamethrower", "Protect", "Dragon Claw", "Tailwind"],
              nature: "Adamant",
            },
            {
              id: "raichu",
              name: "Raichu",
              item: "Raichunite X",
              ability: "Lightning Rod",
              attacks: ["Fake Out", "Protect", "Thunderbolt", "Helping Hand"],
              nature: "Jolly",
            },
          ],
        },
        {
          decklist: [
            {
              id: "charizard",
              name: "Charizard",
              item: "Charizardite Y",
              ability: "Blaze",
              attacks: ["Heat Wave", "Protect", "Air Slash", "Solar Beam"],
              nature: "Modest",
            },
            {
              id: "raichu",
              name: "Raichu",
              item: "Raichunite Y",
              ability: "Lightning Rod",
              attacks: ["Thunderbolt", "Protect", "Nasty Plot", "Fake Out"],
              nature: "Timid",
            },
          ],
        },
        {
          decklist: [
            {
              id: "charizard",
              name: "Charizard",
              item: "Charizardite X",
              ability: "Blaze",
              attacks: ["Flamethrower", "Protect", "Dragon Claw", "Tailwind"],
              nature: "Jolly",
            },
            {
              id: "raichu",
              name: "Raichu",
              item: "Focus Sash",
              ability: "Lightning Rod",
              attacks: ["Fake Out", "Protect", "Volt Switch", "Helping Hand"],
              nature: "Modest",
            },
            { id: "pikachu", name: "Pikachu", item: "Raichunite X", ability: "Static" },
            { id: "venusaur", name: "Venusaur", item: "Venusanite", ability: "Overgrow" },
            { id: "blastoise", name: "Blastoise", item: "Blastoisinite", ability: "Torrent" },
          ],
        },
      ],
    ],
  ]);
  const catalogs = {
    pokemon: [
      { id: "charizardmegax", name: "Charizard-Mega-X", abilities: ["Tough Claws"], champions: { legal: true } },
      { id: "charizardmegay", name: "Charizard-Mega-Y", abilities: ["Drought"], champions: { legal: true } },
      { id: "raichumegax", name: "Raichu-Mega-X", abilities: ["Electric Surge"], champions: { legal: true } },
      { id: "raichumegay", name: "Raichu-Mega-Y", abilities: ["No Guard"], champions: { legal: true } },
      { id: "venusaurmega", name: "Venusaur-Mega", abilities: ["Thick Fat"], champions: { legal: false } },
    ],
    items: [
      { id: "charizarditex", name: "Charizardite X", megaStone: { Charizard: "Charizard-Mega-X" } },
      { id: "charizarditey", name: "Charizardite Y", megaStone: { Charizard: "Charizard-Mega-Y" } },
      { id: "raichunitex", name: "Raichunite X", megaStone: { Raichu: "Raichu-Mega-X" } },
      { id: "raichunitey", name: "Raichunite Y", megaStone: { Raichu: "Raichu-Mega-Y" } },
      { id: "venusanite", name: "Venusanite", megaStone: { Venusaur: "Venusaur-Mega" } },
      { id: "blastoisinite", name: "Blastoisinite", megaStone: { Blastoise: "Blastoise-Mega" } },
    ],
  };

  const usage = buildLimitlessUsage(tournaments, standings, catalogs);
  const byId = new Map(usage.pokemon.map((entry) => [entry.id, entry]));

  assert.equal(byId.get("charizard").usageCount, 3);
  assert.equal(byId.get("raichu").usageCount, 3);
  assert.deepEqual(
    ["charizardmegax", "charizardmegay", "raichumegax", "raichumegay"].map((id) => [
      id,
      byId.get(id).usageCount,
      byId.get(id).usagePercent,
    ]),
    [
      ["charizardmegax", 2, (2 / 3) * 100],
      ["charizardmegay", 1, (1 / 3) * 100],
      ["raichumegax", 1, (1 / 3) * 100],
      ["raichumegay", 1, (1 / 3) * 100],
    ],
  );

  const charizardX = byId.get("charizardmegax");
  assert.deepEqual(charizardX.usage.abilities.map(({ id, usagePercent }) => [id, usagePercent]), [
    ["toughclaws", 100],
  ]);
  assert.deepEqual(charizardX.usage.items.map(({ id, usagePercent }) => [id, usagePercent]), [
    ["charizarditex", 100],
  ]);
  assert.deepEqual(charizardX.usage.moves.map(({ id }) => id), [
    "dragonclaw",
    "flamethrower",
    "protect",
    "tailwind",
  ]);
  assert.deepEqual(charizardX.usage.natures.map(({ id, usageCount }) => [id, usageCount]), [
    ["adamant", 1],
    ["jolly", 1],
  ]);
  assert.deepEqual(byId.get("charizardmegay").usage.items.map(({ id }) => id), ["charizarditey"]);
  assert.deepEqual(byId.get("charizardmegay").usage.moves.map(({ id }) => id), [
    "airslash",
    "heatwave",
    "protect",
    "solarbeam",
  ]);
  assert.deepEqual(byId.get("charizardmegay").usage.natures.map(({ id }) => id), ["modest"]);
  assert.deepEqual(byId.get("raichumegax").usage.abilities.map(({ id }) => id), ["electricsurge"]);
  assert.deepEqual(byId.get("raichumegay").usage.abilities.map(({ id }) => id), ["noguard"]);

  assert.equal(usage.items.find(({ id }) => id === "charizarditex").usageCount, 2);
  assert.equal(usage.abilities.find(({ id }) => id === "blaze").usageCount, 3);
  assert.equal(usage.abilities.some(({ id }) => id === "toughclaws"), false);
  assert.equal(byId.has("venusaurmega"), false);
  assert.equal(byId.has("blastoisemega"), false);
  assert.equal(byId.has("raichumegaz"), false);
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
          champions: {
            legal: true,
            source: "Legacy Catalog",
            sourceUrl: "https://example.test/raichu",
            usageCount: 418,
          },
        },
        {
          id: "pikachu",
          name: "Pikachu",
          champions: {
            legal: true,
            source: "Legacy Catalog",
            sourceUrl: "https://example.test/pikachu",
            usageCount: 8,
          },
        },
      ],
      abilities: [{ id: "lightningrod", name: "Lightning Rod" }],
      items: [{ id: "raichunitey", name: "Raichunite Y" }],
      moves: [{ id: "fakeout", name: "Fake Out" }],
    },
    usage,
  );

  assert.deepEqual(merged.pokemon.map(({ id }) => id), ["pikachu", "raichu"]);
  assert.equal(merged.pokemon[1].champions.source, "Limitless");
  assert.equal(merged.pokemon[1].champions.catalogSource, undefined);
  assert.equal(merged.pokemon[1].champions.usageCount, 2);
  assert.equal(merged.pokemon[1].champions.usage.items[0].id, "raichunitey");
  assert.equal("teras" in merged.pokemon[1].champions.usage, false);
  assert.equal(merged.pokemon[0].champions.source, undefined);
  assert.equal(merged.pokemon[0].champions.usageCount, undefined);
  assert.equal(merged.pokemon[0].champions.catalogSource, undefined);
});

test("drops unmatched usage rows and malformed nested catalog usage", () => {
  const merged = mergeLimitlessUsage(
    {
      pokemon: [
        { id: "raichu", name: "Raichu", champions: { legal: true } },
        { id: "stale", name: "Stale", champions: { source: "Limitless", usageCount: 1 } },
      ],
      abilities: [{ id: "lightningrod", name: "Lightning Rod", champions: { legal: true } }],
      items: [{ id: "raichunitey", name: "Raichunite Y", champions: { legal: true } }],
      moves: [
        { id: "fakeout", name: "Fake Out", champions: { legal: true } },
        { id: "illegalmove", name: "Illegal Move", champions: { legal: false } },
      ],
    },
    {
      pokemon: [
        {
          id: "raichu",
          name: "Raichu",
          usageCount: 2,
          usagePercent: 100,
          usage: {
            abilities: [
              { id: "lightningrod", name: "Lightning Rod", usageCount: 2, usagePercent: 100 },
              { id: "typoability", name: "Typo Ability", usageCount: 1, usagePercent: 50 },
            ],
            items: [
              { id: "raichunitey", name: "Raichunite Y", usageCount: 2, usagePercent: 100 },
              { id: "typoitem", name: "Typo Item", usageCount: 1, usagePercent: 50 },
            ],
            moves: [
              { id: "fakeout", name: "Fake Out", usageCount: 2, usagePercent: 100 },
              { id: "typomove", name: "Typo Move", usageCount: 1, usagePercent: 50 },
              { id: "illegalmove", name: "Illegal Move", usageCount: 1, usagePercent: 50 },
            ],
          },
        },
        { id: "unknownpokemon", name: "Unknown Pokémon", usageCount: 1, usagePercent: 50, usage: {} },
      ],
      abilities: [
        { id: "lightningrod", name: "Lightning Rod", usageCount: 2, usagePercent: 100 },
        { id: "typoability", name: "Typo Ability", usageCount: 1, usagePercent: 50 },
      ],
      items: [
        { id: "raichunitey", name: "Raichunite Y", usageCount: 2, usagePercent: 100 },
        { id: "typoitem", name: "Typo Item", usageCount: 1, usagePercent: 50 },
      ],
      moves: [
        { id: "fakeout", name: "Fake Out", usageCount: 2, usagePercent: 100 },
        { id: "typomove", name: "Typo Move", usageCount: 1, usagePercent: 50 },
        { id: "illegalmove", name: "Illegal Move", usageCount: 1, usagePercent: 50 },
      ],
    },
  );

  assert.deepEqual(merged.pokemon.map(({ id }) => id), ["raichu"]);
  assert.deepEqual(merged.abilities.map(({ id }) => id), ["lightningrod"]);
  assert.deepEqual(merged.items.map(({ id }) => id), ["raichunitey"]);
  assert.deepEqual(merged.moves.map(({ id }) => id), ["fakeout", "illegalmove"]);
  assert.deepEqual(merged.pokemon[0].champions.usage.abilities.map(({ id }) => id), ["lightningrod"]);
  assert.deepEqual(merged.pokemon[0].champions.usage.items.map(({ id }) => id), ["raichunitey"]);
  assert.deepEqual(merged.pokemon[0].champions.usage.moves.map(({ id }) => id), ["fakeout"]);
  assert.equal(merged.moves.find(({ id }) => id === "illegalmove").champions.usageCount, undefined);
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

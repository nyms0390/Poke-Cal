import test from "node:test";
import assert from "node:assert/strict";

import { popularOpponentPool, speedBreakpoints, speedTiers } from "../src/data/speed-line.js";
import { calculateSpeed } from "../src/engine/speed.js";

const userPokemon = pokemon("user", "Yourmon", 100);
const tiePokemon = pokemon("tie", "Tiemate", 100);
const slowPokemon = pokemon("slow", "Slowmon", 80);
const fastPokemon = pokemon("fast", "Fastmon", 120);

const user = {
  pokemon: userPokemon,
  nature: "Hardy",
  spe: 0,
  mods: {},
};

test("base mode uses raw base Speed, merges ties, and ignores every modifier", () => {
  const rows = speedTiers(
    { ...user, nature: "Timid", spe: 32, mods: { tailwind: true, stage: 6 } },
    [{ pokemon: tiePokemon }, { pokemon: slowPokemon }],
    {
      mode: "base",
      trickRoom: true,
      presetFilter: ["max"],
      userMods: { paralysis: true, choiceScarf: true },
      opponentMods: { tailwind: true, stage: 6 },
    },
  );

  assert.deepEqual(rows.map(({ speed }) => speed), [100, 80]);
  assert.deepEqual(rows[0].entries.map(({ name, isUser }) => [name, isUser]), [
    ["Yourmon", true],
    ["Tiemate", false],
  ]);
  assert.equal(rows[0].actsBefore, null);
  assert.equal(rows[0].stage, 0);
});

test("base mode omits NCP and Limitless battle-only rows", () => {
  const opponent = {
    pokemon: {
      ...pokemon("profilemon", "Profilemon", 100),
      champions: {
        usage: { speedProfiles: [{
          nature: "Jolly",
          ability: { id: "swiftswim", name: "Swift Swim" },
          item: { id: "choicescarf", name: "Choice Scarf" },
          usageCount: 3,
        }] },
        ncp: { sets: [{
          name: "Curated",
          nature: "Jolly",
          sps: { spe: 32 },
          item: "Choice Scarf",
          ability: "Swift Swim",
        }] },
      },
    },
  };
  const entries = speedTiers(user, [opponent], {
    mode: "base",
    includeActiveSpeedAbilities: true,
  }).flatMap(({ entries: rowEntries }) => rowEntries);

  assert.ok(entries.length > 0);
  assert.ok(entries.every(({ source }) => source !== "NCP" && source !== "Limitless"));
  assert.equal(entries.some(({ abilityActive }) => abilityActive), false);
});

test("battle mode interleaves fixed opponent presets by calculated Speed", () => {
  const rows = speedTiers(user, [
    { pokemon: slowPokemon, likelyPresetLabel: "max (neutral 32)" },
    { pokemon: fastPokemon, likelyPresetLabel: "min (-spe 0)" },
  ], { mode: "battle" });

  assert.deepEqual(rows.map(({ speed }) => speed), [189, 172, 145, 140, 132, 126, 120, 100, 90]);
  assert.equal(
    rows.flatMap(({ entries }) => entries).find(({ name, presetLabel }) =>
      name === "Slowmon" && presetLabel === "Fast").likely,
    true,
  );
  assert.equal(
    rows.flatMap(({ entries }) => entries).find(({ name, presetLabel }) =>
      name === "Fastmon" && presetLabel === "Slow").likely,
    true,
  );
  assert.deepEqual(
    rows.flatMap(({ entries }) => entries)
      .filter(({ name }) => name === "Slowmon")
      .map(({ presetLabel, presetKey }) => [presetLabel, presetKey]),
    [["Max", "max"], ["Fast", "fast"], ["Neutral", "neutral"], ["Slow", "slow"]],
  );
});

test("Trick Room flips actsBefore without changing descending row order", () => {
  const normal = speedTiers(user, [{ pokemon: fastPokemon }], {
    mode: "battle",
    presetFilter: ["neutral"],
  });
  const trickRoom = speedTiers(user, [{ pokemon: fastPokemon }], {
    mode: "battle",
    trickRoom: true,
    presetFilter: ["neutral"],
  });

  assert.deepEqual(normal.map(({ speed }) => speed), [140, 120]);
  assert.deepEqual(trickRoom.map(({ speed }) => speed), [140, 120]);
  assert.equal(normal[0].actsBefore, true);
  assert.equal(trickRoom[0].actsBefore, false);
});

test("battle modifiers delegate stacking and stages to calculateSpeed", () => {
  const expected = calculateSpeed({
    baseSpeed: 90,
    sp: 20,
    nature: "Hardy",
    stage: 1,
    tailwind: true,
    status: "paralysis",
    speedMultiplier: 1.5,
  }).modifiedSpeed;
  // 130 raw stat -> +1 stage 195 -> Scarf floor(292.5)=292 -> Tailwind 584 -> paralysis 292.
  assert.equal(expected, 292);

  const rows = speedTiers(
    { pokemon: pokemon("stack", "Stackmon", 90), nature: "Hardy", spe: 20 },
    [],
    {
      mode: "battle",
      userMods: { stage: 1, tailwind: true, paralysis: true, choiceScarf: true },
    },
  );
  assert.equal(rows[0].speed, expected);
  assert.equal(rows[0].stage, 1);

  for (const [stage, expectedSpeed] of [[-1, 66], [1, 150], [2, 200]]) {
    const [row] = speedTiers(user, [{ pokemon: slowPokemon }], {
      mode: "battle",
      presetFilter: ["neutral"],
      opponentMods: { stage },
    }).filter(({ entries }) => entries.some(({ name }) => name === "Slowmon"));
    assert.equal(row.speed, expectedSpeed);
    assert.equal(row.stage, stage);
  }
});

test("finds every minimum Speed-nature breakpoint that strictly outspeeds each tier", () => {
  const reachableRows = speedTiers(user, [{ pokemon: slowPokemon }], {
    mode: "battle",
    presetFilter: ["fast"],
  });
  const [reachable] = speedBreakpoints(user, reachableRows);
  assert.equal(reachable.tierSpeed, 132);
  assert.deepEqual(reachable.choices, [
    { nature: "Timid", natureLabel: "+Spe", requiredSp: 1 },
    { nature: "Hardy", natureLabel: "Neutral", requiredSp: 13 },
    { nature: "Brave", natureLabel: "-Spe", requiredSp: 28 },
  ]);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 12 }).modifiedSpeed, 132);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 13 }).modifiedSpeed, 133);

  const natureRows = speedTiers(user, [{ pokemon: pokemon("wall", "Wall", 140) }], {
    mode: "battle",
    presetFilter: ["neutral"],
  });
  const [nature] = speedBreakpoints(user, natureRows);
  assert.deepEqual(nature, {
    tierSpeed: 160,
    choices: [{ nature: "Timid", natureLabel: "+Spe", requiredSp: 27 }],
  });
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 26, nature: "Timid" }).modifiedSpeed, 160);
  assert.equal(calculateSpeed({ baseSpeed: 100, sp: 27, nature: "Timid" }).modifiedSpeed, 161);
});

test("breakpoints cover slower rows, preserve modifiers, and omit rows without opponents", () => {
  const rows = speedTiers(user, [{ pokemon: slowPokemon }], {
    mode: "battle",
    presetFilter: ["neutral"],
    userMods: { paralysis: true },
  });

  assert.deepEqual(speedBreakpoints(user, rows), [{
    tierSpeed: 100,
    choices: [],
  }]);
  assert.deepEqual(speedBreakpoints(user, speedTiers(user, [], { mode: "battle" })), []);
  assert.deepEqual(speedBreakpoints(user, speedTiers(user, [], { mode: "base" })), []);
});

test("recomputing modes and filters does not mutate manually supplied opponents", () => {
  const opponents = [{ pokemon: slowPokemon, likelyPresetLabel: "uninvested", manual: true }];
  speedTiers(user, opponents, { mode: "base" });
  speedTiers(user, opponents, { mode: "battle", presetFilter: ["max"] });
  assert.deepEqual(opponents, [
    { pokemon: slowPokemon, likelyPresetLabel: "uninvested", manual: true },
  ]);
});

test("selects popular opponents in ten-Pokémon steps and preserves manual additions", () => {
  const popular = Array.from({ length: 50 }, (_, index) => ({
    pokemon: pokemon(`popular-${index + 1}`, `Popular ${index + 1}`, 100 - index),
  }));
  const manual = [{ pokemon: pokemon("manual", "Manual", 75), manual: true }];

  for (const count of [10, 20, 30, 40, 50]) {
    const pool = popularOpponentPool(popular, manual, count);
    assert.equal(pool.length, count + 1);
    assert.equal(pool[count - 1].pokemon.id, `popular-${count}`);
    assert.equal(pool.at(-1), manual[0]);
  }
  assert.equal(popular.length, 50);
  assert.deepEqual(manual, [{ pokemon: pokemon("manual", "Manual", 75), manual: true }]);
});

test("excludes the selected user from popular, Mega-family, and manual opponents", () => {
  const selected = { ...pokemon("popular-1", "Popular 1", 100), baseSpecies: "Popular 1" };
  const mega = { ...pokemon("popular-1-mega", "Popular 1-Mega", 130), baseSpecies: "Popular 1" };
  const popular = [
    { pokemon: selected },
    ...Array.from({ length: 9 }, (_, index) => ({
      pokemon: pokemon(`popular-${index + 2}`, `Popular ${index + 2}`, 99 - index),
    })),
  ];
  const manual = [
    { pokemon: selected, manual: true },
    { pokemon: mega, manual: true },
  ];

  const basePool = popularOpponentPool(popular, manual, 10, [selected, mega], {
    excludePokemonId: selected.id,
  });
  const megaPool = popularOpponentPool(popular, manual, 10, [selected, mega], {
    excludePokemonId: mega.id,
  });

  assert.equal(basePool.some(({ pokemon: entry }) => entry.id === selected.id), false);
  assert.equal(basePool.filter(({ pokemon: entry }) => entry.id === mega.id).length, 1);
  assert.equal(megaPool.some(({ pokemon: entry }) => entry.id === mega.id), false);
  assert.equal(megaPool.filter(({ pokemon: entry }) => entry.id === selected.id).length, 1);
});

test("adds Mega forms for popular Pokémon without consuming popularity slots", () => {
  const charizard = { ...pokemon("charizard", "Charizard", 100), baseSpecies: "Charizard" };
  const megaX = { ...pokemon("charizardmegax", "Charizard-Mega-X", 130), baseSpecies: "Charizard" };
  const megaY = { ...pokemon("charizardmegay", "Charizard-Mega-Y", 140), baseSpecies: "Charizard" };
  const gmax = { ...pokemon("charizardgmax", "Charizard-Gmax", 100), baseSpecies: "Charizard" };
  const popular = [
    { pokemon: charizard, likelyPresetLabel: "max (neutral 32)" },
    { pokemon: megaY, likelyPresetLabel: "min (-spe 0)" },
    ...Array.from({ length: 8 }, (_, index) => ({
      pokemon: pokemon(`popular-${index + 2}`, `Popular ${index + 2}`, 100 - index),
    })),
  ];
  const manual = [
    { pokemon: megaX, manual: true },
    { pokemon: pokemon("manual", "Manual", 75), manual: true },
  ];

  const pool = popularOpponentPool(popular, manual, 10, [charizard, megaX, megaY, gmax]);

  assert.deepEqual(pool.slice(0, 3).map(({ pokemon: entry }) => entry.id), [
    "charizard",
    "charizardmegax",
    "charizardmegay",
  ]);
  assert.equal(pool.find(({ pokemon: entry }) => entry.id === "charizardgmax"), undefined);
  assert.equal(pool.filter(({ pokemon: entry }) => entry.id === "charizardmegax").length, 1);
  assert.equal(pool.filter(({ pokemon: entry }) => entry.id === "charizardmegay").length, 1);
  assert.equal(pool.find(({ pokemon: entry }) => entry.id === "charizardmegax").likelyPresetLabel, "max (neutral 32)");
  assert.equal(pool.find(({ pokemon: entry }) => entry.id === "charizardmegay").likelyPresetLabel, "min (-spe 0)");
  assert.equal(pool.length, 12);
  assert.equal(popular.length, 10);
  assert.equal(manual.length, 2);

  const megaEntry = speedTiers(user, [{ pokemon: megaX }], { mode: "base" })
    .flatMap(({ entries }) => entries)
    .find(({ id }) => id === "charizardmegax");
  assert.equal(megaEntry.spriteId, "charizard-megax");
});

test("adds exact NCP rows and derives an opponent Choice Scarf from the row item", () => {
  const opponent = {
    pokemon: {
      ...pokemon("ncpmon", "NCPmon", 100),
      champions: {
        ncp: { sets: [{
          name: "Jolly Scarf",
          nature: "Jolly",
          sps: { spe: 32 },
          item: "Choice Scarf",
          ability: "Swift Swim",
        }] },
      },
    },
  };
  const entries = speedTiers(user, [opponent], {
    mode: "battle",
    presetFilter: [],
  }).flatMap((row) => row.entries.map((entry) => ({ ...entry, speed: row.speed })))
    .filter(({ name }) => name === "NCPmon");

  const exact = entries.find(({ source }) => source === "NCP");
  assert.equal(exact.exact, true);
  assert.equal(exact.assumed, false);
  assert.equal(exact.nature, "Jolly");
  assert.equal(exact.sp, 32);
  assert.equal(exact.item.name, "Choice Scarf");
  assert.equal(exact.ability.name, "Swift Swim");
  assert.equal(exact.speed, 250);
  assert.equal(exact.likely, undefined);
});

test("deduplicates NCP tuples and skips sets without an item or explicit ability", () => {
  const opponent = {
    pokemon: {
      ...pokemon("ncpmon", "NCPmon", 100),
      champions: {
        ncp: { sets: [
          {
            name: "First tuple",
            nature: "Jolly",
            sps: { spe: 32 },
            item: "Iron Ball",
            ability: "Swift Swim",
          },
          {
            name: "Duplicate tuple",
            nature: "Jolly",
            sps: { spe: 32 },
            item: "Iron Ball",
            ability: "Swift Swim",
          },
          {
            name: "Missing ability Swift Swim",
            nature: "Jolly",
            sps: { spe: 32 },
            item: "Iron Ball",
          },
          {
            name: "Missing item",
            nature: "Jolly",
            sps: { spe: 32 },
            ability: "Swift Swim",
          },
        ] },
      },
    },
  };
  const entries = speedTiers(user, [opponent], { mode: "battle", presetFilter: [] })
    .flatMap(({ entries: rowEntries }) => rowEntries)
    .filter(({ source }) => source === "NCP");

  assert.equal(entries.length, 1);
  assert.equal(entries[0].setLabel, "First tuple");
  assert.equal(entries[0].exact, true);
});

test("selects top four joint profiles plus the best profile for each Speed ability", () => {
  const profiles = [
    ["Jolly", "Adaptability", "Focus Sash", 10],
    ["Timid", "Adaptability", "Life Orb", 9],
    ["Hardy", "Intimidate", "Leftovers", 8],
    ["Modest", "Intimidate", "Sitrus Berry", 7],
    ["Adamant", "Swift Swim", "Mystic Water", 1],
  ].map(([nature, ability, item, usageCount]) => ({
    nature,
    ability: { id: ability.toLowerCase().replaceAll(" ", ""), name: ability },
    item: { id: item.toLowerCase().replaceAll(" ", ""), name: item },
    usageCount,
    usagePercent: usageCount,
  }));
  const opponent = {
    pokemon: { ...pokemon("profilemon", "Profilemon", 100), champions: { usage: { speedProfiles: profiles } } },
  };

  const entries = speedTiers(user, [opponent], { mode: "battle", presetFilter: [] })
    .flatMap((row) => row.entries.map((entry) => ({ ...entry, speed: row.speed })))
    .filter(({ name, source }) => name === "Profilemon" && source === "Limitless");
  assert.deepEqual(entries.map(({ nature }) => nature).sort(), ["Adamant", "Hardy", "Jolly", "Modest", "Timid"]);
  assert.equal(entries.find(({ nature }) => nature === "Adamant").assumed, true);
  assert.equal(entries.find(({ nature }) => nature === "Adamant").sp, 32);
});

test("canonicalizes valid profile natures and drops invalid profile rows", () => {
  const opponent = {
    pokemon: {
      ...pokemon("profilemon", "Profilemon", 100),
      champions: { usage: { speedProfiles: [
        {
          nature: "quiet",
          ability: { id: "adaptability", name: "Adaptability" },
          item: { id: "leftovers", name: "Leftovers" },
          usageCount: 2,
        },
        {
          nature: "Adamany",
          ability: { id: "adaptability", name: "Adaptability" },
          item: { id: "leftovers", name: "Leftovers" },
          usageCount: 3,
        },
      ] } },
    },
  };
  const entries = speedTiers(user, [opponent], { mode: "battle", presetFilter: [] })
    .flatMap(({ entries: rowEntries }) => rowEntries)
    .filter(({ source }) => source === "Limitless");

  assert.deepEqual(entries.map(({ nature }) => nature), ["Quiet"]);
});

test("adds active and inactive profile variants without double Scarf and transfers likelihood", () => {
  const opponent = {
    pokemon: {
      ...pokemon("rainmon", "Rainmon", 100),
      champions: { usage: { speedProfiles: [{
        nature: "Jolly",
        ability: { id: "swiftswim", name: "Swift Swim" },
        item: { id: "choicescarf", name: "Choice Scarf" },
        usageCount: 4,
        usagePercent: 80,
      }] } },
    },
  };
  const entries = speedTiers(user, [opponent], {
    mode: "battle",
    presetFilter: [],
    includeActiveSpeedAbilities: true,
    opponentMods: { choiceScarf: true },
  }).flatMap((row) => row.entries.map((entry) => ({ ...entry, speed: row.speed })))
    .filter(({ name, source }) => name === "Rainmon" && source === "Limitless");
  const inactive = entries.find(({ abilityActive }) => !abilityActive);
  const active = entries.find(({ abilityActive }) => abilityActive);
  assert.equal(inactive.speed, 250);
  assert.equal(active.speed, 501);
  assert.equal(inactive.likely, false);
  assert.equal(active.likely, true);
  assert.equal(active.choiceScarf, true);
  assert.equal(active.presetKey, "limitless");
});

test("applies Iron Ball to exact/profile rows and stacks it with an active ability", () => {
  const opponent = profileOpponent("ironball", "Iron Ball", "Swift Swim", "Iron Ball");
  const entries = speedTiers(user, [opponent], {
    mode: "battle",
    presetFilter: [],
    includeActiveSpeedAbilities: true,
  }).flatMap(({ speed, entries: rowEntries }) => rowEntries.map((entry) => ({ ...entry, speed })))
    .filter(({ name, source }) => name === "Iron Ball" && source === "Limitless");
  const inactive = entries.find(({ abilityActive }) => !abilityActive);
  const active = entries.find(({ abilityActive }) => abilityActive);

  assert.equal(inactive.speed, 83);
  assert.equal(active.speed, 167);
  assert.equal(active.presetKey, "limitless");
});

test("only rain and sun abilities are suppressed by Utility Umbrella", () => {
  const rain = profileOpponent("rain", "Rain", "Swift Swim", "Utility Umbrella");
  const sun = profileOpponent("sun", "Sun", "Chlorophyll", "Utility Umbrella");
  const sand = profileOpponent("sand", "Sand", "Sand Rush", "Utility Umbrella");
  const snow = profileOpponent("snow", "Snow", "Slush Rush", "Utility Umbrella");
  const entries = speedTiers(user, [rain, sun, sand, snow], {
    mode: "battle",
    presetFilter: [],
    includeActiveSpeedAbilities: true,
  }).flatMap(({ entries: rowEntries }) => rowEntries);

  for (const name of ["Rain", "Sun"]) {
    assert.equal(entries.some((entry) => entry.name === name && entry.abilityActive), false);
  }
  for (const name of ["Sand", "Snow"]) {
    assert.equal(entries.some((entry) => entry.name === name && entry.abilityActive), true);
  }
});

test("consumes the item for active Unburden and does not create unsupported variants", () => {
  const unburden = profileOpponent("unburden", "Unburden", "Unburden", "Choice Scarf");
  const unsupported = profileOpponent("unsupported", "Unsupported", "Adaptability", "Choice Scarf");
  const entries = speedTiers(user, [unburden, unsupported], {
    mode: "battle",
    presetFilter: [],
    includeActiveSpeedAbilities: true,
  }).flatMap((row) => row.entries.map((entry) => ({ ...entry, speed: row.speed })));

  const active = entries.find(({ name, abilityActive }) => name === "Unburden" && abilityActive);
  assert.equal(active.itemConsumed, true);
  assert.equal(active.choiceScarf, false);
  assert.equal(active.speed, 334);
  assert.equal(entries.some(({ name, abilityActive }) => name === "Unsupported" && abilityActive), false);
});

test("breakpoints retain the user's active ability and Choice Scarf modifiers", () => {
  const rows = speedTiers(
    { ...user, ability: { id: "swiftswim", name: "Swift Swim" }, item: { id: "choicescarf", name: "Choice Scarf" } },
    [{ pokemon: slowPokemon }],
    {
      mode: "battle",
      presetFilter: ["neutral"],
      userMods: {
        ability: { id: "swiftswim", name: "Swift Swim" },
        item: { id: "choicescarf", name: "Choice Scarf" },
        abilityActive: true,
        choiceScarf: true,
      },
    },
  );
  assert.equal(rows.context.userMods.choiceScarf, true);
  assert.equal(rows.context.userMods.abilityActive, true);
  assert.equal(rows[0].speed, 360);
  assert.deepEqual(speedBreakpoints(user, speedTiers(user, [], { mode: "base" })), []);
});

function pokemon(id, name, spe) {
  return {
    id,
    name,
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe },
  };
}

function profileOpponent(id, name, ability, item) {
  return {
    pokemon: {
      ...pokemon(id, name, 100),
      champions: { usage: { speedProfiles: [{
        nature: "Jolly",
        ability: { id: ability.toLowerCase().replaceAll(" ", ""), name: ability },
        item: { id: item.toLowerCase().replaceAll(" ", ""), name: item },
        usageCount: 1,
        usagePercent: 100,
      }] } },
    },
  };
}

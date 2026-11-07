import test from "node:test";
import assert from "node:assert/strict";

import { breakPoints, breakTargetSpread, yourDamage } from "../src/data/break-points.js";
import { bulkAttackerSpread, threatDamage } from "../src/data/bulk-points.js";
import { mergeLimitlessUsage } from "../src/data/limitless-data.js";
import { buildSmogonSpreads, mergeSmogonSpreads } from "../src/data/smogon-data.js";
import {
  buildSpreadGroups,
  speedGroupForNature,
  spreadGroupsFor,
  topSpreadGroup,
  topSpreadGroups,
} from "../src/data/spread-groups.js";
import { threatForPokemon } from "../src/data/threats.js";
import { createField } from "../src/engine/field.js";
import { createSideState } from "../src/ui/battle-state.js";
import { applyThreatControl, threatAnalysisSignature } from "../src/ui/builder-state.js";

// Archaludon's base stats, so the groups below are the real October ladder stat lines.
const baseStats = { hp: 90, atk: 105, def: 130, spa: 125, spd: 65, spe: 85 };

function pokemonWith(spreads, extraUsage = {}) {
  return {
    id: "archaludon",
    name: "Archaludon",
    types: ["Steel", "Dragon"],
    baseStats,
    champions: {
      usagePercent: 16.6,
      usage: {
        natures: [
          { id: "calm", name: "Calm", usagePercent: 53 },
          { id: "bold", name: "Bold", usagePercent: 19 },
        ],
        spreads,
        ...extraUsage,
      },
    },
  };
}

test("groups spreads by the final stats each key reads, not by SP or nature", () => {
  // Calm and Modest leave Def neutral, so 8 Def SP is one Def stat (158) for both; Bold 1 Def
  // reaches 166. Calm and Bold both leave SpA neutral, so every 1 SpA spread is one SpA group.
  const spreads = [
    { name: "Bold:32/0/1/1/32/0", usagePercent: 17 },
    { name: "Calm:32/0/8/1/25/0", usagePercent: 5 },
    { name: "Modest:32/0/8/1/25/0", usagePercent: 4 },
    { name: "Calm:32/0/8/1/20/5", usagePercent: 3 },
    { name: "Calm:32/0/1/1/32/0", usagePercent: 2 },
  ];
  const pokemon = pokemonWith(spreads);

  assert.deepEqual(spreadGroupsFor(pokemon, spreads, "def"), [
    { spread: "Bold:32/0/1/1/32/0", share: 17, spreadCount: 1 },
    { spread: "Calm:32/0/8/1/25/0", share: 12, spreadCount: 3 },
    { spread: "Calm:32/0/1/1/32/0", share: 2, spreadCount: 1 },
  ]);
  // Calm 25 SpD and Modest 25 SpD differ (Calm raises SpD), so only the Calm ones join.
  assert.deepEqual(spreadGroupsFor(pokemon, spreads, "spd")[0], {
    spread: "Bold:32/0/1/1/32/0", share: 17, spreadCount: 1,
  });
  assert.deepEqual(spreadGroupsFor(pokemon, spreads, "spa"), [
    { spread: "Bold:32/0/1/1/32/0", share: 27, spreadCount: 4 },
    { spread: "Modest:32/0/8/1/25/0", share: 4, spreadCount: 1 },
  ]);
  // Bold, Calm and Modest all leave Speed neutral, so every 0 Spe spread is one Speed (105).
  assert.deepEqual(spreadGroupsFor(pokemon, spreads, "spe"), [
    { spread: "Bold:32/0/1/1/32/0", share: 28, spreadCount: 4 },
    { spread: "Calm:32/0/8/1/20/5", share: 3, spreadCount: 1 },
  ]);
  assert.equal(spreadGroupsFor(pokemon, spreads, "hp").length, 0, "unknown keys have no groups");
});

test("a group of small spreads outranks a single larger spread", () => {
  const spreads = [
    { name: "Bold:32/0/1/1/32/0", usagePercent: 17 },
    { name: "Calm:32/0/8/1/25/0", usagePercent: 9 },
    { name: "Modest:32/0/8/1/25/0", usagePercent: 9 },
  ];
  const group = topSpreadGroup(pokemonWith(spreads), "def");

  assert.equal(group.spreadName, "Calm:32/0/8/1/25/0");
  assert.equal(group.nature, "Calm");
  assert.equal(group.share, 18);
  assert.equal(group.spreadCount, 2);
  assert.deepEqual(group.stats, { hp: 197, def: 158 });
});

test("stored spread groups win over the stored top spreads", () => {
  const pokemon = pokemonWith(
    [{ name: "Bold:32/0/1/1/32/0", usagePercent: 17 }],
    { spreadGroups: { def: [{ spread: "Calm:32/0/8/1/25/0", share: 31, spreadCount: 9 }] } },
  );

  assert.equal(topSpreadGroup(pokemon, "def").spreadName, "Calm:32/0/8/1/25/0");
  assert.equal(topSpreadGroup(pokemon, "def").share, 31);
  assert.equal(topSpreadGroup(pokemon, "spd").spreadName, "Bold:32/0/1/1/32/0", "falls back per key");
  assert.equal(topSpreadGroups(pokemonWith([])), null);
});

test("the Smogon merge builds groups from every ladder spread, not only the stored top ones", () => {
  const chaos = {
    info: { metagame: "gen9championsvgc2026regmc", cutoff: 1760, "number of battles": 10 },
    data: {
      Archaludon: {
        Spreads: {
          "Bold:32/0/1/1/32/0": 30,
          "Calm:32/0/8/1/25/0": 22,
          "Modest:32/0/8/1/25/0": 20,
          "Calm:32/0/8/1/20/5": 18,
          "Timid:2/0/0/32/0/32": 10,
        },
      },
    },
  };
  const usage = buildSmogonSpreads([chaos], { top: 2, month: "2026-10" });
  const [merged] = mergeSmogonSpreads([pokemonWith([])], usage);

  assert.equal(merged.champions.usage.spreads.length, 2);
  assert.deepEqual(merged.champions.usage.spreadGroups.def[0], {
    spread: "Calm:32/0/8/1/25/0",
    share: 60,
    spreadCount: 3,
  });
  assert.equal("allSpreads" in merged.champions.usage, false);
  assert.deepEqual(
    merged.champions.usage.spreadGroups,
    buildSpreadGroups(pokemonWith([]), usage.pokemon[0].allSpreads),
  );

  const [cleared] = mergeSmogonSpreads([merged], { ...usage, pokemon: [] });
  assert.equal(cleared.champions.usage.spreadGroups, undefined);
});

test("re-merging Limitless usage keeps the Smogon spread groups", () => {
  const spreadGroups = { def: [{ spread: "Bold:32/0/1/1/32/0", share: 17, spreadCount: 1 }] };
  const pokemon = { ...pokemonWith([{ name: "Bold:32/0/1/1/32/0", usagePercent: 17 }], { spreadGroups }) };
  pokemon.champions = { ...pokemon.champions, legal: true };
  const catalogs = { pokemon: [pokemon], abilities: [], items: [], moves: [] };
  const merged = mergeLimitlessUsage(catalogs, {
    pokemon: [{ id: "archaludon", name: "Archaludon", usageCount: 2, usagePercent: 20, usage: {} }],
    abilities: [],
    items: [],
    moves: [],
  });
  const cleared = mergeLimitlessUsage(catalogs, { pokemon: [], abilities: [], items: [], moves: [] });

  assert.deepEqual(merged.pokemon[0].champions.usage.spreadGroups, spreadGroups);
  assert.deepEqual(cleared.pokemon[0].champions.usage.spreadGroups, spreadGroups);
});

test("threats carry each key's group with its own nature, not the Limitless top nature", () => {
  const threat = threatForPokemon(pokemonWith([
    { name: "Bold:32/0/1/1/32/0", usagePercent: 17 },
    { name: "Calm:32/0/1/1/21/11", usagePercent: 6 },
  ]));

  assert.equal(threat.nature, "Calm", "Speed presets keep the Limitless nature");
  assert.equal(threat.usageSpreads.def.nature, "Bold");
  assert.equal(threat.usageSpreads.spd.nature, "Bold");
  assert.deepEqual(threat.spPresets.bulk, { hp: 32, def: 1, spd: 32 });
  assert.deepEqual(threat.spPresets.offense, { atk: 0, spa: 1 });
});

const attacker = {
  id: "builder",
  name: "Builder",
  types: ["Normal"],
  baseStats: { hp: 80, atk: 100, def: 80, spa: 100, spd: 80, spe: 80 },
};
const physical = { id: "strength", name: "Strength", type: "Normal", category: "Physical", basePower: 110, target: "normal" };
const special = { id: "hypervoice", name: "Hyper Voice", type: "Normal", category: "Special", basePower: 100, target: "normal" };
const psyshock = { ...special, id: "psyshock", name: "Psyshock", overrideDefensiveStat: "def" };
const bodyPress = { ...physical, id: "bodypress", name: "Body Press", overrideOffensiveStat: "def" };

function groupedThreat() {
  // Physical bulk: Bold max Def; special bulk: Calm max SpD; offense: Modest max SpA.
  const pokemon = { ...pokemonWith([]), types: ["Normal"] };
  return {
    ...threatForPokemon(pokemon),
    moves: [physical, special],
    usageSpreads: {
      def: group("def", "Bold:32/0/32/0/0/0"),
      spd: group("spd", "Calm:32/0/0/0/32/0"),
      atk: group("atk", "Adamant:0/32/0/0/0/32"),
      spa: group("spa", "Modest:0/0/0/32/0/32"),
    },
    item: null,
    ability: null,
  };

  function group(key, spreadName) {
    const [nature, values] = spreadName.split(":");
    const [hp, atk, def, spa, spd, spe] = values.split("/").map(Number);
    return { key, spreadName, nature, sp: { hp, atk, def, spa, spd, spe }, share: 40, spreadCount: 2 };
  }
}

test("break points hit the group for the defense each move targets", () => {
  const threat = groupedThreat();
  const user = createSideState(attacker, { nature: "Hardy", sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability: null, item: null, moves: [physical, special] });
  const scenario = { threat, field: createField() };

  assert.equal(breakTargetSpread(threat, physical).nature, "Bold");
  assert.equal(breakTargetSpread(threat, special).nature, "Calm");
  assert.equal(breakTargetSpread(threat, psyshock).nature, "Bold", "Psyshock hits Def");

  const asBold = { ...threat, usageSpreads: null, nature: "Bold", spPresets: { ...threat.spPresets, bulk: { hp: 32, def: 32, spd: 0 } } };
  const asCalm = { ...threat, usageSpreads: null, nature: "Calm", spPresets: { ...threat.spPresets, bulk: { hp: 32, def: 0, spd: 32 } } };
  assert.deepEqual(yourDamage(user, physical, scenario), yourDamage(user, physical, { ...scenario, threat: asBold }));
  assert.deepEqual(yourDamage(user, special, scenario), yourDamage(user, special, { ...scenario, threat: asCalm }));
  assert.deepEqual(breakPoints(user, special, scenario), breakPoints(user, special, { ...scenario, threat: asCalm }));
});

test("bulk points attack with the group for each move's attacking stat", () => {
  const threat = groupedThreat();
  const user = createSideState(attacker, { nature: "Hardy", sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability: null, item: null, moves: [physical, special] });

  assert.equal(bulkAttackerSpread(threat, physical).nature, "Adamant");
  assert.equal(bulkAttackerSpread(threat, special).nature, "Modest");
  assert.equal(bulkAttackerSpread(threat, bodyPress).nature, "Bold", "Body Press attacks with Def");

  const asModest = { ...threat, usageSpreads: null, nature: "Modest", spPresets: { ...threat.spPresets, offense: { atk: 0, spa: 32 } } };
  assert.deepEqual(
    threatDamage(user, { threat, move: special, field: createField() }),
    threatDamage(user, { threat: asModest, move: special, field: createField() }),
  );
});

test("editing a threat's nature or SP replaces the groups for every move", () => {
  const threat = groupedThreat();

  assert.equal(applyThreatControl(threat, { kind: "nature", value: "Bold" }).usageSpreads, null);
  assert.equal(applyThreatControl(threat, { kind: "sp", stat: "def", value: "4" }).usageSpreads, null);
  assert.ok(applyThreatControl(threat, { kind: "item", value: null }).usageSpreads, "items keep the groups");

  // Re-entering the starting SP still changes the analysis, so the memo key must change too.
  const reentered = applyThreatControl(threat, { kind: "sp", stat: "def", value: String(threat.spPresets.bulk.def) });
  assert.notEqual(threatAnalysisSignature(reentered, "break"), threatAnalysisSignature(threat, "break"));
  assert.notEqual(threatAnalysisSignature(reentered, "bulk"), threatAnalysisSignature(threat, "bulk"));
});

test("Speed groups pool natures by final Speed and each nature takes the most used one it reaches", () => {
  // Base 85 Speed: Timid 0 SP = floor(105 * 1.1) = 115; neutral 10 SP = 115 too; Timid 32 = 150.
  const spreads = [
    { name: "Timid:32/0/2/32/0/32", usagePercent: 20 },
    { name: "Timid:32/0/2/32/0/0", usagePercent: 12 },
    { name: "Modest:32/0/2/22/0/10", usagePercent: 11 },
    { name: "Quiet:32/0/2/32/0/0", usagePercent: 6 },
  ];
  const pokemon = pokemonWith(spreads);

  assert.deepEqual(spreadGroupsFor(pokemon, spreads, "spe").slice(0, 2), [
    { spread: "Timid:32/0/2/32/0/0", share: 23, spreadCount: 2 },
    { spread: "Timid:32/0/2/32/0/32", share: 20, spreadCount: 1 },
  ]);
  assert.deepEqual(speedGroupForNature(pokemon, "Modest"), {
    speed: 115, sp: 10, share: 23, spreadCount: 2, spreadName: "Timid:32/0/2/32/0/0",
  });
  assert.equal(speedGroupForNature(pokemon, "Timid").sp, 0);
  // Quiet tops out at floor(137 * 0.9) = 123, so it cannot reach 150; 115 needs
  // floor((105 + sp) * 0.9) = 115, i.e. 23 SP.
  assert.equal(speedGroupForNature(pokemon, "Quiet").sp, 23);
  assert.equal(buildSpreadGroups(pokemon, spreads).spe.length, 3, "Speed keeps up to six groups");
});

test("the likely Speed preset follows the top Speed group, and a Mega Stone base form has none", () => {
  const bold = pokemonWith([{ name: "Bold:32/0/10/17/7/0", usagePercent: 30 }]);
  assert.equal(
    threatForPokemon(bold).spPresets.speed.find(({ likely }) => likely)?.label,
    "uninvested",
    "Bold 0 Spe is the uninvested preset, not the neutral 32 the nature rule assumes",
  );

  const megaBase = pokemonWith([{ name: "Quiet:32/0/2/32/0/0", usagePercent: 44 }]);
  megaBase.champions.usage.natures = [];
  assert.equal(threatForPokemon(megaBase).spPresets.speed.some(({ likely }) => likely), false);
});

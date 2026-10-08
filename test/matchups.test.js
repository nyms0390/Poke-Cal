import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import {
  bestRaceMove,
  entryStageChanges,
  likelyHitsToKo,
  matchup,
  matchupField,
  megaStoneFor,
  observedMatchupSet,
  raceExclusion,
  raceExclusionReason,
  resolveSpeedOutcome,
  trickRoomChanceFor,
  trickRoomTeamShares,
} from "../src/data/matchups.js";
import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";
import { normalizeId } from "../src/identifiers.js";

// Species, moves, abilities and items come from the pinned Showdown catalogs; every set below
// is explicit, so weekly usage syncs cannot change these expectations.
const load = (file) => JSON.parse(readFileSync(new URL(`../public/web/${file}`, import.meta.url), "utf8"));
const pokemonCatalog = load("pokemon.json");
const abilityLookup = buildAbilityLookup(load("abilities.json"));
const itemLookup = buildItemLookup(load("items.json"));
const moveLookup = buildMoveLookup(load("moves.json"));

const species = (name) => {
  const entry = pokemonCatalog.find((pokemon) => pokemon.name === name);
  assert.ok(entry, `missing ${name}`);
  return entry;
};
const move = (name) => moveLookup.get(normalizeId(name)) ?? assert.fail(`missing move ${name}`);
const ability = (name) => abilityLookup.get(normalizeId(name)) ?? assert.fail(`missing ability ${name}`);
const item = (name) => itemLookup.get(normalizeId(name)) ?? assert.fail(`missing item ${name}`);

const rillaboom = (overrides = {}) => ({
  pokemon: species("Rillaboom"),
  nature: "Adamant",
  sp: { hp: 32, atk: 32, spd: 2 },
  ability: ability("Grassy Surge"),
  item: item("Miracle Seed"),
  moves: ["Fake Out", "Grassy Glide", "Wood Hammer", "High Horsepower", "U-turn"].map(move),
  ...overrides,
});
const skarmory = () => ({
  pokemon: species("Skarmory"),
  nature: "Adamant",
  sp: { hp: 32, atk: 32, def: 2 },
  ability: ability("Sturdy"),
  item: item("Sharp Beak"),
  moves: [move("Brave Bird")],
});
const sneasler = () => ({
  pokemon: species("Sneasler"),
  nature: "Adamant",
  sp: { hp: 2, atk: 32, spe: 32 },
  ability: ability("Unburden"),
  item: item("White Herb"),
  moves: [move("Gunk Shot"), move("Close Combat")],
});
const incineroar = () => ({
  pokemon: species("Incineroar"),
  nature: "Careful",
  sp: { hp: 32, def: 14, spd: 20 },
  ability: ability("Intimidate"),
  item: item("Sitrus Berry"),
  moves: [move("Flare Blitz"), move("Darkest Lariat")],
});

test("likelyHitsToKo reads the cumulative KO chances", () => {
  const ko = { hits: 2, chance: 0.2, chances: [{ hits: 1, chance: 0 }, { hits: 2, chance: 0.2 }, { hits: 3, chance: 0.4 }, { hits: 4, chance: 1 }] };
  assert.equal(likelyHitsToKo(ko), 4);
  assert.equal(likelyHitsToKo(ko, { threshold: 0.2 }), 2);
  assert.equal(likelyHitsToKo({ hits: null, chance: 0, chances: [{ hits: 5, chance: 0 }] }), Infinity);
  // Without a chance list, a sub-50% first KO counts as one more hit.
  assert.equal(likelyHitsToKo({ hits: 2, chance: 0.3 }), 3);
  assert.equal(likelyHitsToKo({ hits: 5, chance: 0.3 }), Infinity);
  assert.equal(likelyHitsToKo(null), Infinity);
});

test("raceExclusionReason leaves out one-turn, charge, recharge and self-KO moves", () => {
  assert.match(raceExclusionReason(move("Fake Out")), /first turn/);
  assert.match(raceExclusionReason(move("Solar Beam")), /charge turn/);
  assert.equal(raceExclusionReason(move("Solar Beam"), { weather: "SunnyDay" }), "");
  assert.match(raceExclusionReason(move("Hyper Beam")), /recharge/);
  assert.match(raceExclusionReason(move("Explosion")), /faint/);
  assert.match(raceExclusionReason(move("Protect")), /Status/);
  assert.equal(raceExclusionReason(move("Wood Hammer")), "");
  assert.deepEqual(raceExclusion(move("Fake Out")).code, "firstTurn");
  assert.deepEqual(raceExclusion(move("Wood Hammer")), { code: "", reason: "" });
});

test("a theory-set counter beats Rillaboom regardless of speed", () => {
  const result = matchup({ ours: rillaboom(), theirs: skarmory() });

  assert.equal(result.outcome, "loss");
  assert.equal(result.decisive, true);
  assert.equal(result.theirHits, 1);
  assert.equal(result.ourHits, Infinity);
  assert.equal(result.ourOffenseWalled, true);
  assert.equal(result.theirs.best.move.name, "Brave Bird");
  assert.equal(result.theirs.best.minPercent, 104.3);
  assert.equal(result.theirs.best.maxPercent, 122.7);
  // Nothing KOs within five hits, so the most damaging move is reported, not the priority one.
  assert.equal(result.ours.best.move.name, "Wood Hammer");
  assert.equal(result.field.terrain, "Grassy Terrain");
  const fakeOut = result.ours.moves.find((entry) => entry.move.name === "Fake Out");
  assert.equal(fakeOut.included, false);
  assert.equal(fakeOut.reasonCode, "firstTurn");
});

test("matchup damage matches an independently assembled calculation", () => {
  const result = matchup({ ours: rillaboom(), theirs: incineroar() });
  const highHorsepower = result.ours.moves.find((entry) => entry.move.name === "High Horsepower");

  const direct = calculateDamage({
    attacker: species("Rillaboom"),
    defender: species("Incineroar"),
    move: move("High Horsepower"),
    attackerState: {
      pokemon: species("Rillaboom"), nature: "Adamant",
      sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
      stages: { atk: -1, def: 0, spa: 0, spd: 0, spe: 0 },
      ability: ability("Grassy Surge"), item: item("Miracle Seed"), status: "", currentHpFraction: 1, teraType: "",
    },
    defenderState: {
      pokemon: species("Incineroar"), nature: "Careful",
      sp: { hp: 32, atk: 0, def: 14, spa: 0, spd: 20, spe: 0 },
      stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      ability: ability("Intimidate"), item: item("Sitrus Berry"), status: "", currentHpFraction: 1, teraType: "",
    },
    field: createField({ terrain: "Grassy Terrain" }),
  });

  assert.equal(result.ours.state.stages.atk, -1, "Intimidate lowers Rillaboom's Attack");
  assert.equal(highHorsepower.minPercent, direct.minPercent);
  assert.equal(highHorsepower.maxPercent, direct.maxPercent);
  assert.equal(highHorsepower.koText, direct.ko.text);
  assert.equal(highHorsepower.minPercent, 37.6);
  assert.equal(highHorsepower.hits, 4);
  assert.equal(result.outcome, "loss");
  assert.equal(result.decisive, false);
});

test("equal hit counts leave the race to move order, with and without Trick Room", () => {
  const result = matchup({ ours: rillaboom(), theirs: sneasler() });

  assert.equal(result.outcome, "speed");
  assert.equal(result.ourHits, 1);
  assert.equal(result.theirHits, 1);
  assert.equal(result.ours.best.move.name, "High Horsepower");
  assert.equal(result.order.normal.first, "theirs");
  assert.equal(result.order.trickRoom.first, "ours");

  assert.deepEqual(resolveSpeedOutcome(result, { mode: "normal" }), { first: "theirs", ourWinChance: 0 });
  assert.deepEqual(resolveSpeedOutcome(result, { mode: "trickRoom" }), { first: "ours", ourWinChance: 1 });
  assert.deepEqual(resolveSpeedOutcome(result, { mode: "auto", trickRoomChance: 0.25 }), { first: "split", ourWinChance: 0.25 });
  assert.deepEqual(resolveSpeedOutcome(result, { mode: "auto", trickRoomChance: 0 }), { first: "theirs", ourWinChance: 0 });
});

test("resolveSpeedOutcome passes decided races through", () => {
  const loss = matchup({ ours: rillaboom(), theirs: skarmory() });
  assert.deepEqual(resolveSpeedOutcome(loss, { mode: "auto", trickRoomChance: 1 }), { first: null, ourWinChance: 0 });
  assert.deepEqual(resolveSpeedOutcome({ outcome: "win" }), { first: null, ourWinChance: 1 });
  assert.deepEqual(resolveSpeedOutcome({ outcome: "stalemate" }), { first: null, ourWinChance: null });
});

test("Grassy Glide priority decides move order only in Grassy Terrain", () => {
  const glideOnly = rillaboom({ moves: [move("Grassy Glide")] });
  const inTerrain = matchup({ ours: glideOnly, theirs: sneasler() });
  assert.equal(inTerrain.ours.best.priority, 1);
  assert.equal(inTerrain.order.normal.first, "ours");

  const noTerrain = matchup({ ours: { ...glideOnly, ability: ability("Overgrow") }, theirs: sneasler() });
  assert.equal(noTerrain.field.terrain, "");
  assert.equal(noTerrain.order.normal.first, "theirs");
});

test("bestRaceMove prefers fewer hits, then priority, then damage", () => {
  const entry = (name, hits, priority, maxPercent) => ({ move: { name }, included: true, hits, priority, maxPercent });
  assert.equal(bestRaceMove([entry("Strong", 2, 0, 90), entry("Quick", 2, 1, 60)]).move.name, "Quick");
  assert.equal(bestRaceMove([entry("Quick", 3, 1, 40), entry("Strong", 2, 0, 60)]).move.name, "Strong");
  assert.equal(bestRaceMove([entry("Quick", Infinity, 1, 10), entry("Strong", Infinity, 0, 20)]).move.name, "Strong");
  assert.equal(bestRaceMove([{ move: { name: "Fake Out" }, included: false, hits: Infinity }]), null);
});

test("weather and terrain abilities apply, the opponent's first", () => {
  const torkoal = {
    pokemon: species("Torkoal"), nature: "Quiet", sp: { hp: 32, spa: 32, def: 2 },
    ability: ability("Drought"), item: item("Charcoal"), moves: [move("Eruption")],
  };
  const withAbilities = matchup({ ours: rillaboom(), theirs: torkoal });
  const withoutAbilities = matchup({ ours: rillaboom(), theirs: torkoal, abilityField: false });

  assert.equal(withAbilities.field.weather, "SunnyDay");
  assert.equal(withAbilities.field.terrain, "Grassy Terrain");
  assert.equal(withoutAbilities.field.weather, "");
  assert.ok(withAbilities.theirs.best.maxPercent > withoutAbilities.theirs.best.maxPercent);

  const field = matchupField({ ours: { ability: ability("Drought") }, theirs: { ability: ability("Drizzle") } });
  assert.equal(field.weather, "RainDance");
  assert.equal(matchupField({ field: { weather: "sand" } }).weather, "Sandstorm");
});

test("immunity abilities remove moves from the race", () => {
  const farigiraf = {
    pokemon: species("Farigiraf"), nature: "Bold", sp: { hp: 32, def: 32, spa: 2 },
    ability: ability("Sap Sipper"), item: item("Sitrus Berry"), moves: [move("Psychic")],
  };
  const result = matchup({ ours: rillaboom(), theirs: farigiraf });
  const woodHammer = result.ours.moves.find((entry) => entry.move.name === "Wood Hammer");

  assert.equal(woodHammer.maxPercent, 0);
  assert.equal(woodHammer.hits, Infinity);
  assert.notEqual(result.ours.best.move.type, "Grass");
});

test("entryStageChanges covers Intimidate reactions and Intrepid Sword", () => {
  assert.deepEqual(entryStageChanges(ability("Grassy Surge"), ability("Intimidate")), { atk: -1 });
  assert.deepEqual(entryStageChanges(ability("Clear Body"), ability("Intimidate")), {});
  assert.deepEqual(entryStageChanges(ability("Defiant"), ability("Intimidate")), { atk: 1 });
  assert.deepEqual(entryStageChanges(ability("Competitive"), ability("Intimidate")), { atk: -1, spa: 2 });
  assert.deepEqual(entryStageChanges(ability("Guard Dog"), ability("Intimidate")), { atk: 1 });
  assert.deepEqual(entryStageChanges("intrepidsword", "pressure"), { atk: 1 });
  const noEntry = matchup({ ours: rillaboom(), theirs: incineroar(), entryStages: false });
  assert.equal(noEntry.ours.state.stages.atk, 0);
});

test("matchup rejects missing sets", () => {
  assert.throws(() => matchup({ ours: rillaboom() }), TypeError);
});

// ---- observed sets (usage fixtures) ----

const fixtureMoves = buildMoveLookup([
  { id: "protect", name: "Protect", category: "Status" },
  { id: "tackle", name: "Tackle", category: "Physical", basePower: 40, type: "Normal" },
  { id: "slash", name: "Slash", category: "Physical", basePower: 70, type: "Normal" },
  { id: "surf", name: "Surf", category: "Special", basePower: 90, type: "Water" },
  { id: "rarebeam", name: "Rare Beam", category: "Special", basePower: 90, type: "Water" },
]);
const fixtureItems = [
  { id: "leftovers", name: "Leftovers" },
  { id: "lifeorb", name: "Life Orb" },
  { id: "testite", name: "Testite", megaStone: { Tester: "Tester-Mega" } },
];
const fixtureItemLookup = buildItemLookup(fixtureItems);
const fixtureAbilities = buildAbilityLookup([{ id: "pressure", name: "Pressure" }, { id: "intimidate", name: "Intimidate" }]);
const usagePokemon = (name, usage) => ({
  id: normalizeId(name),
  name,
  baseSpecies: "Tester",
  abilities: ["Pressure", "Intimidate"],
  champions: { usageCount: 120, usage },
});
const fixtureContext = { abilityLookup: fixtureAbilities, itemLookup: fixtureItemLookup, moveLookup: fixtureMoves, items: fixtureItems };

test("observedMatchupSet pools common damaging moves and uses the top ladder spread", () => {
  const set = observedMatchupSet(usagePokemon("Tester", {
    moves: [
      { id: "protect", name: "Protect", usagePercent: 90 },
      { id: "slash", name: "Slash", usagePercent: 80 },
      { id: "surf", name: "Surf", usagePercent: 6 },
      { id: "rarebeam", name: "Rare Beam", usagePercent: 2 },
    ],
    items: [
      { id: "testite", name: "Testite", usagePercent: 60 },
      { id: "leftovers", name: "Leftovers", usagePercent: 30 },
    ],
    abilities: [{ id: "intimidate", name: "Intimidate", usagePercent: 70 }],
    natures: [{ name: "Jolly", usagePercent: 70 }],
    spreads: [{ name: "Adamant:32/32/0/0/2/0", usagePercent: 10 }, { name: "Jolly:2/32/0/0/0/32", usagePercent: 4 }],
  }), fixtureContext);

  assert.deepEqual(set.moves.map(({ id }) => id), ["slash", "surf"]);
  assert.equal(set.nature, "Adamant");
  assert.deepEqual(set.sp, { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 });
  assert.equal(set.ability.name, "Intimidate");
  // A base form never holds its Mega Stone here; the Mega form is its own row.
  assert.equal(set.item.name, "Leftovers");
  assert.deepEqual(set.source, { spread: "smogon", spreadName: "Adamant:32/32/0/0/2/0", teams: 120 });
});

test("observedMatchupSet gives Mega forms their stone and falls back to a max-offense preset", () => {
  const mega = observedMatchupSet(usagePokemon("Tester-Mega", {
    moves: [{ id: "surf", name: "Surf", usagePercent: 70 }, { id: "tackle", name: "Tackle", usagePercent: 10 }],
    items: [{ id: "leftovers", name: "Leftovers", usagePercent: 100 }],
    natures: [{ name: "Modest", usagePercent: 80 }],
  }), fixtureContext);
  assert.equal(mega.item.name, "Testite");
  assert.equal(mega.nature, "Modest");
  assert.deepEqual(mega.sp, { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 });
  assert.equal(mega.source.spread, "preset");
  assert.equal(mega.ability.name, "Pressure");

  const slow = observedMatchupSet(usagePokemon("Tester", {
    moves: [{ id: "slash", name: "Slash", usagePercent: 3 }, { id: "tackle", name: "Tackle", usagePercent: 2 }],
    natures: [{ name: "Brave", usagePercent: 90 }],
  }), fixtureContext);
  // No move reaches the common share, so the top damaging moves are used.
  assert.deepEqual(slow.moves.map(({ id }) => id), ["slash", "tackle"]);
  assert.deepEqual(slow.sp, { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 });

  assert.equal(observedMatchupSet(usagePokemon("Tester", { moves: [] }), fixtureContext), null);
  assert.equal(megaStoneFor({ name: "Tester" }, fixtureItems), null);
  assert.equal(megaStoneFor({ name: "Tester-Mega" }, fixtureItems).id, "testite");
});

test("trickRoomTeamShares counts each team once per Pokémon", () => {
  const team = (...members) => ({ pokemon: members.map(([id, moves = []]) => ({ id, name: id, moves })) });
  const archive = {
    tournaments: [{
      topCut: [
        team(["torkoal"], ["farigiraf", ["Trick Room", "Psychic"]]),
        team(["torkoal"], ["hatterene", ["Trick Room"]], ["torkoal"]),
        team(["gholdengo"], ["torkoal"]),
        { pokemon: [] },
      ],
    }, { topCut: [team(["gholdengo"], ["sneasler"])] }],
  };
  const shares = trickRoomTeamShares(archive);

  assert.deepEqual(shares.overall, { teams: 4, trickRoomTeams: 2, share: 0.5 });
  assert.deepEqual(shares.byPokemon.get("torkoal"), { teams: 3, trickRoomTeams: 2, share: 2 / 3 });
  assert.deepEqual(shares.byPokemon.get("gholdengo"), { teams: 2, trickRoomTeams: 0, share: 0 });

  assert.deepEqual(trickRoomChanceFor(shares, { id: "torkoal", name: "Torkoal" }, { minTeams: 2 }), { share: 2 / 3, teams: 3, source: "pokemon" });
  assert.deepEqual(trickRoomChanceFor(shares, { id: "torkoalmega", name: "Torkoal-Mega", baseSpecies: "Torkoal" }, { minTeams: 2 }), { share: 2 / 3, teams: 3, source: "pokemon" });
  assert.deepEqual(trickRoomChanceFor(shares, { id: "sneasler", name: "Sneasler" }, { minTeams: 2 }), { share: 0.5, teams: 4, source: "overall" });
  assert.deepEqual(trickRoomTeamShares(null).overall, { teams: 0, trickRoomTeams: 0, share: 0 });
});

test("race moves carry the cumulative KO chance per hit count", () => {
  const result = matchup({ ours: rillaboom(), theirs: incineroar() });
  const hhp = result.ours.moves.find((entry) => entry.move.name === "High Horsepower");
  assert.ok(hhp.koChances.length >= 4);
  assert.deepEqual(hhp.koChances.map(({ hits }) => hits), hhp.koChances.map((_, index) => index + 1));
  assert.equal(hhp.koChances.at(-1).chance, 1);

});

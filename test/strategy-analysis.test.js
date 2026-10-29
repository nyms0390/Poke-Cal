import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { popularOpponentPool, speedProfilesInUse, speedTiers } from "../src/data/speed-line.js";
import { USAGE_LIST_LIMIT, pokemonSets, topUsageList } from "../src/data/strategy-analysis.js";
import { createStrategyContext, sideState } from "../src/data/strategy-tools.js";
import { championsDefaultsForPokemon } from "../src/data/usage-defaults.js";

const read = (name) => JSON.parse(readFileSync(new URL(`../public/${name}.json`, import.meta.url), "utf8"));
const catalogs = { pokemon: read("pokemon"), moves: read("moves"), abilities: read("abilities"), items: read("items") };
const context = createStrategyContext(catalogs);
const popular = catalogs.pokemon
  .filter(({ champions }) => Number.isFinite(champions?.usagePercent))
  .sort((a, b) => b.champions.usagePercent - a.champions.usagePercent)
  .slice(0, 15);

test("topUsageList sorts by usage, breaks ties by name, caps, and is idempotent", () => {
  const entries = Array.from({ length: USAGE_LIST_LIMIT + 3 }, (_, index) => ({ name: `E${index}`, usagePercent: index % 4 }));
  const top = topUsageList(entries);
  assert.equal(top.length, USAGE_LIST_LIMIT);
  assert.deepEqual(top.slice(0, 4).map(({ name }) => name), ["E11", "E3", "E7", "E10"]);
  assert.deepEqual(topUsageList(top), top);
  assert.deepEqual(topUsageList(undefined), []);
});

test("capped usage lists keep the usage defaults", () => {
  for (const pokemon of popular) {
    const usage = Object.fromEntries(Object.entries(pokemon.champions.usage).map(([key, list]) => [key, topUsageList(list)]));
    const capped = { ...pokemon, champions: { ...pokemon.champions, usage } };
    const lookups = { abilityLookup: context.abilityLookup, items: context.items, moveLookup: context.moveLookup };
    const summary = (defaults) => ({
      ability: defaults.ability?.id, item: defaults.item?.id, nature: defaults.nature, sp: defaults.sp, spreadName: defaults.spreadName,
    });
    assert.deepEqual(summary(championsDefaultsForPokemon(capped, lookups)), summary(championsDefaultsForPokemon(pokemon, lookups)), pokemon.name);
  }
});

test("Speed tiers are unchanged when only the Speed profiles in use are kept", () => {
  const trimmed = catalogs.pokemon.map((pokemon) => pokemon.champions?.usage?.speedProfiles
    ? { ...pokemon, champions: { ...pokemon.champions, usage: { ...pokemon.champions.usage, speedProfiles: speedProfilesInUse(pokemon) } } }
    : pokemon);
  const opponents = (pokemon) => popularOpponentPool(
    pokemon.filter(({ id }) => popular.some((entry) => entry.id === id)).map((entry) => ({ pokemon: entry })),
    [], 50, pokemon,
  );
  const user = { pokemon: popular[0], nature: "Jolly", spe: 32, ability: null, item: null };
  for (const options of [{}, { trickRoom: true }, { includeActiveSpeedAbilities: true }]) {
    assert.deepEqual(
      speedTiers(user, opponents(trimmed), { mode: "battle", ...options }),
      speedTiers(user, opponents(catalogs.pokemon), { mode: "battle", ...options }),
    );
  }
  assert.ok(popular.some((pokemon) => speedProfilesInUse(pokemon).length < (pokemon.champions.usage.speedProfiles?.length ?? 0)));
});

test("set pastes fill the side state, with explicit fields and names taking precedence", () => {
  const pasted = sideState(context, undefined, { set: "Garchomp @ Choice Scarf\nAbility: Rough Skin\nTera Type: steel\nSPs: 32 Atk / 32 Spe\n- Earthquake" });
  assert.equal(pasted.pokemon.id, "garchomp");
  assert.equal(pasted.item.id, "choicescarf");
  assert.equal(pasted.ability.id, "roughskin");
  assert.equal(pasted.teraType, "Steel");
  assert.equal(pasted.nature, "Hardy", "SP without a nature line is neutral");
  assert.deepEqual(pasted.sp, { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
  assert.deepEqual(pasted.pasteWarnings, []);

  const defaults = sideState(context, "Garchomp");
  const natureOnly = sideState(context, undefined, { set: "Garchomp\nAdamant Nature" });
  assert.equal(natureOnly.nature, "Adamant");
  assert.deepEqual(natureOnly.sp, defaults.sp, "no SP line keeps the usage-default SP");
  assert.equal(natureOnly.item, null, "no item in the paste means no item");
  assert.equal(natureOnly.ability.id, defaults.ability.id);

  const overridden = sideState(context, "Dragapult", { set: "Garchomp @ Choice Scarf\nJolly Nature", item: "Life Orb", spread: "Timid:0/0/0/32/2/32" });
  assert.equal(overridden.pokemon.id, "dragapult");
  assert.equal(overridden.item.id, "lifeorb");
  assert.equal(overridden.nature, "Timid");
});

test("pokemonSets reports usage, Smogon spreads and NCP sets with source labels", () => {
  const sets = pokemonSets(context, "Incineroar");
  assert.equal(sets.legal, true);
  assert.ok(sets.limitless.moves.length <= USAGE_LIST_LIMIT);
  assert.ok(sets.ncpSets.every(({ paste }) => paste.startsWith("Incineroar")));
  assert.match(sets.sources.limitless, /^Limitless: Champions tournament usage/);
  assert.match(sets.sources.smogonSpreads, /^Smogon ladder stats: Champions SP spreads/);
  assert.match(sets.sources.ncpSets, /^NCP \(Nimbasa City Post\): curated Champions sets/);
  const illegal = pokemonSets(context, "Mewtwo");
  assert.equal(illegal.legal, false);
  assert.deepEqual(illegal.limitless.moves, []);
  assert.deepEqual(illegal.ncpSets, []);
});

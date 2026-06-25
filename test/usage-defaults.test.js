import test from "node:test";
import assert from "node:assert/strict";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/catalog.js";
import { parseUsageSpread, usageDefaultsForPokemon } from "../src/usage-defaults.js";

test("parses Champions usage spreads", () => {
  assert.deepEqual(parseUsageSpread("Jolly:2/32/0/0/0/32"), {
    nature: "Jolly",
    sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  });
  assert.equal(parseUsageSpread("Unknown:0/0/0/0/0/0"), null);
  assert.equal(parseUsageSpread("Jolly:0/0/0/252/4/252"), null);
  assert.equal(parseUsageSpread("Jolly:0/0/0"), null);
});

test("selects top marginal usage defaults with catalog metadata", () => {
  const entry = {
    id: "pikachu",
    moves: ["thunderbolt", "quickattack", "surf", "fakeout", "irontail"],
  };
  const defaults = usageDefaultsForPokemon(
    entry,
    {
      abilities: [
        { id: "static", name: "Static", usagePercent: 35 },
        { id: "lightningrod", name: "Lightning Rod", usagePercent: 65 },
      ],
      items: [
        { id: "focussash", name: "Focus Sash", usagePercent: 10 },
        { id: "lightball", name: "Light Ball", usagePercent: 86 },
      ],
      moves: [
        { id: "thunderbolt", name: "Thunderbolt", usagePercent: 90 },
        { id: "fakeout", name: "Fake Out", usagePercent: 80 },
        { id: "surf", name: "Surf", usagePercent: 70 },
        { id: "quickattack", name: "Quick Attack", usagePercent: 60 },
        { id: "irontail", name: "Iron Tail", usagePercent: 50 },
      ],
      spreads: [
        { name: "Timid:0/0/0/32/0/32", usagePercent: 20 },
        { name: "Jolly:2/32/0/0/0/32", usagePercent: 30 },
      ],
    },
    {
      abilityLookup: buildAbilityLookup([{ id: "lightningrod", name: "Lightning Rod" }]),
      itemLookup: buildItemLookup([{ id: "lightball", name: "Light Ball" }]),
      moveLookup: buildMoveLookup([
        { id: "thunderbolt", name: "Thunderbolt", type: "Electric" },
        { id: "fakeout", name: "Fake Out", type: "Normal" },
        { id: "surf", name: "Surf", type: "Water" },
        { id: "quickattack", name: "Quick Attack", type: "Normal" },
      ]),
    },
  );

  assert.equal(defaults.nature, "Jolly");
  assert.deepEqual(defaults.sp, { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 });
  assert.equal(defaults.ability.name, "Lightning Rod");
  assert.equal(defaults.item.name, "Light Ball");
  assert.deepEqual(defaults.moves.map(({ id }) => id), [
    "thunderbolt",
    "fakeout",
    "surf",
    "quickattack",
  ]);
});

test("falls back when usage is missing", () => {
  const defaults = usageDefaultsForPokemon({ id: "missing", moves: ["tackle"] }, null);

  assert.equal(defaults.nature, "Hardy");
  assert.deepEqual(defaults.sp, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  assert.equal(defaults.ability, null);
  assert.equal(defaults.item, null);
  assert.deepEqual(defaults.moves, [{ id: "tackle", name: "tackle" }]);
});

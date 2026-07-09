import test from "node:test";
import assert from "node:assert/strict";

import { applyChampionsData, isChampionsLegalFormatsEntry } from "../src/data/champions-data.js";

const catalogs = {
  pokemon: [
    {
      id: "venusaur",
      name: "Venusaur",
      baseSpecies: "Venusaur",
      moves: ["razorleaf", "solarbeam", "tackle"],
    },
    {
      id: "venusaurmega",
      name: "Venusaur-Mega",
      baseSpecies: "Venusaur",
      moves: ["razorleaf", "solarbeam", "tackle"],
    },
    {
      id: "bulbasaur",
      name: "Bulbasaur",
      baseSpecies: "Bulbasaur",
      moves: ["tackle", "vinewhip"],
    },
  ],
  abilities: [
    { id: "regenerator", name: "Regenerator" },
    { id: "dragonize", name: "Dragonize", isNonstandard: "CAP" },
  ],
  moves: [
    { id: "anchorshot", name: "Anchor Shot", basePower: 80 },
    { id: "tackle", name: "Tackle", basePower: 40 },
    { id: "solarbeam", name: "Solar Beam", basePower: 120 },
    { id: "freezedry", name: "Freeze-Dry", basePower: 70, secondary: { chance: 10 } },
  ],
  items: [
    { id: "venusaurite", name: "Venusaurite", isNonstandard: "Past" },
    { id: "lifeorb", name: "Life Orb" },
    { id: "leftovers", name: "Leftovers" },
  ],
};

const mod = {
  formatsData: {
    venusaur: { tier: "UU" },
    venusaurmega: { tier: "UU" },
    bulbasaur: { isNonstandard: "Past", tier: "Illegal" },
  },
  learnsets: {
    venusaur: { learnset: { solarbeam: ["9M"], gigadrain: ["9M"] } },
  },
  abilities: {
    dragonize: { inherit: true, isNonstandard: null },
  },
  moves: {
    anchorshot: { inherit: true, basePower: 90 },
    tackle: { inherit: true, isNonstandard: "Past" },
    freezedry: { inherit: true, secondary: undefined },
  },
  items: {
    venusaurite: { inherit: true, isNonstandard: null },
    lifeorb: { inherit: true, isNonstandard: "Past" },
  },
};

test("marks Champions legality from the mod formats data", () => {
  assert.equal(isChampionsLegalFormatsEntry({ tier: "UU" }), true);
  assert.equal(isChampionsLegalFormatsEntry({ isNonstandard: "Past", tier: "Illegal" }), false);
  assert.equal(isChampionsLegalFormatsEntry(undefined), false);
});

test("overlays Champions legality, tiers, and learnsets on Pokémon", () => {
  const { pokemon } = applyChampionsData(catalogs, mod);
  const [venusaur, venusaurMega, bulbasaur] = pokemon;

  assert.equal(venusaur.champions.legal, true);
  assert.equal(venusaur.champions.tier, "UU");
  assert.deepEqual(venusaur.moves, ["gigadrain", "solarbeam"]);

  assert.equal(venusaurMega.champions.legal, true);
  assert.deepEqual(venusaurMega.moves, ["gigadrain", "solarbeam"]);

  assert.equal(bulbasaur.champions.legal, false);
  assert.equal("tier" in bulbasaur.champions, false);
  assert.deepEqual(bulbasaur.moves, ["tackle", "vinewhip"]);
});

test("overlays Champions move changes and availability", () => {
  const { moves } = applyChampionsData(catalogs, mod);
  const byId = new Map(moves.map((move) => [move.id, move]));

  assert.equal(byId.get("anchorshot").basePower, 90);
  assert.equal(byId.get("anchorshot").champions.legal, true);
  assert.equal(byId.get("tackle").champions.legal, false);
  assert.equal(byId.get("solarbeam").champions.legal, true);
  assert.equal("secondary" in byId.get("freezedry"), false);
  assert.equal("inherit" in byId.get("anchorshot"), false);
});

test("overlays Champions item and ability availability", () => {
  const { items, abilities } = applyChampionsData(catalogs, mod);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const abilityById = new Map(abilities.map((ability) => [ability.id, ability]));

  assert.equal(itemById.get("venusaurite").champions.legal, true);
  assert.equal(itemById.get("lifeorb").champions.legal, false);
  assert.equal(itemById.get("leftovers").champions.legal, true);
  assert.equal(abilityById.get("dragonize").champions.legal, true);
  assert.equal(abilityById.get("regenerator").champions.legal, true);
});

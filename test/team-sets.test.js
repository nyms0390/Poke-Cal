import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildAbilityLookup, buildItemLookup, buildMoveLookup } from "../src/data/catalog.js";
import { pasteFromSet, sameBuild, setFromPaste, teamMemberSets, teamSetStatus } from "../src/data/team-sets.js";

const load = (file) => JSON.parse(readFileSync(new URL(`../public/web/${file}`, import.meta.url), "utf8"));
const pokemon = load("pokemon.json");
const abilities = load("abilities.json");
const items = load("items.json");
const moves = load("moves.json");
const catalogs = {
  pokemon,
  abilities,
  items,
  moves,
  abilityLookup: buildAbilityLookup(abilities),
  itemLookup: buildItemLookup(items),
  moveLookup: buildMoveLookup(moves),
};

const incineroarPaste = [
  "Incineroar @ Sitrus Berry",
  "Ability: Intimidate",
  "SPs: 32 HP / 2 Atk / 16 Def / 16 SpD",
  "Careful Nature",
  "- Fake Out",
  "- Flare Blitz",
  "- Parting Shot",
  "- Knock Off",
].join("\n");
const team = { id: "t1", name: "Rain", members: [incineroarPaste, "Pelipper @ Damp Rock\nSPs: 32 HP\nBold Nature"] };

test("a member paste becomes an active set and round-trips through paste", () => {
  const set = setFromPaste(incineroarPaste, catalogs);
  assert.equal(set.pokemonId, "incineroar");
  assert.equal(set.nature, "Careful");
  assert.deepEqual(set.sp, { hp: 32, atk: 2, def: 16, spa: 0, spd: 16, spe: 0 });
  assert.equal(set.itemId, "sitrusberry");
  assert.deepEqual(set.moveIds, ["fakeout", "flareblitz", "partingshot", "knockoff"]);
  assert.deepEqual(setFromPaste(pasteFromSet(set, catalogs), catalogs), set);
});

test("the active set is free, a saved member or an edited member of the working team", () => {
  const members = teamMemberSets(team, catalogs);
  assert.deepEqual(members.map(({ set }) => set?.pokemonId), ["incineroar", "pelipper"]);
  const saved = members[0].set;
  assert.deepEqual(teamSetStatus(saved, team, catalogs), { kind: "saved", index: 0 });
  assert.deepEqual(teamSetStatus({ ...saved, sp: { ...saved.sp, spe: 4 } }, team, catalogs), { kind: "edited", index: 0 });
  assert.deepEqual(teamSetStatus(setFromPaste("Sneasler", catalogs), team, catalogs), { kind: "free", index: -1 });
  assert.deepEqual(teamSetStatus(saved, null, catalogs), { kind: "free", index: -1 });
  assert.deepEqual(teamSetStatus(null, team, catalogs), { kind: "none", index: -1 });
});

test("page-only details and gaps a paste can't hold never read as edits", () => {
  const saved = teamMemberSets(team, catalogs)[0].set;
  const withOptions = { ...saved, moveOptionsBySlot: [{ hitCount: "2" }, {}, {}, {}] };
  assert.equal(sameBuild(withOptions, saved, catalogs), true);
  const gap = { ...saved, moveIds: ["fakeout", "", "partingshot", ""] };
  const stored = setFromPaste(pasteFromSet(gap, catalogs), catalogs);
  assert.equal(sameBuild(gap, stored, catalogs), true);
  assert.equal(sameBuild({ ...saved, itemId: "" }, setFromPaste(pasteFromSet({ ...saved, itemId: "" }, catalogs), catalogs), catalogs), true);
});

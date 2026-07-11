import test from "node:test";
import assert from "node:assert/strict";

import { formatSetPaste, parseSetPaste } from "../src/data/set-paste.js";

const pokemon = [
  {
    id: "miraidon",
    name: "Miraidon",
    aliases: ["密勒頓"],
  },
];
const abilities = [
  { id: "hadronengine", name: "Hadron Engine", aliases: ["強子引擎"] },
];
const items = [
  { id: "choicespecs", name: "Choice Specs", aliases: ["講究眼鏡"] },
];
const moves = [
  { id: "electrodrift", name: "Electro Drift", aliases: ["閃電猛衝"] },
  { id: "dracometeor", name: "Draco Meteor" },
  { id: "voltswitch", name: "Volt Switch" },
  { id: "dazzlinggleam", name: "Dazzling Gleam" },
];
const catalogs = { pokemon, abilities, items, moves };

const sideState = {
  pokemon: pokemon[0],
  ability: abilities[0],
  item: items[0],
  teraType: "Electric",
  nature: "Modest",
  sp: { hp: 4, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
  selectedMoveIds: ["electrodrift", "dracometeor", "voltswitch", "dazzlinggleam"],
};

test("formats and parses the canonical PokéCal SP paste", () => {
  const text = formatSetPaste(sideState, catalogs);
  assert.equal(text, [
    "Miraidon @ Choice Specs",
    "Ability: Hadron Engine",
    "Tera Type: Electric",
    "SPs: 4 HP / 32 SpA / 32 Spe",
    "Modest Nature",
    "- Electro Drift",
    "- Draco Meteor",
    "- Volt Switch",
    "- Dazzling Gleam",
  ].join("\n"));

  const parsed = parseSetPaste(text, catalogs);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.pokemon.id, "miraidon");
  assert.equal(parsed.item.id, "choicespecs");
  assert.equal(parsed.ability.id, "hadronengine");
  assert.equal(parsed.teraType, "Electric");
  assert.equal(parsed.nature, "Modest");
  assert.deepEqual(parsed.sp, sideState.sp);
  assert.deepEqual(parsed.selectedMoveIds, sideState.selectedMoveIds);
});

test("accepts Showdown EVs by mapping them to SPs with a warning", () => {
  const parsed = parseSetPaste([
    "Miraidon @ Choice Specs",
    "Ability: Hadron Engine",
    "Tera Type: Electric",
    "EVs: 4 HP / 252 SpA / 252 Spe",
    "Modest Nature",
    "- Electro Drift",
  ].join("\n"), catalogs);

  assert.deepEqual(parsed.sp, { hp: 1, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 });
  assert.match(parsed.warnings.join("\n"), /Mapped EVs to Champions SPs/);
});

test("accepts aliases and keeps warnings for unknown fields", () => {
  const parsed = parseSetPaste([
    "密勒頓 @ 講究眼鏡",
    "Ability: 強子引擎",
    "Tera Type: Electric",
    "SPs: 4 HP / 32 SpA / 32 Spe",
    "Modest Nature",
    "- 閃電猛衝",
    "- Unknown Move",
  ].join("\n"), catalogs);

  assert.equal(parsed.pokemon.id, "miraidon");
  assert.equal(parsed.item.id, "choicespecs");
  assert.equal(parsed.ability.id, "hadronengine");
  assert.deepEqual(parsed.selectedMoveIds, ["electrodrift"]);
  assert.match(parsed.warnings.join("\n"), /Unknown move: Unknown Move/);
});

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

test("prefers the exact species over forms that share its base species", () => {
  const formCatalogs = {
    ...catalogs,
    pokemon: [
      { id: "gengar", name: "Gengar" },
      { id: "gengarmega", name: "Gengar-Mega", baseSpecies: "Gengar" },
      { id: "arcanine", name: "Arcanine" },
      { id: "arcaninehisui", name: "Arcanine-Hisui", baseSpecies: "Arcanine" },
      { id: "aegislashblade", name: "Aegislash-Blade", baseSpecies: "Aegislash" },
      { id: "aegislash", name: "Aegislash" },
    ],
  };

  assert.equal(parseSetPaste("Gengar @ Choice Specs", formCatalogs).pokemon.id, "gengar");
  assert.equal(parseSetPaste("Gengar-Mega", formCatalogs).pokemon.id, "gengarmega");
  assert.equal(parseSetPaste("Arcanine", formCatalogs).pokemon.id, "arcanine");
  assert.equal(parseSetPaste("Aegislash", formCatalogs).pokemon.id, "aegislash");
  for (const entry of formCatalogs.pokemon) {
    const text = formatSetPaste({ pokemon: entry, sp: {} }, formCatalogs);
    assert.equal(parseSetPaste(text, formCatalogs).pokemon.id, entry.id, entry.name);
  }
});

test("reads Showdown nickname and gender headers and skips cosmetic lines", () => {
  const text = [
    "Volty (Miraidon) (M) @ Choice Specs",
    "Level: 50",
    "Shiny: Yes",
    "Ability: Hadron Engine",
    "IVs: 0 Atk",
    "Modest Nature",
    "- Electro Drift",
  ].join("\n");
  const parsed = parseSetPaste(text, catalogs);

  assert.equal(parsed.pokemon.id, "miraidon");
  assert.equal(parsed.item.id, "choicespecs");
  assert.equal(parsed.ability.id, "hadronengine");
  assert.equal(parsed.nature, "Modest");
  assert.deepEqual(parsed.selectedMoveIds, ["electrodrift"]);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(parseSetPaste("Miraidon (F)", catalogs).pokemon.id, "miraidon");
});

test("an unknown header does not let later lines become the Pokémon", () => {
  const parsed = parseSetPaste("Missingno @ Choice Specs\nLevel: 50\nMiraidon", catalogs);

  assert.equal(parsed.pokemon, null);
  assert.deepEqual(parsed.warnings, ["Unknown Pokémon: Missingno"]);
});

test("every Champions-legal catalog Pokémon survives export and re-import", async () => {
  const { readFileSync } = await import("node:fs");
  const load = (file) => JSON.parse(readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8"));
  const realCatalogs = { pokemon: load("pokemon.json"), moves: [], items: [], abilities: [] };
  const legal = realCatalogs.pokemon.filter((entry) => entry.champions?.legal);
  assert.ok(legal.length > 100);
  for (const entry of legal) {
    const text = formatSetPaste({ pokemon: entry, sp: {} }, realCatalogs);
    assert.equal(parseSetPaste(text, realCatalogs).pokemon?.id, entry.id, entry.name);
  }
});

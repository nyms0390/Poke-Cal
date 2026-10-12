import test from "node:test";
import assert from "node:assert/strict";
import {
  compactSide, hydrateSide, createComparisonStore, pinVariant,
  removeVariant, comparisonRows, changedFields,
} from "../src/data/set-comparison.js";

const pokemon = { id: "pikachu", name: "Pikachu" };
const ability = { id: "static", name: "Static" };
const item = { id: "lightball", name: "Light Ball" };
const base = {
  pokemon, nature: "Timid", sp: { hp: 0, atk: 0, def: 0, spa: 20, spd: 0, spe: 20 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability, item,
  status: "", soaked: false, selectedMoveIds: ["thunderbolt", "", "", ""],
  critMoves: [false, false, false, false], moveOptionsBySlot: [{}, {}, {}, {}],
};
const catalogs = { pokemonLookup: new Map([["pikachu", pokemon]]), abilityLookup: new Map([["static", ability]]), itemLookup: new Map([["lightball", item]]) };

test("compact sides store identifiers and editable values, then hydrate catalog objects", () => {
  const compact = compactSide({ ...base, stages: { ...base.stages, spe: 2 }, critMoves: [true, false, false, false] });
  assert.equal(compact.pokemonId, "pikachu");
  assert.equal(compact.abilityId, "static");
  assert.equal(compact.itemId, "lightball");
  assert.equal(JSON.stringify(compact).includes('"name"'), false);
  const restored = hydrateSide(compact, catalogs, () => base);
  assert.equal(restored.pokemon, pokemon);
  assert.equal(restored.ability, ability);
  assert.equal(restored.stages.spe, 2);
  assert.equal(restored.critMoves[0], true);
});

test("pinning switches exactly one pinned variant and removal protects it", () => {
  const variants = [{ id: "a", side: base }, { id: "b", side: base }];
  const state = pinVariant({ variants, pinnedId: "a", selectedId: "a" }, "b");
  assert.equal(state.pinnedId, "b");
  assert.equal(state.selectedId, "b");
  assert.equal(removeVariant(state, "b").variants.length, 2);
  assert.equal(removeVariant(state, "a").variants.length, 1);
});

test("aligned rows and summaries include No KO and deltas against pin", () => {
  const row = (id, outcome) => ({ id, result: { outcome, ourOffenseWalled: false }, cell: { theirs: 1, ours: 2 }, speed: { ourWinChance: 0.5 } });
  const a = [row("x", "loss"), row("y", "stalemate")];
  const b = [row("x", "win"), row("y", "stalemate")];
  const result = comparisonRows([{ id: "a", rows: a }, { id: "b", rows: b }], "a");
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].changed, true);
  assert.equal(result.rows[1].changed, false);
  assert.equal(result.variants[1].delta.win, 1);
  assert.equal(result.variants[1].delta.loss, -1);
  assert.equal(result.variants[1].counts.stalemate, 1);
});

test("changed fields report all actual edits without causal attribution", () => {
  const edits = changedFields(base, { ...base, nature: "Modest", sp: { ...base.sp, spe: 24 }, selectedMoveIds: ["volttackle", "", "", ""] });
  assert.deepEqual(edits, ["nature", "spe SP", "move 1"]);
});

test("store persists a compact versioned payload", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const store = createComparisonStore(storage);
  store.write({ variants: [{ id: "a", name: "A", side: base }], pinnedId: "a", selectedId: "a" });
  const raw = values.get("pokecal.compare-sets.v1");
  assert.equal(JSON.parse(raw).version, 1);
  assert.equal(raw.includes('"name":"Pikachu"'), false);
  assert.equal(store.read().variants[0].side.pokemonId, "pikachu");
});

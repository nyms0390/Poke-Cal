import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPARISON_STORAGE_KEY, MAX_STORED_COMPARISONS, MAX_VARIANTS,
  addVariant, analysisKey, canAddVariant, changeTally, compactSide, comparisonRows,
  createComparison, createComparisonStore, deltaTone, hydrateSide, nextVariantLabel,
  outcomeShift, pinVariant, removeVariant, renameVariant, replaceVariantSide, setChanges,
} from "../src/data/set-comparison.js";

const pokemon = { id: "pikachu", name: "Pikachu" };
const ability = { id: "static", name: "Static" };
const item = { id: "lightball", name: "Light Ball" };
const base = {
  pokemon, nature: "Timid", sp: { hp: 0, atk: 0, def: 0, spa: 20, spd: 0, spe: 20 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, ability, item,
  status: "", soaked: false, selectedMoveIds: ["thunderbolt", "voltswitch", "", ""],
  critMoves: [false, false, false, false], moveOptionsBySlot: [{}, {}, {}, {}],
};
const catalogs = {
  pokemonLookup: new Map([["pikachu", pokemon]]),
  abilityLookup: new Map([["static", ability]]),
  itemLookup: new Map([["lightball", item]]),
};
const usageDefault = { ...base, ability: { id: "lightningrod" }, item: { id: "focussash" }, extra: "kept" };
const ids = () => {
  let next = 0;
  return () => `v${++next}`;
};
const memoryStorage = () => {
  const values = new Map();
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("compact sides keep identifiers and editable values, then hydrate catalog entries", () => {
  const compact = compactSide({ ...base, stages: { ...base.stages, spe: 2 }, critMoves: [true, false, false, false] });
  assert.equal(compact.pokemonId, "pikachu");
  assert.equal(compact.itemId, "lightball");
  assert.equal(JSON.stringify(compact).includes('"name"'), false);
  const { side, missing } = hydrateSide(compact, catalogs, () => usageDefault);
  assert.equal(side.pokemon, pokemon);
  assert.equal(side.ability, ability);
  assert.equal(side.item, item);
  assert.equal(side.stages.spe, 2);
  assert.equal(side.critMoves[0], true);
  assert.equal(side.extra, "kept");
  assert.deepEqual(missing, []);
  assert.equal(hydrateSide({ ...compact, pokemonId: "missingno" }, catalogs, () => usageDefault), null);
});

test("an ability or item the catalog lost stays empty instead of becoming the usage default", () => {
  const { side, missing } = hydrateSide({ ...compactSide(base), itemId: "choiceband" }, catalogs, () => usageDefault);
  assert.equal(side.item, null);
  assert.equal(side.ability, ability);
  assert.deepEqual(missing, ["item"]);
});

test("a new comparison pins A and selects a copy B", () => {
  const state = createComparison(base, { createId: ids() });
  assert.equal(state.pokemonId, "pikachu");
  assert.deepEqual(state.variants.map(({ label }) => label), ["A", "B"]);
  assert.equal(state.pinnedId, "v1");
  assert.equal(state.selectedId, "v2");
  assert.notEqual(state.variants[1].side, base);
  assert.deepEqual(compactSide(state.variants[1].side), compactSide(base));
});

test("variant letters stay unique after renames and removals, up to the limit", () => {
  const createId = ids();
  let state = createComparison(base, { createId });
  state = renameVariant(state, "v2", "  B   Knock   Off ");
  assert.equal(state.variants[1].name, "B Knock Off");
  state = addVariant(state, { createId });
  assert.equal(state.variants.at(-1).label, "C");
  assert.equal(state.selectedId, "v3");
  state = removeVariant(state, "v2");
  assert.equal(nextVariantLabel(state.variants), "B");
  state = addVariant(state, { createId });
  assert.deepEqual(state.variants.map(({ label }) => label), ["A", "B", "C"]);
  while (canAddVariant(state)) state = addVariant(state, { createId });
  assert.equal(state.variants.length, MAX_VARIANTS);
  assert.equal(addVariant(state, { createId }), state);
});

test("pinning moves the baseline, and the baseline cannot be removed", () => {
  let state = createComparison(base, { createId: ids() });
  state = pinVariant(state, "v2");
  assert.equal(state.pinnedId, "v2");
  assert.equal(removeVariant(state, "v2"), state);
  const removed = removeVariant({ ...state, selectedId: "v1" }, "v1");
  assert.deepEqual(removed.variants.map(({ id }) => id), ["v2"]);
  assert.equal(removed.selectedId, "v2");
  assert.equal(pinVariant(state, "nope"), state);
});

test("changes list moves by slot and every other edit as data", () => {
  const other = {
    ...base, nature: "Modest", item: null, sp: { ...base.sp, spe: 24 },
    selectedMoveIds: ["thunderbolt", "grassknot", "", ""], critMoves: [true, false, false, false],
    moveOptionsBySlot: [{}, { hitCount: "2" }, {}, {}],
  };
  const changes = setChanges(base, other);
  assert.deepEqual(changes, [
    { kind: "move", slot: 1, from: "voltswitch", to: "grassknot" },
    { kind: "nature", from: "Timid", to: "Modest" },
    { kind: "item", from: "lightball", to: "" },
    { kind: "sp", stat: "spe", from: 20, to: 24 },
    { kind: "crit", slot: 0, to: true },
    { kind: "conditions", slot: 1 },
  ]);
  assert.deepEqual(changeTally(changes), { moves: 1, parts: ["item", "nature", "sp", "moveSettings"] });
  assert.deepEqual(setChanges(base, { ...base }), []);
  assert.deepEqual(setChanges(base, { ...base, moveOptionsBySlot: [{ a: "1", b: "2" }, {}, {}, {}] }),
    setChanges(base, { ...base, moveOptionsBySlot: [{ b: "2", a: "1" }, {}, {}, {}] }));
});

test("outcome shifts and delta tones read from your side", () => {
  assert.equal(outcomeShift("win", "loss"), "worse");
  assert.equal(outcomeShift("speed", "win"), "better");
  assert.equal(outcomeShift("speed", "stalemate"), "different");
  assert.equal(outcomeShift("loss", "loss"), "same");
  assert.equal(deltaTone("win", 2), "good");
  assert.equal(deltaTone("loss", 1), "bad");
  assert.equal(deltaTone("loss", -1), "good");
  assert.equal(deltaTone("speed", -1), "neutral");
  assert.equal(deltaTone("win", 0), "neutral");
});

test("rows align by opponent with counts and deltas against the baseline", () => {
  const row = (id, outcome) => ({ id, result: { outcome, ourOffenseWalled: false }, cell: { theirs: 1, ours: 2 }, speed: { ourWinChance: 0.5 } });
  const result = comparisonRows([
    { id: "a", rows: [row("x", "win"), row("y", "stalemate"), row("z", "speed")] },
    { id: "b", rows: [row("x", "loss"), row("y", "stalemate"), row("z", "win")] },
  ], "a");
  assert.deepEqual(result.rows.map(({ id }) => id), ["x", "y", "z"]);
  assert.deepEqual(result.rows.map(({ changed }) => changed), [true, false, true]);
  assert.equal(result.rows[0].shifts.b, "worse");
  assert.equal(result.rows[2].shifts.b, "better");
  assert.equal(result.rows[0].shifts.a, "same");
  const b = result.variants.find(({ id }) => id === "b");
  assert.deepEqual(b.delta, { loss: 1, speed: -1, win: 0, stalemate: 0 });
  assert.equal(b.count, 3);
});

test("the store keeps one comparison per Pokémon and drops the least recent", () => {
  const storage = memoryStorage();
  let clock = 0;
  const store = createComparisonStore(storage, { now: () => ++clock });
  const state = renameVariant(createComparison(base, { createId: ids() }), "v1", "Baseline");
  store.write(state);
  const raw = storage.values.get(COMPARISON_STORAGE_KEY);
  assert.equal(raw.includes('"name":"Pikachu"'), false);
  const restored = store.read("pikachu");
  assert.equal(restored.pinnedId, "v1");
  assert.equal(restored.variants[0].name, "Baseline");
  assert.equal(restored.variants[1].side.pokemonId, "pikachu");
  assert.equal(store.read("raichu"), null);
  for (let index = 0; index < MAX_STORED_COMPARISONS; index += 1) {
    store.write({ ...state, pokemonId: `mon${index}` });
  }
  const kept = Object.keys(JSON.parse(storage.values.get(COMPARISON_STORAGE_KEY)).comparisons);
  assert.equal(kept.length, MAX_STORED_COMPARISONS);
  assert.equal(kept.includes("pikachu"), false);
  assert.equal(store.read("pikachu"), null);
});

test("the store repairs duplicate ids, labels and dangling pins", () => {
  const storage = memoryStorage();
  const side = compactSide(base);
  storage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify({ version: 1, comparisons: { pikachu: {
    variants: [
      { id: "x", label: "B", side }, { id: "x", label: "C", side }, { id: "y", label: "B", side },
      { id: "z", label: "A", side }, { id: "w", label: "Q", side }, { id: "r", label: "D", side: { ...side, pokemonId: "raichu" } },
    ],
    pinnedId: "gone", selectedId: "gone",
  } } }));
  const restored = createComparisonStore(storage).read("pikachu");
  assert.deepEqual(restored.variants.map(({ id, label }) => `${label}:${id}`), ["A:z", "B:x"]);
  assert.equal(restored.pinnedId, "z");
  assert.equal(restored.selectedId, "z");
  storage.setItem(COMPARISON_STORAGE_KEY, JSON.stringify({ version: 1, variants: [] }));
  assert.equal(createComparisonStore(storage).read("pikachu"), null);
});

test("analysis keys change with the set or the shared settings only", () => {
  const settings = { opponentCount: 50, speedMode: "auto", field: {} };
  const copy = replaceVariantSide({ variants: [{ id: "a", side: base }] }, "a", { ...base }).variants[0].side;
  assert.equal(analysisKey(base, settings), analysisKey(copy, settings));
  assert.notEqual(analysisKey(base, settings), analysisKey({ ...base, nature: "Modest" }, settings));
  assert.notEqual(analysisKey(base, settings), analysisKey(base, { ...settings, opponentCount: 100 }));
});

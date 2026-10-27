// Set comparison: variants of one Pokémon's set raced against the same opponents. Pure state,
// storage and diff helpers for src/ui/compare-page.js (no DOM).
//
// A comparison belongs to one Pokémon. Its pinned variant is the baseline every other variant
// is measured against, and it mirrors the shared active set. Comparisons are stored per
// Pokémon, so picking another Pokémon elsewhere starts (or restores) that Pokémon's comparison
// instead of mixing species in one table.
import { normalizeId } from "./catalog.js";
import { createStorageStore } from "./saved-sets.js";
import { RACE_OUTCOMES, summarizeMatchups } from "./matchup-analysis.js";

export const COMPARISON_STORAGE_KEY = "pokecal.compare-sets.v1";
export const VARIANT_LABELS = ["A", "B", "C", "D", "E", "F"];
export const MAX_VARIANTS = VARIANT_LABELS.length;
export const MAX_STORED_COMPARISONS = 20;
export const VARIANT_NAME_LIMIT = 40;
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAGES = ["atk", "def", "spa", "spd", "spe"];
const SLOTS = [0, 1, 2, 3];

// ---------- Sides ----------

// Catalog entries are never saved: a refreshed catalog hydrates every variant.
export function compactSide(side) {
  return {
    pokemonId: normalizeId(side?.pokemon?.id ?? side?.pokemonId),
    nature: String(side?.nature ?? ""),
    sp: Object.fromEntries(STATS.map((key) => [key, Number(side?.sp?.[key] ?? 0) || 0])),
    stages: Object.fromEntries(STAGES.map((key) => [key, Number(side?.stages?.[key] ?? 0) || 0])),
    abilityId: normalizeId(side?.ability?.id ?? side?.abilityId),
    itemId: normalizeId(side?.item?.id ?? side?.itemId),
    status: String(side?.status ?? ""),
    soaked: Boolean(side?.soaked),
    selectedMoveIds: SLOTS.map((index) => normalizeId(side?.selectedMoveIds?.[index])),
    critMoves: SLOTS.map((index) => Boolean(side?.critMoves?.[index])),
    singleTargetMoves: SLOTS.map((index) => Boolean(side?.singleTargetMoves?.[index])),
    moveOptionsBySlot: SLOTS.map((index) => ({ ...(side?.moveOptionsBySlot?.[index] ?? {}) })),
  };
}

/**
 * Rebuilds a side from its compact form. `createSide(pokemon)` supplies every field the compact
 * form does not keep. An ability or item the catalog no longer has stays empty (and is listed in
 * `missing`) rather than silently becoming the usage default, so the variant never claims a
 * choice the user did not make. Returns null when the Pokémon itself is gone.
 */
export function hydrateSide(compact, catalogs, createSide) {
  const source = compactSide(compact);
  const pokemon = catalogs?.pokemonLookup?.get(source.pokemonId) ??
    catalogs?.pokemon?.find((entry) => normalizeId(entry.id) === source.pokemonId);
  if (!pokemon) return null;
  const missing = [];
  const resolve = (id, lookup, field) => {
    if (!id) return null;
    const entry = lookup?.get(id) ?? null;
    if (!entry) missing.push(field);
    return entry;
  };
  const side = {
    ...createSide(pokemon),
    sp: source.sp,
    stages: source.stages,
    ability: resolve(source.abilityId, catalogs.abilityLookup, "ability"),
    item: resolve(source.itemId, catalogs.itemLookup, "item"),
    status: source.status,
    soaked: source.soaked,
    selectedMoveIds: source.selectedMoveIds,
    critMoves: source.critMoves,
    singleTargetMoves: source.singleTargetMoves,
    moveOptionsBySlot: source.moveOptionsBySlot,
  };
  if (source.nature) side.nature = source.nature;
  return { side, missing };
}

// Sides are immutable (applyControl returns new objects), so a variant copy can share the
// catalog entries and only needs its own top-level object.
function copySide(side) {
  return { ...side };
}

// ---------- Comparison state ----------
// { pokemonId, variants: [{ id, label, name, side }], pinnedId, selectedId }

export function createComparison(side, { createId }) {
  const baseline = { id: createId(), label: VARIANT_LABELS[0], name: "", side };
  const variant = { id: createId(), label: VARIANT_LABELS[1], name: "", side: copySide(side) };
  return {
    pokemonId: normalizeId(side?.pokemon?.id),
    variants: [baseline, variant],
    pinnedId: baseline.id,
    selectedId: variant.id,
  };
}

export function findVariant(state, id) {
  return state?.variants?.find((variant) => variant.id === id) ?? null;
}

/** The first free letter, so labels stay unique however variants are renamed or removed. */
export function nextVariantLabel(variants) {
  const used = new Set(variants.map((variant) => variant.label));
  return VARIANT_LABELS.find((label) => !used.has(label)) ?? null;
}

export function canAddVariant(state) {
  return state.variants.length < MAX_VARIANTS && nextVariantLabel(state.variants) !== null;
}

/** Copies `sourceId` (the selected variant by default) into a new, selected variant. */
export function addVariant(state, { createId, sourceId = state.selectedId }) {
  const source = findVariant(state, sourceId) ?? findVariant(state, state.pinnedId);
  const label = nextVariantLabel(state.variants);
  if (!source || !label || state.variants.length >= MAX_VARIANTS) return state;
  const variant = { id: createId(), label, name: "", side: copySide(source.side) };
  return { ...state, variants: sortByLabel([...state.variants, variant]), selectedId: variant.id };
}

export function selectVariant(state, id) {
  return findVariant(state, id) ? { ...state, selectedId: id } : state;
}

export function pinVariant(state, id) {
  return findVariant(state, id) ? { ...state, pinnedId: id } : state;
}

/** The baseline cannot be removed; pin another variant first. */
export function removeVariant(state, id) {
  if (id === state.pinnedId || !findVariant(state, id)) return state;
  const variants = state.variants.filter((variant) => variant.id !== id);
  return { ...state, variants, selectedId: state.selectedId === id ? state.pinnedId : state.selectedId };
}

export function renameVariant(state, id, name) {
  const clean = cleanName(name);
  return {
    ...state,
    variants: state.variants.map((variant) => variant.id === id ? { ...variant, name: clean } : variant),
  };
}

export function replaceVariantSide(state, id, side) {
  return {
    ...state,
    variants: state.variants.map((variant) => variant.id === id ? { ...variant, side } : variant),
  };
}

export function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim().slice(0, VARIANT_NAME_LIMIT);
}

function sortByLabel(variants) {
  return [...variants].sort((a, b) => VARIANT_LABELS.indexOf(a.label) - VARIANT_LABELS.indexOf(b.label));
}

// ---------- Storage ----------

function validVariant(variant) {
  return typeof variant?.id === "string" && Boolean(variant.id) && VARIANT_LABELS.includes(variant.label) &&
    Boolean(variant.side?.pokemonId);
}

/**
 * Comparisons keyed by Pokémon id, most recently used kept. `read(pokemonId)` returns the stored
 * compact comparison (sides still compact) or null; `write(state)` stores one comparison.
 */
export function createComparisonStore(storage = null, { now = () => Date.now() } = {}) {
  const store = createStorageStore(storage, {
    key: COMPARISON_STORAGE_KEY,
    createEmpty: () => ({ version: 1, comparisons: {} }),
    isValid: (value) => value?.version === 1 && value.comparisons && typeof value.comparisons === "object" &&
      !Array.isArray(value.comparisons),
  });
  return {
    read(pokemonId) {
      const key = normalizeId(pokemonId);
      const entry = store.read().comparisons[key];
      if (!Array.isArray(entry?.variants)) return null;
      const ids = new Set();
      const labels = new Set();
      const variants = sortByLabel(entry.variants.filter((variant) => {
        if (!validVariant(variant) || normalizeId(variant.side.pokemonId) !== key) return false;
        if (ids.has(variant.id) || labels.has(variant.label)) return false;
        ids.add(variant.id);
        labels.add(variant.label);
        return true;
      })).map(({ id, label, name, side }) => ({ id, label, name: cleanName(name), side }));
      if (variants.length === 0) return null;
      const pinnedId = variants.some(({ id }) => id === entry.pinnedId) ? entry.pinnedId : variants[0].id;
      const selectedId = variants.some(({ id }) => id === entry.selectedId) ? entry.selectedId : pinnedId;
      return { pokemonId: key, variants, pinnedId, selectedId };
    },
    write(state) {
      const pokemonId = normalizeId(state?.pokemonId);
      if (!pokemonId) return;
      const value = store.read();
      value.comparisons[pokemonId] = {
        variants: state.variants.map(({ id, label, name, side }) => ({
          id, label, name: cleanName(name), side: compactSide(side),
        })),
        pinnedId: state.pinnedId,
        selectedId: state.selectedId,
        updatedAt: now(),
      };
      const kept = Object.entries(value.comparisons)
        .sort(([, a], [, b]) => (Number(b?.updatedAt) || 0) - (Number(a?.updatedAt) || 0))
        .slice(0, MAX_STORED_COMPARISONS);
      store.write({ version: 1, comparisons: Object.fromEntries(kept) });
    },
  };
}

// ---------- Differences between two sets ----------

/**
 * Every difference between the baseline and a variant, as data the page localizes:
 * `{ kind: "move", slot, from, to }` (move ids), `{ kind: "nature" | "ability" | "item" |
 * "status", from, to }`, `{ kind: "sp" | "stage", stat, from, to }`, `{ kind: "crit", slot, to }`,
 * `{ kind: "conditions", slot }`, and `{ kind: "soaked", to }`.
 */
export function setChanges(base, other) {
  const a = compactSide(base);
  const b = compactSide(other);
  const changes = [];
  for (const slot of SLOTS) {
    if (a.selectedMoveIds[slot] !== b.selectedMoveIds[slot]) {
      changes.push({ kind: "move", slot, from: a.selectedMoveIds[slot], to: b.selectedMoveIds[slot] });
    }
  }
  for (const [kind, key] of [["nature", "nature"], ["ability", "abilityId"], ["item", "itemId"], ["status", "status"]]) {
    if (a[key] !== b[key]) changes.push({ kind, from: a[key], to: b[key] });
  }
  if (a.soaked !== b.soaked) changes.push({ kind: "soaked", to: b.soaked });
  for (const stat of STATS) {
    if (a.sp[stat] !== b.sp[stat]) changes.push({ kind: "sp", stat, from: a.sp[stat], to: b.sp[stat] });
  }
  for (const stat of STAGES) {
    if (a.stages[stat] !== b.stages[stat]) changes.push({ kind: "stage", stat, from: a.stages[stat], to: b.stages[stat] });
  }
  for (const slot of SLOTS) {
    if (a.critMoves[slot] !== b.critMoves[slot]) changes.push({ kind: "crit", slot, to: b.critMoves[slot] });
    if (a.singleTargetMoves[slot] !== b.singleTargetMoves[slot] ||
      stableJson(a.moveOptionsBySlot[slot]) !== stableJson(b.moveOptionsBySlot[slot])) {
      changes.push({ kind: "conditions", slot });
    }
  }
  return changes;
}

/**
 * A short tally for a variant card: how many moves changed and which other parts changed, in a
 * fixed order ("item", "ability", "nature", "sp", "stages", "status", "moveSettings").
 */
export function changeTally(changes) {
  const moves = changes.filter((change) => change.kind === "move").length;
  const groups = {
    item: ["item"], ability: ["ability"], nature: ["nature"], sp: ["sp"], stages: ["stage"],
    status: ["status", "soaked"], moveSettings: ["crit", "conditions"],
  };
  const parts = Object.entries(groups)
    .filter(([, kinds]) => changes.some((change) => kinds.includes(change.kind)))
    .map(([part]) => part);
  return { moves, parts };
}

function stableJson(value) {
  return JSON.stringify(Object.keys(value ?? {}).sort().map((key) => [key, value[key]]));
}

// ---------- Results ----------

// Better for you, from worst to best. A speed race and No KO sit between a loss and a win
// without ranking against each other: a move-order coin flip is not clearly better or worse
// than neither side KOing.
const OUTCOME_RANK = { loss: 0, speed: 1, stalemate: 1, win: 2 };

/** How an opponent's outcome moved from the baseline: "better", "worse", "different" or "same". */
export function outcomeShift(baseOutcome, outcome) {
  if (!baseOutcome || !outcome || baseOutcome === outcome) return "same";
  const diff = OUTCOME_RANK[outcome] - OUTCOME_RANK[baseOutcome];
  return diff > 0 ? "better" : diff < 0 ? "worse" : "different";
}

/** Whether a change in an outcome count is good news: more wins, fewer losses. */
export function deltaTone(outcome, delta) {
  if (!delta) return "neutral";
  if (outcome === "win") return delta > 0 ? "good" : "bad";
  if (outcome === "loss") return delta > 0 ? "bad" : "good";
  return "neutral";
}

/**
 * Aligns each variant's analysis rows by opponent. Every analysis races the same ranked opponent
 * pool, so rows follow the baseline's rank order. Returns per-variant outcome counts with deltas
 * against the baseline, and per-opponent cells with each variant's shift from the baseline.
 */
export function comparisonRows(analyses, pinnedId) {
  const pin = analyses.find(({ id }) => id === pinnedId) ?? analyses[0];
  const baseCounts = summarizeMatchups(pin?.rows ?? []).counts;
  const variants = analyses.map(({ id, rows }) => {
    const { count, counts } = summarizeMatchups(rows);
    return {
      id, count, counts,
      delta: Object.fromEntries(RACE_OUTCOMES.map((outcome) => [outcome, counts[outcome] - baseCounts[outcome]])),
    };
  });
  const byVariant = new Map(analyses.map(({ id, rows }) => [id, new Map(rows.map((row) => [row.id, row]))]));
  const rows = (pin?.rows ?? []).map((opponent) => {
    const cells = {};
    const shifts = {};
    for (const { id } of analyses) {
      const cell = byVariant.get(id).get(opponent.id) ?? null;
      cells[id] = cell;
      shifts[id] = id === pin.id ? "same" : outcomeShift(opponent.result.outcome, cell?.result.outcome);
    }
    return { id: opponent.id, opponent, cells, shifts, changed: Object.values(shifts).some((shift) => shift !== "same") };
  });
  return { variants, rows };
}

/** A cache key for one variant's analysis: the set plus every shared setting it depends on. */
export function analysisKey(side, settings) {
  return JSON.stringify([compactSide(side), settings]);
}

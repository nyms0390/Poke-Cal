import { normalizeId } from "./catalog.js";
import { createStorageStore } from "./saved-sets.js";
import { RACE_OUTCOMES, summarizeMatchups } from "./matchup-analysis.js";

export const COMPARISON_STORAGE_KEY = "pokecal.compare-sets.v1";
const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAGES = ["atk", "def", "spa", "spd", "spe"];
const SLOTS = [0, 1, 2, 3];

// Catalog entries are deliberately never saved: a refreshed catalog hydrates every variant.
export function compactSide(side) {
  return {
    pokemonId: normalizeId(side?.pokemon?.id ?? side?.pokemonId),
    nature: String(side?.nature ?? ""),
    sp: Object.fromEntries(STATS.map((key) => [key, Number(side?.sp?.[key] ?? 0)])),
    stages: Object.fromEntries(STAGES.map((key) => [key, Number(side?.stages?.[key] ?? 0)])),
    abilityId: normalizeId(side?.ability?.id ?? side?.abilityId),
    itemId: normalizeId(side?.item?.id ?? side?.itemId),
    status: String(side?.status ?? ""),
    soaked: Boolean(side?.soaked),
    selectedMoveIds: SLOTS.map((index) => normalizeId(side?.selectedMoveIds?.[index])),
    critMoves: SLOTS.map((index) => Boolean(side?.critMoves?.[index])),
    moveOptionsBySlot: SLOTS.map((index) => ({ ...(side?.moveOptionsBySlot?.[index] ?? {}) })),
  };
}

export function hydrateSide(compact, catalogs, createSide) {
  const pokemon = catalogs?.pokemonLookup?.get(normalizeId(compact?.pokemonId)) ??
    catalogs?.pokemon?.find((entry) => normalizeId(entry.id) === normalizeId(compact?.pokemonId));
  if (!pokemon) return null;
  const base = createSide(pokemon);
  const source = compactSide(compact);
  return {
    ...base,
    nature: source.nature || base.nature,
    sp: source.sp,
    stages: source.stages,
    ability: source.abilityId ? catalogs.abilityLookup?.get(source.abilityId) ?? base.ability : null,
    item: source.itemId ? catalogs.itemLookup?.get(source.itemId) ?? base.item : null,
    status: source.status,
    soaked: source.soaked,
    selectedMoveIds: source.selectedMoveIds,
    critMoves: source.critMoves,
    moveOptionsBySlot: source.moveOptionsBySlot,
  };
}

export function createComparisonStore(storage = null) {
  const store = createStorageStore(storage, {
    key: COMPARISON_STORAGE_KEY,
    createEmpty: () => ({ version: 1, variants: [], pinnedId: "", selectedId: "" }),
    isValid: (value) => value?.version === 1 && Array.isArray(value.variants),
  });
  return {
    read: () => store.read(),
    write({ variants, pinnedId, selectedId }) {
      store.write({
        version: 1,
        variants: variants.map(({ id, name, side }) => ({ id, name: String(name ?? "").slice(0, 60), side: compactSide(side) })),
        pinnedId, selectedId,
      });
    },
  };
}

export function pinVariant(state, id) {
  if (!state.variants.some((variant) => variant.id === id)) return state;
  return { ...state, pinnedId: id, selectedId: id };
}

export function removeVariant(state, id) {
  if (id === state.pinnedId) return state;
  const variants = state.variants.filter((variant) => variant.id !== id);
  return { ...state, variants, selectedId: state.selectedId === id ? state.pinnedId : state.selectedId };
}

export function changedFields(base, other) {
  const a = compactSide(base);
  const b = compactSide(other);
  const fields = [];
  for (const key of ["pokemonId", "nature", "abilityId", "itemId", "status", "soaked"]) {
    if (a[key] !== b[key]) fields.push(key.replace("Id", ""));
  }
  for (const key of STATS) if (a.sp[key] !== b.sp[key]) fields.push(`${key} SP`);
  for (const key of STAGES) if (a.stages[key] !== b.stages[key]) fields.push(`${key} stage`);
  for (const index of SLOTS) {
    if (a.selectedMoveIds[index] !== b.selectedMoveIds[index]) fields.push(`move ${index + 1}`);
    if (a.critMoves[index] !== b.critMoves[index]) fields.push(`move ${index + 1} critical`);
    if (JSON.stringify(a.moveOptionsBySlot[index]) !== JSON.stringify(b.moveOptionsBySlot[index])) fields.push(`move ${index + 1} conditions`);
  }
  return fields;
}

// Every analysis uses the same ranked opponent pool. Preserve that rank order and align by id.
export function comparisonRows(analyses, pinnedId) {
  const pin = analyses.find(({ id }) => id === pinnedId) ?? analyses[0];
  const pinnedSummary = summarizeMatchups(pin?.rows ?? []);
  const variants = analyses.map(({ id, rows }) => {
    const summary = summarizeMatchups(rows);
    return {
      id, ...summary,
      delta: Object.fromEntries(RACE_OUTCOMES.map((outcome) => [outcome, summary.counts[outcome] - pinnedSummary.counts[outcome]])),
    };
  });
  const ordered = pin?.rows ?? [];
  const byVariant = new Map(analyses.map(({ id, rows }) => [id, new Map(rows.map((row) => [row.id, row]))]));
  return {
    variants,
    rows: ordered.map((opponent) => {
      const cells = Object.fromEntries(analyses.map(({ id }) => [id, byVariant.get(id).get(opponent.id) ?? null]));
      return {
        id: opponent.id, opponent,
        cells,
        changed: analyses.some(({ id }) => id !== pinnedId && cells[id]?.result.outcome !== opponent.result.outcome),
      };
    }),
  };
}

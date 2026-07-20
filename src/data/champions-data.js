import { normalizeId } from "../identifiers.js";
import { extractLearnsetMoves } from "./showdown-data.js";

export const CHAMPIONS_MOD_BASE_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/mods/champions";

export function isChampionsLegalFormatsEntry(formatsEntry) {
  if (!formatsEntry) return false;
  if (formatsEntry.isNonstandard) return false;
  return formatsEntry.tier !== "Illegal";
}

export function applyChampionsData(data, mod) {
  return {
    ...data,
    pokemon: applyChampionsPokemon(data.pokemon, mod),
    abilities: overlayCatalogEntries(data.abilities, mod.abilities),
    moves: overlayCatalogEntries(data.moves, mod.moves),
    items: overlayCatalogEntries(data.items, mod.items),
  };
}

function applyChampionsPokemon(pokemon, { formatsData = {}, learnsets = {} }) {
  return pokemon.map((entry) => {
    const formatsEntry = formatsData[entry.id] ?? formatsData[normalizeId(entry.baseSpecies)];
    const legal = isChampionsLegalFormatsEntry(formatsEntry);
    const championsMoves = extractLearnsetMoves(learnsets, entry.id, entry.baseSpecies);
    const champions = { ...entry.champions, legal };

    if (legal && formatsEntry?.tier) champions.tier = formatsEntry.tier;
    else delete champions.tier;

    return {
      ...entry,
      moves: legal && championsMoves.length > 0 ? championsMoves : entry.moves,
      champions,
    };
  });
}

function overlayCatalogEntries(entries, modTable = {}) {
  return entries.map((entry) => {
    const overridden = overlayEntry(entry, modTable[entry.id]);
    return {
      ...overridden,
      champions: { ...entry.champions, legal: !overridden.isNonstandard },
    };
  });
}

function overlayEntry(entry, modEntry) {
  if (!modEntry) return entry;

  const overridden = { ...entry };
  for (const [key, value] of Object.entries(modEntry)) {
    if (key === "inherit") continue;
    if (value === undefined) {
      delete overridden[key];
    } else if (typeof value !== "function") {
      overridden[key] = toSerializableValue(value);
    }
  }
  return overridden;
}

function toSerializableValue(value) {
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, childValue]) => typeof childValue !== "function")
      .map(([key, childValue]) => [key, toSerializableValue(childValue)]),
  );
}

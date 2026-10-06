import { normalizeId } from "../identifiers.js";

// Hand-maintained Traditional Chinese names that replace the PokeAPI-sourced `aliases[0]` of a
// catalog entry. `npm run sync-data` applies these after downloading PokeAPI, so they survive
// the weekly Update Data workflow. After editing, run `npm run apply-name-overrides` to patch the
// committed public/*.json catalogs (and their web/MCP derivatives) without a full re-sync.
//
// Keys are catalog ids. A Pokémon key is matched against the base species too, so one entry
// covers every form (e.g. `kingambit`).
export const ZH_TW_NAME_OVERRIDES = {
  pokemon: {
    kingambit: "仆斬將軍",
  },
  abilities: {
    terashell: "太晶甲殼", // PokeAPI lists 貫穿鑽.
  },
  moves: {},
  items: {},
};

// Returns `catalogs` with overridden names placed first in `aliases`, dropping the PokeAPI
// name it replaces. Catalog kinds missing from `catalogs` are left out of the result untouched.
export function applyZhTwNameOverrides(catalogs, overrides = ZH_TW_NAME_OVERRIDES) {
  const result = { ...catalogs };
  for (const [kind, names] of Object.entries(overrides)) {
    if (!Array.isArray(catalogs[kind])) continue;
    result[kind] = catalogs[kind].map((entry) => {
      const name = names[entry.id] ?? (kind === "pokemon" ? names[baseSpeciesId(entry)] : undefined);
      if (!name) return entry;
      const [, ...rest] = entry.aliases ?? [];
      return { ...entry, aliases: [name, ...rest.filter((alias) => alias !== name)] };
    });
  }
  return result;
}

export function unknownOverrideIds(catalogs, overrides = ZH_TW_NAME_OVERRIDES) {
  const missing = [];
  for (const [kind, names] of Object.entries(overrides)) {
    const entries = catalogs[kind] ?? [];
    for (const id of Object.keys(names)) {
      const found = entries.some((entry) => entry.id === id || (kind === "pokemon" && baseSpeciesId(entry) === id));
      if (!found) missing.push(`${kind}.${id}`);
    }
  }
  return missing;
}

function baseSpeciesId(entry) {
  return entry.baseSpecies ? normalizeId(entry.baseSpecies) : "";
}

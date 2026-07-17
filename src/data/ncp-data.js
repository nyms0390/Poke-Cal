import { normalizeId } from "./catalog.js";
import { parseUsageSpread } from "./usage-defaults.js";

export const NCP_CALC_URL = "https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/";
export const NCP_SETDEX_URL =
  "https://raw.githubusercontent.com/nerd-of-now/NCP-VGC-Damage-Calculator/main/script_res/setdex_ncp-g10.js";

const SP_KEY_MAP = { hp: "hp", at: "atk", df: "def", sa: "spa", sd: "spd", sp: "spe" };
const SP_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

// The NCP setdex is a hand-maintained JS assignment (`var SETDEX_GEN10 = {...};`) with
// trailing commas and full-line `//` comments, so it is not strict JSON. Strip the
// comment lines, the assignment wrapper, and trailing commas, then JSON.parse — no
// eval, browser-safe. (Set values are Pokémon/move/item names, which never contain
// `//`, so line-anchored comment stripping is safe.)
export function parseNcpSetdex(jsText) {
  const body = String(jsText ?? "")
    .replace(/^﻿/, "")
    .replace(/^\s*\/\/[^\n]*$/gm, "")
    .replace(/^\s*var\s+\w+\s*=\s*/, "")
    .replace(/;?\s*$/, "")
    .replace(/,(\s*[}\]])/g, "$1");
  const setdex = JSON.parse(body);
  if (!setdex || typeof setdex !== "object" || Array.isArray(setdex)) {
    throw new Error("NCP setdex did not parse to an object of Pokémon sets.");
  }
  return setdex;
}

export function buildNcpSets(setdex, { dataUrl = NCP_SETDEX_URL } = {}) {
  const pokemon = Object.entries(setdex ?? {})
    .map(([name, sets]) => ({
      id: normalizeId(name),
      name,
      sets: Object.entries(sets ?? {})
        .map(([setName, set]) => toNcpSet(setName, set))
        .filter(Boolean),
    }))
    .filter((entry) => entry.sets.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    source: "NCP",
    sourceName: "Nimbasa City Post damage calculator sets",
    sourceUrl: NCP_CALC_URL,
    dataUrl,
    pokemon,
  };
}

export function mergeNcpSets(pokemon, ncp) {
  const lookup = new Map();
  for (const entry of ncp.pokemon) {
    lookup.set(entry.id, entry);
    lookup.set(normalizeId(entry.name), entry);
  }
  const meta = {
    source: ncp.source,
    sourceName: ncp.sourceName,
    sourceUrl: ncp.sourceUrl,
    dataUrl: ncp.dataUrl,
  };

  return pokemon.map((entry) => {
    const ncpEntry =
      lookup.get(normalizeId(entry.id)) ?? lookup.get(normalizeId(entry.name));
    if (!ncpEntry) return clearNcpSets(entry);

    return {
      ...entry,
      champions: { ...entry.champions, ncp: { meta, sets: ncpEntry.sets } },
    };
  });
}

function toNcpSet(setName, set) {
  if (!set || typeof set !== "object") return null;

  const sps = Object.fromEntries(SP_KEYS.map((stat) => [stat, 0]));
  for (const [ncpKey, stat] of Object.entries(SP_KEY_MAP)) {
    const value = Number(set.sps?.[ncpKey] ?? 0);
    if (!Number.isFinite(value)) return null;
    sps[stat] = value;
  }

  const spreadName = `${set.nature}:${SP_KEYS.map((stat) => sps[stat]).join("/")}`;
  // Reuse the canonical validator so NCP spreads obey the same nature/SP rules as
  // Smogon ladder spreads; skip (never repair) sets that fail it.
  if (!parseUsageSpread(spreadName)) return null;

  return {
    name: String(setName),
    spreadName,
    nature: set.nature,
    sps,
    ability: set.ability ?? "",
    item: set.item ?? "",
    moves: Array.isArray(set.moves) ? set.moves.map(String) : [],
  };
}

function clearNcpSets(entry) {
  if (!entry.champions?.ncp) return entry;
  const champions = { ...entry.champions };
  delete champions.ncp;
  return { ...entry, champions };
}

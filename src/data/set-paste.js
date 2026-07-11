import { normalizeId } from "./catalog.js";
import { normalizeSearch } from "./pokemon.js";

const STAT_LABELS = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const STAT_IDS = {
  hp: "hp",
  atk: "atk",
  attack: "atk",
  def: "def",
  defense: "def",
  spa: "spa",
  spatk: "spa",
  specialattack: "spa",
  spd: "spd",
  spdef: "spd",
  specialdefense: "spd",
  spe: "spe",
  speed: "spe",
};
const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const NATURE_PATTERN = /^(.+?)\s+Nature$/i;

export function parseSetPaste(text, catalogs = {}) {
  const lookup = buildSetLookup(catalogs);
  const warnings = [];
  const parsed = {
    pokemon: null,
    item: null,
    ability: null,
    teraType: "",
    nature: "",
    sp: neutralSp(),
    hasSpread: false,
    selectedMoveIds: [],
    warnings,
  };

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("-")) {
      const moveName = line.replace(/^-\s*/, "").trim();
      const move = lookup.moves.get(lookupKey(moveName));
      if (move) parsed.selectedMoveIds.push(move.id);
      else warnings.push(`Unknown move: ${moveName}`);
      continue;
    }

    const abilityMatch = /^Ability:\s*(.+)$/i.exec(line);
    if (abilityMatch) {
      const abilityName = abilityMatch[1].trim();
      const ability = lookup.abilities.get(lookupKey(abilityName));
      if (ability) parsed.ability = ability;
      else warnings.push(`Unknown ability: ${abilityName}`);
      continue;
    }

    const teraMatch = /^Tera Type:\s*(.+)$/i.exec(line);
    if (teraMatch) {
      parsed.teraType = teraMatch[1].trim();
      continue;
    }

    const spMatch = /^(SPs|EVs):\s*(.+)$/i.exec(line);
    if (spMatch) {
      const isEvs = spMatch[1].toLowerCase() === "evs";
      parsed.sp = parseSpreadLine(spMatch[2], { evs: isEvs, warnings });
      parsed.hasSpread = true;
      if (isEvs) warnings.push("Mapped EVs to Champions SPs.");
      continue;
    }

    const natureMatch = NATURE_PATTERN.exec(line);
    if (natureMatch) {
      parsed.nature = natureMatch[1].trim();
      continue;
    }

    if (!parsed.pokemon) {
      const { name, itemName } = parseHeader(line);
      const pokemon = lookup.pokemon.get(lookupKey(name));
      if (pokemon) parsed.pokemon = pokemon;
      else warnings.push(`Unknown Pokémon: ${name}`);
      if (itemName) {
        const item = lookup.items.get(lookupKey(itemName));
        if (item) parsed.item = item;
        else warnings.push(`Unknown item: ${itemName}`);
      }
    }
  }

  return parsed;
}

export function formatSetPaste(sideState, catalogs = {}) {
  const moveLookup = entriesByAlias(catalogs.moves ?? []);
  const lines = [
    [sideState.pokemon?.name ?? "", sideState.item?.name ? ` @ ${sideState.item.name}` : ""].join(""),
  ];
  if (sideState.ability?.name) lines.push(`Ability: ${sideState.ability.name}`);
  if (sideState.teraType) lines.push(`Tera Type: ${sideState.teraType}`);
  lines.push(`SPs: ${formatSpLine(sideState.sp)}`);
  if (sideState.nature) lines.push(`${sideState.nature} Nature`);
  for (const move of resolvedMoves(sideState, moveLookup)) {
    if (move?.name) lines.push(`- ${move.name}`);
  }
  return lines.filter(Boolean).join("\n");
}

function buildSetLookup({ pokemon = [], abilities = [], items = [], moves = [] } = {}) {
  return {
    pokemon: entriesByAlias(pokemon),
    abilities: entriesByAlias(abilities),
    items: entriesByAlias(items),
    moves: entriesByAlias(moves),
  };
}

function entriesByAlias(entries) {
  const lookup = new Map();
  for (const entry of entries ?? []) {
    for (const value of [entry.id, entry.name, entry.baseSpecies, ...(entry.aliases ?? [])]) {
      const key = lookupKey(value);
      if (key) lookup.set(key, entry);
    }
  }
  return lookup;
}

function resolvedMoves(sideState, moveLookup) {
  if (sideState.moves?.length) return sideState.moves;
  return (sideState.selectedMoveIds ?? [])
    .map((id) => moveLookup.get(lookupKey(id)) ?? null)
    .filter(Boolean);
}

function lookupKey(value) {
  return normalizeSearch(value) || normalizeId(value);
}

function parseHeader(line) {
  const [name, itemName] = line.split(/\s+@\s+/, 2);
  return { name: name.trim(), itemName: itemName?.trim() ?? "" };
}

function parseSpreadLine(value, { evs, warnings }) {
  const sp = neutralSp();
  for (const part of value.split("/")) {
    const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(part);
    if (!match) {
      if (part.trim()) warnings.push(`Could not parse spread part: ${part.trim()}`);
      continue;
    }
    const stat = STAT_IDS[normalizeId(match[2])];
    if (!stat) {
      warnings.push(`Unknown stat: ${match[2].trim()}`);
      continue;
    }
    const raw = Number(match[1]);
    const value = evs ? Math.round(raw / 8) : raw;
    sp[stat] = clampSp(value);
  }
  return sp;
}

function formatSpLine(sp = {}) {
  return STAT_ORDER
    .filter((stat) => Number(sp[stat] ?? 0) !== 0)
    .map((stat) => `${sp[stat]} ${STAT_LABELS[stat]}`)
    .join(" / ") || "0 HP";
}

function neutralSp() {
  return { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
}

function clampSp(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(32, Math.trunc(value)));
}

import { normalizeId } from "./catalog.js";
import { createStorageStore } from "./saved-sets.js";
import { parseSetPaste } from "./set-paste.js";

// The user's own teams (docs/DECISIONS.md "My teams"): kept in this browser only, each member
// stored as Showdown paste text so a team round-trips through Showdown, PokePaste and Battle's
// set paste without loss.
export const MY_TEAMS_STORAGE_KEY = "pokecal.my-teams.v1";
export const TEAM_MEMBER_LIMIT = 6;

const STAT_ORDER = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAT_LABELS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
// Showdown teambuilder backups head each team with "=== [format] Name ===".
const TEAM_HEADER_PATTERN = /^===\s*(?:\[[^\]]*\]\s*)?(.*?)\s*===$/;

function emptyBlob() {
  return { version: 1, selectedId: "", teams: {} };
}

function cleanText(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function cleanMembers(members) {
  return (Array.isArray(members) ? members : [])
    .map(cleanText)
    .filter(Boolean)
    .slice(0, TEAM_MEMBER_LIMIT);
}

function normalizeTeam(id, value) {
  if (!id || !value || typeof value !== "object") return null;
  return {
    id,
    name: String(value.name ?? "").trim() || id,
    members: cleanMembers(value.members),
    updatedAt: String(value.updatedAt ?? ""),
  };
}

function defaultCreateId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Splits a pasted team into one paste block per Pokémon (blocks are separated by blank lines)
// and returns the team name from a Showdown backup header when there is one. Blocks beyond the
// sixth are returned too, so the caller can tell the user they were dropped.
export function splitTeamPaste(text) {
  let name = "";
  const blocks = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };
  for (const rawLine of cleanText(text).split("\n")) {
    const line = rawLine.trim();
    const header = TEAM_HEADER_PATTERN.exec(line);
    if (header) {
      flush();
      if (!name) name = header[1].trim();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return { name, members: blocks };
}

export function formatTeamPaste(team) {
  return cleanMembers(team?.members).join("\n\n");
}

// A member paste from catalog names, for submitted tournament sets that have no spread: without
// an "SPs:" line, loading the member keeps the usage-based default spread.
export function formatMemberPaste({ pokemon, item = "", ability = "", nature = "", sp = null, moves = [] }) {
  if (!pokemon) return "";
  const lines = [item ? `${pokemon} @ ${item}` : pokemon];
  if (ability) lines.push(`Ability: ${ability}`);
  const spLine = sp
    ? STAT_ORDER.filter((stat) => Number(sp[stat] ?? 0) > 0).map((stat) => `${sp[stat]} ${STAT_LABELS[stat]}`).join(" / ")
    : "";
  if (spLine) lines.push(`SPs: ${spLine}`);
  if (nature) lines.push(`${nature} Nature`);
  for (const move of moves) if (move) lines.push(`- ${move}`);
  return lines.join("\n");
}

// Each member paste with its parse (parseSetPaste against the page's catalogs).
export function parseTeamMembers(team, catalogs = {}) {
  return cleanMembers(team?.members).map((text) => ({ text, parsed: parseSetPaste(text, catalogs) }));
}

// Overlays a parsed member paste (parseSetPaste) on a side state seeded with that Pokémon's
// defaults: fields the paste leaves out keep the defaults, as Battle's set import does.
export function applyParsedMember(state, parsed) {
  if (!state || !parsed) return state;
  return {
    ...state,
    ability: parsed.ability ?? state.ability,
    item: parsed.item ?? state.item,
    nature: parsed.nature || state.nature,
    sp: parsed.hasSpread ? { ...parsed.sp } : state.sp,
    selectedMoveIds: parsed.selectedMoveIds?.length
      ? [0, 1, 2, 3].map((index) => parsed.selectedMoveIds[index] ?? "")
      : state.selectedMoveIds,
  };
}

// Where a Pokémon's paste goes when saved into a team: over the member of the same species
// (replaced without asking, by owner decision), else into a free place, else nowhere.
export function memberSlotFor(memberPokemonIds, pokemonId) {
  const id = normalizeId(pokemonId);
  if (!id) return { outcome: "ignored", index: -1 };
  const ids = (memberPokemonIds ?? []).map((value) => normalizeId(value));
  const existing = ids.indexOf(id);
  if (existing >= 0) return { outcome: "replaced", index: existing };
  if (ids.length < TEAM_MEMBER_LIMIT) return { outcome: "added", index: ids.length };
  return { outcome: "full", index: -1 };
}

export function createMyTeamStore(storage = null, { now = () => new Date().toISOString(), createId = defaultCreateId } = {}) {
  const storageStore = createStorageStore(storage, {
    key: MY_TEAMS_STORAGE_KEY,
    createEmpty: emptyBlob,
    isValid: (value) => value?.version === 1 && value.teams && typeof value.teams === "object",
  });

  function readTeams() {
    const blob = storageStore.read();
    return Object.entries(blob.teams)
      .map(([id, value]) => normalizeTeam(id, value))
      .filter(Boolean);
  }

  function writeTeam(team) {
    const blob = storageStore.read();
    blob.teams[team.id] = { name: team.name, members: team.members, updatedAt: team.updatedAt };
    storageStore.write(blob);
    return team;
  }

  // Most recently edited first; ties keep name order.
  function listTeams() {
    return readTeams().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  }

  function getTeam(id) {
    return readTeams().find((team) => team.id === id) ?? null;
  }

  // The team Battle's strip and the My teams page show; falls back to the latest edited team.
  function selectedTeam() {
    const teams = listTeams();
    const { selectedId } = storageStore.read();
    return teams.find((team) => team.id === selectedId) ?? teams[0] ?? null;
  }

  function selectTeam(id) {
    const blob = storageStore.read();
    if (!blob.teams[id]) return false;
    blob.selectedId = id;
    storageStore.write(blob);
    return true;
  }

  function createTeam({ name = "", members = [] } = {}) {
    const existing = new Set(Object.keys(storageStore.read().teams));
    let id = createId();
    while (existing.has(id)) id = createId();
    const team = writeTeam({
      id,
      name: String(name).trim() || defaultTeamName(existing.size + 1),
      members: cleanMembers(members),
      updatedAt: now(),
    });
    selectTeam(id);
    return team;
  }

  function updateTeam(id, { name, members } = {}) {
    const team = getTeam(id);
    if (!team) return null;
    return writeTeam({
      ...team,
      name: name === undefined ? team.name : String(name).trim() || team.name,
      members: members === undefined ? team.members : cleanMembers(members),
      updatedAt: now(),
    });
  }

  // Puts `text` at `index` (replacing that member), or appends it when `index` is the member
  // count and the team has room.
  function setMember(id, index, text) {
    const team = getTeam(id);
    const member = cleanText(text);
    if (!team || !member || !Number.isInteger(index) || index < 0 || index > team.members.length) return null;
    if (index === team.members.length && index >= TEAM_MEMBER_LIMIT) return null;
    const members = [...team.members];
    members[index] = member;
    return updateTeam(id, { members });
  }

  function removeMember(id, index) {
    const team = getTeam(id);
    if (!team || !Number.isInteger(index) || index < 0 || index >= team.members.length) return null;
    return updateTeam(id, { members: team.members.filter((_, memberIndex) => memberIndex !== index) });
  }

  function deleteTeam(id) {
    const blob = storageStore.read();
    if (!blob.teams[id]) return false;
    delete blob.teams[id];
    if (blob.selectedId === id) blob.selectedId = "";
    storageStore.write(blob);
    return true;
  }

  return { listTeams, getTeam, selectedTeam, selectTeam, createTeam, updateTeam, setMember, removeMember, deleteTeam };
}

function defaultTeamName(number) {
  return `Team ${number}`;
}

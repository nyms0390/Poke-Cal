import test from "node:test";
import assert from "node:assert/strict";

import {
  MY_TEAMS_STORAGE_KEY,
  TEAM_MEMBER_LIMIT,
  applyParsedMember,
  createMyTeamStore,
  formatMemberPaste,
  formatTeamPaste,
  memberSlotFor,
  parseTeamMembers,
  splitTeamPaste,
} from "../src/data/my-teams.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function clockedStore(storage = memoryStorage()) {
  let tick = 0;
  let id = 0;
  return createMyTeamStore(storage, {
    now: () => `2026-10-24T00:00:${String(tick++).padStart(2, "0")}Z`,
    createId: () => `t${++id}`,
  });
}

const PELIPPER = "Pelipper @ Damp Rock\nAbility: Drizzle\nSPs: 32 HP / 2 Def / 32 SpA\nModest Nature\n- Hurricane\n- Protect";
const ARCHALUDON = "Archaludon @ Life Orb\nAbility: Stamina\n- Electro Shot";

test("splits a pasted team into member blocks and reads a Showdown backup name", () => {
  const text = `=== [gen9championsvgc] Rain Archaludon ===\r\n\r\n${PELIPPER}\r\n\r\n\r\n${ARCHALUDON}\n`;
  assert.deepEqual(splitTeamPaste(text), { name: "Rain Archaludon", members: [PELIPPER, ARCHALUDON] });
  assert.deepEqual(splitTeamPaste(""), { name: "", members: [] });
  assert.equal(formatTeamPaste({ members: [PELIPPER, ARCHALUDON] }), `${PELIPPER}\n\n${ARCHALUDON}`);
});

test("formats a member paste without a spread line when no spread is known", () => {
  assert.equal(
    formatMemberPaste({ pokemon: "Incineroar", item: "Sitrus Berry", ability: "Intimidate", nature: "Careful", moves: ["Fake Out", "", "Knock Off"] }),
    "Incineroar @ Sitrus Berry\nAbility: Intimidate\nCareful Nature\n- Fake Out\n- Knock Off",
  );
  assert.equal(
    formatMemberPaste({ pokemon: "Pelipper", sp: { hp: 32, atk: 0, spa: 32 } }),
    "Pelipper\nSPs: 32 HP / 32 SpA",
  );
  assert.equal(formatMemberPaste({ pokemon: "" }), "");
});

test("parses members and overlays only the fields a paste sets", () => {
  const catalogs = {
    pokemon: [{ id: "pelipper", name: "Pelipper" }],
    abilities: [{ id: "drizzle", name: "Drizzle" }],
    items: [{ id: "damprock", name: "Damp Rock" }],
    moves: [{ id: "hurricane", name: "Hurricane" }, { id: "protect", name: "Protect" }],
  };
  const [member] = parseTeamMembers({ members: [PELIPPER] }, catalogs);
  assert.equal(member.parsed.pokemon.id, "pelipper");
  const base = { ability: { id: "keeneye" }, item: null, nature: "Bold", sp: { hp: 1 }, selectedMoveIds: ["a", "b", "c", "d"] };
  const merged = applyParsedMember(base, member.parsed);
  assert.equal(merged.item.id, "damprock");
  assert.equal(merged.nature, "Modest");
  assert.equal(merged.sp.spa, 32);
  assert.deepEqual(merged.selectedMoveIds, ["hurricane", "protect", "", ""]);

  const bare = applyParsedMember(base, { pokemon: null, ability: null, item: null, nature: "", sp: {}, hasSpread: false, selectedMoveIds: [] });
  assert.deepEqual(bare, base);
});

test("places a saved Pokémon over the same species, else in a free place", () => {
  assert.deepEqual(memberSlotFor(["pelipper", "archaludon"], "Archaludon"), { outcome: "replaced", index: 1 });
  assert.deepEqual(memberSlotFor(["pelipper"], "incineroar"), { outcome: "added", index: 1 });
  assert.deepEqual(memberSlotFor(["a", "b", "c", "d", "e", "f"], "g"), { outcome: "full", index: -1 });
  assert.deepEqual(memberSlotFor([], ""), { outcome: "ignored", index: -1 });
});

test("creates, edits, selects and deletes teams in browser storage", () => {
  const storage = memoryStorage();
  const store = clockedStore(storage);
  assert.equal(store.selectedTeam(), null);

  const rain = store.createTeam({ name: " Rain ", members: [PELIPPER, "", ARCHALUDON, "x", "x", "x", "x", "x"] });
  assert.equal(rain.name, "Rain");
  assert.equal(rain.members.length, TEAM_MEMBER_LIMIT);
  const sun = store.createTeam({ name: "", members: [] });
  assert.equal(sun.name, "Team 2");
  assert.equal(store.selectedTeam().id, sun.id);
  assert.deepEqual(store.listTeams().map((team) => team.id), [sun.id, rain.id]);

  assert.equal(store.setMember(sun.id, 0, ARCHALUDON).members.length, 1);
  assert.equal(store.setMember(sun.id, 0, PELIPPER).members[0], PELIPPER);
  assert.equal(store.setMember(sun.id, 3, PELIPPER), null);
  assert.equal(store.setMember(rain.id, 6, PELIPPER), null);
  assert.deepEqual(store.removeMember(rain.id, 0).members.slice(0, 1), [ARCHALUDON]);
  assert.equal(store.updateTeam(rain.id, { name: "  " }).name, "Rain");
  assert.equal(store.updateTeam(rain.id, { name: "Rain v2" }).name, "Rain v2");
  assert.deepEqual(store.listTeams().map((team) => team.id), [rain.id, sun.id]);

  assert.equal(store.selectTeam(rain.id), true);
  assert.equal(store.selectTeam("missing"), false);
  assert.equal(createMyTeamStore(storage).selectedTeam().id, rain.id);

  assert.equal(store.deleteTeam(rain.id), true);
  assert.equal(store.deleteTeam(rain.id), false);
  assert.equal(store.selectedTeam().id, sun.id);
  assert.equal(JSON.parse(storage.getItem(MY_TEAMS_STORAGE_KEY)).selectedId, "");
});

test("reads a corrupt or foreign blob as no teams", () => {
  const storage = memoryStorage();
  storage.setItem(MY_TEAMS_STORAGE_KEY, "{not json");
  assert.deepEqual(createMyTeamStore(storage).listTeams(), []);
  storage.setItem(MY_TEAMS_STORAGE_KEY, JSON.stringify({ version: 2, teams: { a: { name: "A" } } }));
  assert.deepEqual(createMyTeamStore(storage).listTeams(), []);
  assert.deepEqual(createMyTeamStore(null).listTeams(), []);
});

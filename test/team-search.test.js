import test from "node:test";
import assert from "node:assert/strict";
import { archiveRegulations, resolveTeamQuery, searchTeamArchive } from "../src/data/team-search.js";

const pokemon = [
  { id: "incineroar", name: "Incineroar", aliases: ["熾焰咆哮虎"] },
  { id: "rillaboom", name: "Rillaboom", aliases: ["轟擂金剛猩"] },
  { id: "charizard", name: "Charizard", aliases: ["噴火龍"] },
  { id: "charizardmegax", name: "Charizard-Mega-X", baseSpecies: "Charizard", aliases: ["噴火龍"] },
  { id: "nidoranf", name: "Nidoran♀" },
  { id: "nidoranm", name: "Nidoran♂" },
  { id: "raichu", name: "Raichu" },
  { id: "pikachu", name: "Pikachu" },
];
const team = (...ids) => ({ playerName: ids.join("/"), pokemon: ids.map((id) => ({ id })) });
const archive = { format: "M-C", tournaments: [
  ...Array.from({ length: 11 }, (_, i) => ({ id: `early-${i}`, format: "M-C", topCut: [team("incineroar")] })),
  { id: "match", format: "M-C", topCut: [team("incineroar", "rillaboom"), team("rillaboom")] },
  { id: "older", format: "M-B", topCut: [team("incineroar", "rillaboom")] },
  { id: "legacy", topCut: [team("charizardmegax")] },
  { id: "other-game", format: "S-I", topCut: [team("incineroar", "rillaboom")] },
] };

test("regulations come only from archived Champions formats, including legacy fallback", () => {
  assert.deepEqual(archiveRegulations(archive), ["M-B", "M-C"]);
  assert.deepEqual(archiveRegulations({ format: "M-C", tournaments: [] }), []);
});
test("queries resolve exact IDs, names and Unicode aliases, trim blanks and deduplicate", () => {
  const result = resolveTeamQuery(" + INCIN-EROAR + 熾焰咆哮虎 ++ 轟擂金剛猩 + ", pokemon);
  assert.equal(result.error, null);
  assert.deepEqual(result.ids, ["incineroar", "rillaboom"]);
  assert.deepEqual(resolveTeamQuery("  ", pokemon).ids, []);
});
test("matching forms and gender preserves distinct identities", () => {
  assert.deepEqual(resolveTeamQuery("噴火龍", pokemon).ids, ["charizard"]);
  assert.deepEqual(resolveTeamQuery("Charizard Mega X", pokemon).ids, ["charizardmegax"]);
  assert.deepEqual(resolveTeamQuery("噴火龍（超級X）", pokemon).ids, ["charizardmegax"]);
  assert.deepEqual(resolveTeamQuery("Nidoran♀ + Nidoran♂", pokemon).ids, ["nidoranf", "nidoranm"]);
  assert.equal(searchTeamArchive(archive, { format: "M-C", query: "Charizard", pokemon }).teamCount, 0);
});
test("unknown, punctuation-only and oversized queries fail instead of broadening", () => {
  assert.deepEqual(resolveTeamQuery("Incineroar + Missing", pokemon).error, { code: "unknown", terms: ["Missing"] });
  assert.equal(resolveTeamQuery("+++", pokemon).error.code, "empty");
  assert.equal(resolveTeamQuery("???", pokemon).error.code, "unknown");
  assert.equal(resolveTeamQuery(pokemon.slice(0, 6).map((p) => p.name).join(" + "), pokemon).error, null);
  assert.equal(resolveTeamQuery(pokemon.map((p) => p.name).join(" + "), pokemon).error.code, "tooMany");
  assert.equal(searchTeamArchive(archive, { format: "M-C", query: "Missing", pokemon }).tournaments.length, 0);
});
test("search requires every distinct Pokémon in the same submitted team anywhere in the regulation", () => {
  const result = searchTeamArchive(archive, { format: "M-C", query: "Incineroar + Rillaboom", pokemon });
  assert.deepEqual(result.tournaments.map(({ id }) => id), ["match"]);
  assert.equal(result.teamCount, 1);
  assert.deepEqual(result.tournaments[0].topCut.map(({ playerName }) => playerName), ["incineroar/rillaboom"]);
  assert.equal(archive.tournaments[11].topCut.length, 2, "archive remains unchanged");
  const browse = searchTeamArchive(archive, { format: "M-B", query: "", pokemon });
  assert.deepEqual(browse.tournaments.map(({ id }) => id), ["older"]);
  assert.equal(browse.searching, false);
});

test("historical submitted names outside the current catalog remain searchable", () => {
  const archived = { format: "M-A", tournaments: [{ format: "M-A", topCut: [
    { pokemon: [{ id: "missingform", name: "Missing-Form" }] },
    { pokemon: [{ id: "raichu", name: "Historical Raichu" }] },
  ] }] };
  const result = searchTeamArchive(archived, { format: "M-A", query: "missing form", pokemon });
  assert.equal(result.error, null);
  assert.equal(result.teamCount, 1);
  assert.equal(searchTeamArchive(archived, { format: "M-A", query: "Historical Raichu", pokemon }).teamCount, 1);
});
test("ambiguous aliases require a specific form instead of silently choosing one", () => {
  const forms = [
    { id: "rotomwash", name: "Rotom-Wash", baseSpecies: "Rotom", aliases: ["洛托姆"] },
    { id: "rotomheat", name: "Rotom-Heat", baseSpecies: "Rotom", aliases: ["洛托姆"] },
  ];
  assert.equal(resolveTeamQuery("洛托姆", forms).error.code, "ambiguous");
  assert.deepEqual(resolveTeamQuery("洛托姆（Wash）", forms).ids, ["rotomwash"]);
});

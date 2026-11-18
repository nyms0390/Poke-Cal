import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BROWSE_LIMIT, lookupBrowseEntries, lookupQueryAfterSelect } from "../src/ui/lookup-browse.js";

const pokemon = [
  { id: "bulbasaur", name: "Bulbasaur", aliases: ["妙蛙種子"], types: ["Grass"] },
  { id: "pikachu", name: "Pikachu", aliases: ["皮卡丘"], types: ["Electric"] },
  { id: "raichu", name: "Raichu", aliases: ["雷丘"], types: ["Electric"] },
];

test("lookup browse keeps the selected Pokémon visible without dropping catalog entries", () => {
  const entries = lookupBrowseEntries(pokemon, pokemon[2], "");
  assert.deepEqual(entries.map(({ id }) => id), ["raichu", "bulbasaur", "pikachu"]);
  assert.equal(entries[0], pokemon[2]);
});

test("blank browse is bounded by Champions usage and never duplicates the selection", () => {
  const entries = Array.from({ length: 25 }, (_, index) => ({
    id: `mon${index}`,
    name: `Mon${index}`,
    aliases: [],
    champions: { usageCount: 25 - index },
  }));

  const lowUsageSelected = lookupBrowseEntries(entries, entries[24], "");
  assert.equal(lowUsageSelected.length, DEFAULT_BROWSE_LIMIT);
  assert.equal(lowUsageSelected[0].id, "mon24");
  assert.deepEqual(lowUsageSelected.slice(1).map(({ id }) => id),
    entries.slice(0, DEFAULT_BROWSE_LIMIT - 1).map(({ id }) => id));
  assert.equal(new Set(lowUsageSelected.map(({ id }) => id)).size, DEFAULT_BROWSE_LIMIT);

  const topUsageSelected = lookupBrowseEntries(entries, entries[0], "");
  assert.deepEqual(topUsageSelected.map(({ id }) => id),
    entries.slice(0, DEFAULT_BROWSE_LIMIT).map(({ id }) => id));
  assert.deepEqual(lookupBrowseEntries(entries, null, "").map(({ id }) => id),
    entries.slice(0, DEFAULT_BROWSE_LIMIT).map(({ id }) => id));
  assert.deepEqual(lookupBrowseEntries(entries, entries[0], "Mon24").map(({ id }) => id),
    ["mon24"]);
});

test("lookup browse searches names and Traditional Chinese aliases without pinning unrelated selection", () => {
  assert.deepEqual(
    lookupBrowseEntries(pokemon, pokemon[0], "皮卡丘").map(({ id }) => id),
    ["pikachu"],
  );
  assert.deepEqual(lookupBrowseEntries(pokemon, pokemon[1], "no match"), []);
});

test("picking a search result keeps the query so the results stay listed", () => {
  const query = "Electric";
  const before = lookupBrowseEntries(pokemon, pokemon[0], query).map(({ id }) => id);
  assert.deepEqual(before, ["pikachu", "raichu"]);
  const kept = lookupQueryAfterSelect(pokemon, pokemon[2], query);
  assert.equal(kept, query);
  assert.deepEqual(lookupBrowseEntries(pokemon, pokemon[2], kept).map(({ id }) => id), before);
  assert.equal(lookupQueryAfterSelect(pokemon, pokemon[1], "皮卡丘"), "皮卡丘");
});

test("a selection outside the current results clears the query so it stays visible", () => {
  assert.equal(lookupQueryAfterSelect(pokemon, pokemon[0], "Electric"), "");
  assert.equal(lookupQueryAfterSelect(pokemon, pokemon[1], "   "), "");
  assert.equal(lookupQueryAfterSelect(pokemon, null, "Electric"), "");
});

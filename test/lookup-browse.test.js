import assert from "node:assert/strict";
import test from "node:test";
import { lookupBrowseEntries } from "../src/ui/lookup-browse.js";

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

test("lookup browse searches names and Traditional Chinese aliases without pinning unrelated selection", () => {
  assert.deepEqual(
    lookupBrowseEntries(pokemon, pokemon[0], "皮卡丘").map(({ id }) => id),
    ["pikachu"],
  );
  assert.deepEqual(lookupBrowseEntries(pokemon, pokemon[1], "no match"), []);
});

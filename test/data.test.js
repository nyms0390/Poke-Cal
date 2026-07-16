import test from "node:test";
import assert from "node:assert/strict";

import { loadPokemonData } from "../src/data/data.js";

test("keeps Mega forms for Champions-used base Pokémon", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const data = {
      "./public/pokemon.json": [
        {
          id: "charizard",
          name: "Charizard",
          baseSpecies: "Charizard",
          abilities: ["Blaze"],
          champions: { legal: true, usageCount: 5 },
        },
        {
          id: "charizardmegax",
          name: "Charizard-Mega-X",
          baseSpecies: "Charizard",
          abilities: ["Tough Claws"],
        },
        {
          id: "charizardmegaz",
          name: "Charizard-Mega-Z",
          baseSpecies: "Charizard",
          champions: { legal: false },
        },
        {
          id: "pikachu",
          name: "Pikachu",
          baseSpecies: "Pikachu",
          abilities: ["Static"],
          champions: { source: "Limitless", usageCount: 1 },
        },
      ],
      "./public/abilities.json": [
        { id: "blaze", name: "Blaze", champions: { legal: true, usageCount: 5 } },
        { id: "toughclaws", name: "Tough Claws", shortDesc: "Powers up contact moves." },
        { id: "static", name: "Static", champions: { legal: false } },
      ],
      "./public/moves.json": [
        { id: "fakeout", name: "Fake Out", champions: { legal: false } },
      ],
      "./public/items.json": [
        { id: "leftovers", name: "Leftovers", champions: { legal: false } },
      ],
    };

    return {
      ok: true,
      json: async () => data[url],
    };
  };

  try {
    const data = await loadPokemonData();

    assert.deepEqual(
      data.pokemon.map(({ id }) => id),
      ["charizard", "charizardmegax"],
    );
    assert.equal(data.abilityLookup.get("toughclaws").name, "Tough Claws");
    assert.equal(data.abilityLookup.has("static"), false);
    assert.equal(data.moveLookup.has("fakeout"), false);
    assert.equal(data.itemLookup.has("leftovers"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

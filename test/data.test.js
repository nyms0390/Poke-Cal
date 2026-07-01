import test from "node:test";
import assert from "node:assert/strict";

import { loadPokemonData } from "../src/data.js";

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
          champions: { usageCount: 5 },
        },
        {
          id: "charizardmegax",
          name: "Charizard-Mega-X",
          baseSpecies: "Charizard",
          abilities: ["Tough Claws"],
        },
        {
          id: "pikachu",
          name: "Pikachu",
          baseSpecies: "Pikachu",
          abilities: ["Static"],
        },
      ],
      "./public/abilities.json": [
        { id: "blaze", name: "Blaze", champions: { usageCount: 5 } },
        { id: "toughclaws", name: "Tough Claws", shortDesc: "Powers up contact moves." },
        { id: "static", name: "Static" },
      ],
      "./public/moves.json": [],
      "./public/items.json": [],
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

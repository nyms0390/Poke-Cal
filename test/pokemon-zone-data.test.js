import test from "node:test";
import assert from "node:assert/strict";

import { mergePokemonZoneCatalogs, parsePokemonZoneCatalog } from "../src/pokemon-zone-data.js";

test("parses Pokemon Zone Champions move listing cards", () => {
  const moves = parsePokemonZoneCatalog(
    `
      <a href="/champions/moves/fake-out/" class="champs-listing-card">
        <div class="champs-listing-card__name">Fake Out</div>
        <div class="champs-listing-card__desc">Makes the target flinch.</div>
        <div class="champs-listing-card__desc">
          <img alt="Physical" src="/category.webp">40 BP · 100% · 12 PP
        </div>
        <div class="champs-listing-card__meta">
          <span>3563<br>uses</span>
          <img alt="Normal" src="/types/normal.png">
        </div>
      </a>
    `,
    "moves",
  );

  assert.deepEqual(moves[0], {
    rank: 1,
    id: "fakeout",
    name: "Fake Out",
    shortDesc: "Makes the target flinch.",
    usageCount: 3563,
    sourceUrl: "https://www.pokemon-zone.com/champions/moves/fake-out/",
    icon: null,
    category: "Physical",
    type: "Normal",
    basePower: 40,
    accuracy: 100,
    pp: 12,
  });
});

test("merges Champions fields into existing public catalogs", () => {
  const catalogs = {
    pokemon: parsePokemonZoneCatalog(
      `
        <a href="/champions/pokemon/charizard-mega-charizard-y/" class="champs-pokemon-card">
          <img src="https://example.test/charizard-y.webp" alt="Mega Charizard Y">
          <div class="champs-pokemon-card__name">Mega Charizard Y</div>
          <span class="type-badge">Fire</span><span class="type-badge">Flying</span>
          <div class="champs-pokemon-card__usage">1006 uses</div>
        </a>
      `,
      "pokemon",
    ),
    abilities: parsePokemonZoneCatalog(
      `
        <a href="/champions/abilities/intimidate/" class="champs-listing-card">
          <div class="champs-listing-card__name">Intimidate</div>
          <div class="champs-listing-card__desc">When the Pokémon enters a battle, it lowers Attack.</div>
          <div class="champs-listing-card__meta">2721</div>
        </a>
      `,
      "abilities",
    ),
    moves: [],
    items: parsePokemonZoneCatalog(
      `
        <a href="/champions/items/raichunite-y/" class="champs-listing-card">
          <img src="https://example.test/raichunite-y.webp" alt="Raichunite Y">
          <div class="champs-listing-card__name">Raichunite Y</div>
          <div class="champs-listing-card__desc">A held item that allows Raichu to Mega Evolve into Mega Raichu Y.</div>
          <div class="champs-listing-card__meta">418</div>
        </a>
      `,
      "items",
    ),
  };

  const merged = mergePokemonZoneCatalogs(
    {
      pokemon: [{ id: "charizardmegay", name: "Charizard-Mega-Y", types: ["Fire", "Flying"] }],
      abilities: [{ id: "intimidate", name: "Intimidate", shortDesc: "Old text." }],
      moves: [],
      items: [{ id: "raichunitey", name: "Raichunite Y", shortDesc: "Old text." }],
    },
    catalogs,
  );

  assert.equal(merged.pokemon[0].champions.usageCount, 1006);
  assert.equal(merged.abilities[0].shortDesc, "When the Pokémon enters a battle, it lowers Attack.");
  assert.equal(merged.items[0].champions.sourceUrl, "https://www.pokemon-zone.com/champions/items/raichunite-y/");
  assert.equal(merged.items[0].shortDesc.includes("Mega Raichu Y"), true);
});

test("rejects Cloudflare challenge pages", () => {
  assert.throws(
    () => parsePokemonZoneCatalog("<title>Just a moment...</title><script>cf_chl</script>", "items"),
    /Cloudflare challenge/,
  );
});

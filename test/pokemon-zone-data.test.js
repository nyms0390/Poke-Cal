import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";

import { downloadPokemonZoneChampions } from "../scripts/sync-pokemon-zone-champions.mjs";
import {
  mergePokemonZoneCatalogs,
  parsePokemonZoneCatalog,
  parsePokemonZonePokemonDetail,
} from "../src/pokemon-zone-data.js";

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
    ).map((entry) => ({
      ...entry,
      baseStats: { hp: 78, atk: 104, def: 78, spa: 159, spd: 115, spe: 100 },
      abilities: [{ id: "drought", name: "Drought" }],
      moves: [
        { id: "heatwave", name: "Heat Wave" },
        { id: "protect", name: "Protect" },
      ],
    })),
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
  assert.equal(merged.pokemon[0].baseStats.spa, 159);
  assert.deepEqual(merged.pokemon[0].abilities, ["Drought"]);
  assert.deepEqual(merged.pokemon[0].moves, ["heatwave", "protect"]);
  assert.equal(merged.pokemon[0].champions.learnableMoveCount, 2);
  assert.equal(merged.abilities[0].shortDesc, "When the Pokémon enters a battle, it lowers Attack.");
  assert.equal(merged.items[0].champions.sourceUrl, "https://www.pokemon-zone.com/champions/items/raichunite-y/");
  assert.equal(merged.items[0].shortDesc.includes("Mega Raichu Y"), true);
});

test("parses Pokemon Zone Champions Pokémon detail pages", () => {
  const detail = parsePokemonZonePokemonDetail(`
    <div class="pokemon-overview-grid">
      <div class="pokemon-overview-grid__stats">
        <span>HP</span><span>108</span>
        <span>Atk</span><span>130</span>
        <span>Def</span><span>95</span>
        <span>Sp.Atk</span><span>80</span>
        <span>Sp.Def</span><span>85</span>
        <span>Speed</span><span>102</span>
      </div>
      <div class="pokemon-overview-grid__abilities">
        <a href="/champions/abilities/rough-skin/" class="champs-listing-card">
          <div class="champs-listing-card__name">Rough Skin</div>
          <div class="champs-listing-card__desc">Damages attackers on contact.</div>
        </a>
      </div>
    </div>
    <div class="learnable-moves-split">
      <table><tbody>
        <tr>
          <td><a href="/champions/moves/dragon-claw/">Dragon Claw</a></td>
          <td><span class="type-badge type-badge--dragon">Dragon</span></td>
          <td>Physical</td>
          <td>80</td>
          <td>100</td>
          <td>16</td>
        </tr>
        <tr>
          <td><a href="/champions/moves/protect/">Protect</a></td>
          <td><span class="type-badge type-badge--normal">Normal</span></td>
          <td>Status</td>
          <td>-</td>
          <td>101</td>
          <td>8</td>
        </tr>
      </tbody></table>
    </div>
  `);

  assert.deepEqual(detail.baseStats, { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 });
  assert.deepEqual(detail.abilities, [
    { id: "roughskin", name: "Rough Skin", shortDesc: "Damages attackers on contact." },
  ]);
  assert.deepEqual(detail.moves, [
    {
      id: "dragonclaw",
      name: "Dragon Claw",
      type: "Dragon",
      category: "Physical",
      basePower: 80,
      accuracy: 100,
      pp: 16,
    },
    {
      id: "protect",
      name: "Protect",
      type: "Normal",
      category: "Status",
      basePower: null,
      accuracy: 101,
      pp: 8,
    },
  ]);
});

test("loads Pokémon detail snapshots for Champions learnable moves", async () => {
  const directory = await mkdtemp("/private/tmp/pokecal-zone-");
  try {
    await writeFile(
      `${directory}/pokemon-zone-champions-pokemon.html`,
      `
        <a href="/champions/pokemon/garchomp/" class="champs-pokemon-card">
          <div class="champs-pokemon-card__name">Garchomp</div>
          <span class="type-badge">Dragon</span><span class="type-badge">Ground</span>
          <div class="champs-pokemon-card__usage">2480 uses</div>
        </a>
      `,
    );
    for (const catalog of ["moves", "items", "abilities"]) {
      await writeFile(`${directory}/pokemon-zone-champions-${catalog}.html`, "");
    }
    await writeFile(
      `${directory}/pokemon-zone-champions-pokemon-garchomp.html`,
      `
        <div class="pokemon-overview-grid">
          <div class="pokemon-overview-grid__stats">
            <span>HP</span><span>108</span><span>Atk</span><span>130</span>
            <span>Def</span><span>95</span><span>Sp.Atk</span><span>80</span>
            <span>Sp.Def</span><span>85</span><span>Speed</span><span>102</span>
          </div>
        </div>
        <div class="learnable-moves-split">
          <table><tbody>
            <tr>
              <td><a href="/champions/moves/earthquake/">Earthquake</a></td>
              <td>Ground</td><td>Physical</td><td>100</td><td>100</td><td>12</td>
            </tr>
          </tbody></table>
        </div>
      `,
    );

    const catalogs = await downloadPokemonZoneChampions({ snapshotDirectory: directory });

    assert.equal(catalogs.pokemon[0].id, "garchomp");
    assert.equal(catalogs.pokemon[0].baseStats.atk, 130);
    assert.deepEqual(catalogs.pokemon[0].moves.map(({ id }) => id), ["earthquake"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects Cloudflare challenge pages", () => {
  assert.throws(
    () => parsePokemonZoneCatalog("<title>Just a moment...</title><script>cf_chl</script>", "items"),
    /Cloudflare challenge/,
  );
});

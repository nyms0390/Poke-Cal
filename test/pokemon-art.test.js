import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { POKEMON_HOME_ART } from "../src/data/pokemon-art.js";
import { pokemonHomeArtFile } from "../src/data/pokemon.js";
import { pokemonArtworkUrl, pokemonSpriteElements, pokemonSpriteUrls } from "../src/ui/components.js";

const webPokemon = JSON.parse(readFileSync(new URL("../public/web/pokemon.json", import.meta.url), "utf8"));
const HOME_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home";

test("every Champions catalog Pokémon has a HOME render", () => {
  const missing = webPokemon.filter((pokemon) => !pokemonHomeArtFile(pokemon)).map(({ name }) => name);
  // Add new entries to src/data/pokemon-art.js from sprites.other.home.front_default of
  // https://pokeapi.co/api/v2/pokemon/<name>.
  assert.deepEqual(missing, []);
});

test("HOME render stems are PokeAPI ids or cosmetic form files", () => {
  for (const [id, file] of Object.entries(POKEMON_HOME_ART)) {
    assert.match(id, /^[a-z0-9]+$/, id);
    assert.match(file, /^[1-9]\d*(-[a-z]+(-[a-z]+)*)?$/, `${id}: ${file}`);
  }
  // Mega and regional forms point at their own renders, not the base species.
  assert.equal(POKEMON_HOME_ART.raichumegay, "10305");
  assert.equal(POKEMON_HOME_ART.ninetalesalola, "10104");
  assert.equal(POKEMON_HOME_ART.vivillonpokeball, "666-poke-ball");
});

test("builds HOME render URLs from catalog entries", () => {
  assert.equal(pokemonArtworkUrl({ id: "pikachu", name: "Pikachu" }), `${HOME_URL}/25.png`);
  assert.equal(pokemonArtworkUrl({ id: "raichumegay", name: "Raichu-Mega-Y" }), `${HOME_URL}/10305.png`);
  assert.equal(pokemonArtworkUrl({ name: "Charizard-Mega-X" }), `${HOME_URL}/10034.png`);
  assert.equal(pokemonArtworkUrl({ id: "missingno", name: "MissingNo." }), "");
  assert.equal(pokemonHomeArtFile({ id: "constructor" }), "");
});

function withFakeDocument(run) {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: (tagName) => ({
      tagName,
      dataset: {},
      hidden: false,
      listeners: {},
      removed: false,
      setAttribute() {},
      addEventListener(name, listener) { this.listeners[name] = listener; },
      remove() { this.removed = true; },
    }),
  };
  try {
    return run();
  } finally {
    globalThis.document = previous;
  }
}

test("artwork sprites fall back from the HOME render to the Showdown sprites", () => {
  withFakeDocument(() => {
    const pikachu = { id: "pikachu", name: "Pikachu", baseSpecies: "Pikachu" };
    const [gen5, animated] = pokemonSpriteUrls(pikachu);
    const [image, fallback] = pokemonSpriteElements(pikachu, { size: 96, artwork: true });

    assert.equal(image.src, `${HOME_URL}/25.png`);
    assert.equal(image.dataset.artwork, "home");
    image.listeners.error();
    assert.equal(image.src, gen5);
    assert.equal(image.dataset.artwork, undefined);
    image.listeners.error();
    assert.equal(image.src, animated);
    image.listeners.error();
    assert.equal(image.removed, true);
    assert.equal(fallback.hidden, false);
  });
});

test("small sprites keep the Showdown sprite chain", () => {
  withFakeDocument(() => {
    const pikachu = { id: "pikachu", name: "Pikachu", baseSpecies: "Pikachu" };
    const [image] = pokemonSpriteElements(pikachu, { size: 42 });
    assert.equal(image.src, pokemonSpriteUrls(pikachu)[0]);
    assert.equal(image.dataset.artwork, undefined);

    const [unmapped] = pokemonSpriteElements({ id: "missingno", name: "MissingNo." }, { size: 96, artwork: true });
    assert.equal(unmapped.src, "https://play.pokemonshowdown.com/sprites/gen5/missingno.png");
    assert.equal(unmapped.dataset.artwork, undefined);
  });
});

test("Lookup's selected Pokémon and Battle's set cards request the HOME render", () => {
  const lookup = readFileSync(new URL("../src/ui/lookup-page.js", import.meta.url), "utf8");
  const battle = readFileSync(new URL("../src/ui/battle-page.js", import.meta.url), "utf8");
  const sheet = readFileSync(new URL("../src/ui/set-sheet.js", import.meta.url), "utf8");
  assert.match(lookup, /function renderSelectedSprite[\s\S]*?artwork: true/);
  assert.match(battle, /summaryHost: document\.querySelector\(`#\$\{side\}-summary-card`\),[\s\S]*?artwork: true/);
  assert.match(sheet, /pokemonSpriteElements\(pokemon, \{ size: 56, artwork \}\)/);
});

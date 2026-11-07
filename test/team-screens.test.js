// Reading a team from the game's team screens (src/data/team-screens.js). Text matching needs a
// canvas, so these tests cover the pixel side: screen detection, numbers, arrows, species and
// move-type icons. The names are checked in a browser by scripts/check-team-screens.cjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodePng } from "../scripts/png.mjs";
import { nameFontCharacters } from "../scripts/build-name-font.mjs";
import {
  PANELS,
  alignScreen,
  detectScreen,
  formatMember,
  iconType,
  mainColumns,
  trimMask,
  matchText,
  readStatsScreen,
  readTeamScreens,
  screenOffset,
  speciesFromStats,
} from "../src/data/team-screens.js";
import { parseSetPaste } from "../src/data/set-paste.js";

const TEAMS = ["rotom", "charizard", "raichu", "scovillain", "absol", "scrafty", "espathra", "hatterene", "grapploct"].map((name) => {
  const dir = new URL(`./fixtures/team-screens/${name}/`, import.meta.url);
  return {
    name,
    stats: decodePng(new URL("stats.png", dir).pathname),
    abilities: decodePng(new URL("abilities.png", dir).pathname),
    truth: JSON.parse(readFileSync(new URL("truth.json", dir), "utf8")).team,
  };
});
const { stats, abilities, truth } = TEAMS[0];
const load = (name) => JSON.parse(readFileSync(new URL(`../public/web/${name}.json`, import.meta.url), "utf8"));
const catalogs = { pokemon: load("pokemon"), moves: load("moves"), items: load("items"), abilities: load("abilities") };
const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

test("tells the two team screens apart and rejects other sizes", () => {
  assert.equal(detectScreen(stats), "stats");
  assert.equal(detectScreen(abilities), "abilities");
  assert.equal(detectScreen({ width: 2048, height: 1536, data: new Uint8ClampedArray(2048 * 1536 * 4) }), null);
});

test("reads every stat, SP and nature on the stats screen", () => {
  for (const { stats, truth } of TEAMS) readStatsScreen(stats).forEach((panel, slot) => {
    const want = truth[slot];
    assert.deepEqual(KEYS.map((k) => panel.stats[k]), want.stats, `${want.species} stats`);
    assert.deepEqual(KEYS.map((k) => panel.sp[k]), want.sp, `${want.species} SP`);
    assert.equal(panel.nature, want.nature, `${want.species} nature`);
  });
});

test("finds the species and form from the stats and type icons", () => {
  for (const { stats, truth } of TEAMS) readStatsScreen(stats).forEach((panel, slot) => {
    const [first] = speciesFromStats(catalogs.pokemon, panel);
    assert.equal(first?.name, truth[slot].species);
  });
});

test("one misread number still finds the species, flagged as a mismatch", () => {
  const panel = readStatsScreen(stats)[1];
  const [first] = speciesFromStats(catalogs.pokemon, { ...panel, stats: { ...panel.stats, spe: 999 } });
  assert.equal(first.name, "Sceptile");
  assert.equal(first.statMisses, 1);
});

test("reads each move's type from its icon", () => {
  const moveType = new Map(catalogs.moves.map((m) => [m.name, m.type]));
  const rows = [38, 96, 150, 205];
  for (const { abilities: screen, truth } of TEAMS) PANELS.forEach(({ x, y }, slot) => {
    const abilities = alignScreen(screen);
    truth[slot].moves.forEach((move, row) => {
      assert.equal(iconType(abilities, x + 580, y + rows[row])[0].type, moveType.get(move), `${truth[slot].species} ${move}`);
    });
  });
});

test("without a text renderer the stats screen alone gives species, nature and SP", () => {
  const result = readTeamScreens([abilities, stats], catalogs, null);
  assert.deepEqual(result.screens.sort(), ["abilities", "stats"]);
  assert.equal(result.members.length, 6);
  const parsed = parseSetPaste(formatMember(result.members[3]), catalogs);
  assert.equal(parsed.pokemon.name, "Indeedee-F");
  assert.equal(parsed.nature, "Relaxed");
  assert.deepEqual(KEYS.map((k) => parsed.sp[k]), truth[3].sp);
});

test("says how many Pokémon could not be identified instead of dropping them silently", () => {
  const { stats, truth } = TEAMS[0];
  // Drop the species and every form of it, since forms can share stats (Rotom).
  const base = catalogs.pokemon.find((p) => p.name === truth[0].species).baseSpecies ?? truth[0].species;
  const without = { ...catalogs, pokemon: catalogs.pokemon.filter((p) => (p.baseSpecies ?? p.name) !== base) };
  const result = readTeamScreens([stats], without, null);
  assert.equal(result.members.length, 5);
  assert.deepEqual(result.warnings.find((w) => w?.unidentified), { unidentified: 1 });
});

test("finds the screens when the game draws them lower than usual", () => {
  const { stats: lower, abilities: lowerAbilities } = TEAMS.find((t) => t.name === "grapploct");
  assert.equal(screenOffset(lower), 46);
  assert.equal(screenOffset(lowerAbilities), 46);
  assert.equal(screenOffset(stats), 0);
  assert.equal(detectScreen(lower), "stats");
  assert.equal(detectScreen(lowerAbilities), "abilities");
});

test("asks for the stats screen when only the abilities screen is given", () => {
  const result = readTeamScreens([abilities], catalogs, null);
  assert.deepEqual(result.warnings, ["noStats"]);
  assert.equal(result.paste, "");
});

// A stand-in for the canvas renderer: each character is a fixed random 10×12 pattern, so names
// that share characters share shapes, as in a real font.
function fakeRenderer() {
  const glyphs = new Map();
  const glyph = (ch) => {
    if (!glyphs.has(ch)) {
      let seed = [...ch].reduce((a, c) => a * 31 + c.codePointAt(0), 7) >>> 0;
      const bits = new Uint8Array(120);
      for (let i = 0; i < bits.length; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        bits[i] = (seed >>> 16) % 3 === 0 ? 1 : 0;
      }
      bits[0] = 1;
      bits[119] = 1;
      glyphs.set(ch, bits);
    }
    return glyphs.get(ch);
  };
  return (text) => {
    const chars = [...text];
    const width = chars.length * 12;
    const data = new Uint8Array(width * 12);
    chars.forEach((ch, k) => {
      const bits = glyph(ch);
      for (let j = 0; j < 12; j++) for (let i = 0; i < 10; i++) data[j * width + k * 12 + i] = bits[j * 10 + i] * 255;
    });
    return { width, height: 12, data };
  };
}

// The fake glyph for the prefix, followed by an X or a Y drawn as the game draws them.
function withLetter(render, prefix, letter) {
  const head = render(prefix);
  const size = head.height;
  const width = head.width + 2 + size;
  const data = new Uint8Array(width * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < head.width; i++) data[j * width + i] = head.data[j * head.width + i];
  const dot = (i, j) => { data[j * width + head.width + 2 + i] = 255; };
  for (let j = 0; j < size; j++) {
    const lower = j >= size / 2;
    if (letter === "Y" && lower) { dot(size / 2 - 1, j); dot(size / 2, j); continue; }
    dot(Math.round((j * (size - 1)) / (size - 1)), j);
    dot(size - 1 - Math.round((j * (size - 1)) / (size - 1)), j);
  }
  return { width, height: size, data };
}

test("Mega Stone X and Y are told apart by the letter's shape, not by usage or the font", () => {
  const render = fakeRenderer();
  const candidates = [
    { name: "Charizardite X", zh: "噴火龍進化石Ｘ", usage: 5 },
    { name: "Charizardite Y", zh: "噴火龍進化石Ｙ", usage: 60 },
  ];
  // The renderer draws the letters as noise, so only the measured shape can decide.
  assert.equal(matchText(withLetter(render, "噴火龍進化石", "X"), candidates, render).name, "Charizardite X");
  assert.equal(matchText(withLetter(render, "噴火龍進化石", "Y"), candidates, render).name, "Charizardite Y");
});

test("names that differ only at the end are told apart by that end, not by usage", () => {
  const render = fakeRenderer();
  const candidates = [
    { name: "Stone One", zh: "進化石甲", usage: 5 },
    { name: "Stone Two", zh: "進化石乙", usage: 60 },
  ];
  assert.equal(matchText(render("進化石甲"), candidates, render).name, "Stone One");
  assert.equal(matchText(render("進化石乙"), candidates, render).name, "Stone Two");
});

test("a character too faint to read does not cut a name short, but distant specks are dropped", () => {
  // 再來 · (faint 一, one character wide) · 次 · … far-off speck. Height 20, characters 20 wide.
  const width = 300;
  const height = 20;
  const data = new Uint8Array(width * height);
  const block = (x0, x1) => { for (let j = 0; j < height; j++) for (let i = x0; i < x1; i++) data[j * width + i] = 255; };
  block(0, 20);
  block(24, 44);
  block(72, 92);
  block(290, 292);
  const kept = trimMask(mainColumns({ width, height, data }));
  assert.equal(kept.width, 92);
});

// A name with a character the font lacks still reads (the browser draws that character with a
// system font), so a data update that adds one is reported as a todo rather than blocking deploys.
test("the bundled name font covers every character in move, item and ability names", async (t) => {
  const bundled = new Set(readFileSync(new URL("../public/fonts/pokecal-names.chars.txt", import.meta.url), "utf8").trim());
  const missing = [...(await nameFontCharacters())].filter((c) => !bundled.has(c));
  if (missing.length) t.todo(`Run node scripts/build-name-font.mjs: the name font lacks ${missing.join("")}`);
});

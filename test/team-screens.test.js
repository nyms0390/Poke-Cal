// Reading a team from the game's team screens (src/data/team-screens.js). Text matching needs a
// canvas, so these tests cover the pixel side: screen detection, numbers, arrows, species and
// move-type icons. The names are checked in a browser by scripts/check-team-screens.cjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodePng } from "../scripts/png.mjs";
import {
  PANELS,
  detectScreen,
  formatMember,
  iconType,
  matchText,
  readStatsScreen,
  readTeamScreens,
  speciesFromStats,
} from "../src/data/team-screens.js";
import { parseSetPaste } from "../src/data/set-paste.js";

const dir = new URL("./fixtures/team-screens/", import.meta.url);
const stats = decodePng(new URL("stats.png", dir).pathname);
const abilities = decodePng(new URL("abilities.png", dir).pathname);
const truth = JSON.parse(readFileSync(new URL("truth.json", dir), "utf8")).team;
const load = (name) => JSON.parse(readFileSync(new URL(`../public/web/${name}.json`, import.meta.url), "utf8"));
const catalogs = { pokemon: load("pokemon"), moves: load("moves"), items: load("items"), abilities: load("abilities") };
const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

test("tells the two team screens apart and rejects other sizes", () => {
  assert.equal(detectScreen(stats), "stats");
  assert.equal(detectScreen(abilities), "abilities");
  assert.equal(detectScreen({ width: 2048, height: 1536, data: new Uint8ClampedArray(2048 * 1536 * 4) }), null);
});

test("reads every stat, SP and nature on the stats screen", () => {
  const panels = readStatsScreen(stats);
  panels.forEach((panel, slot) => {
    const want = truth[slot];
    assert.deepEqual(KEYS.map((k) => panel.stats[k]), want.stats, `${want.species} stats`);
    assert.deepEqual(KEYS.map((k) => panel.sp[k]), want.sp, `${want.species} SP`);
    assert.equal(panel.nature, want.nature, `${want.species} nature`);
  });
});

test("finds the species and form from the stats and type icons", () => {
  readStatsScreen(stats).forEach((panel, slot) => {
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
  PANELS.forEach(({ x, y }, slot) => {
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
      for (let j = 0; j < 12; j++) for (let i = 0; i < 10; i++) data[j * width + k * 12 + i] = bits[j * 10 + i];
    });
    return { width, height: 12, data };
  };
}

test("names that differ only at the end are told apart by that end, not by usage", () => {
  const render = fakeRenderer();
  const candidates = [
    { name: "Charizardite X", zh: "噴火龍進化石Ｘ", usage: 5 },
    { name: "Charizardite Y", zh: "噴火龍進化石Ｙ", usage: 60 },
  ];
  assert.equal(matchText(render("噴火龍進化石Ｘ"), candidates, render).name, "Charizardite X");
  assert.equal(matchText(render("噴火龍進化石Ｙ"), candidates, render).name, "Charizardite Y");
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  NCP_SETDEX_URL,
  buildNcpSets,
  mergeNcpSets,
  parseNcpSetdex,
} from "../src/data/ncp-data.js";

const setdexJs = `//For the Champions calc
var SETDEX_GEN10 = {
    "Venusaur": {
        //M-B
        "Sun Sleep Offense": {
            "sps": {
                "hp": 2,
                "at": 0,
                "df": 0,
                "sa": 32,
                "sd": 0,
                "sp": 32
            },
            "nature": "Modest",
            "ability": "Chlorophyll",
            "item": "Focus Sash",
            "moves": [
                "Leaf Storm",
                "Sludge Bomb",
                "Earth Power",
                "Sleep Powder"
            ],
        },
        "Broken Nature": {
            "sps": {
                "hp": 2,
                "at": 0,
                "df": 0,
                "sa": 32,
                "sd": 0,
                "sp": 32
            },
            "nature": "NotANature",
            "ability": "Chlorophyll",
            "item": "Focus Sash",
            "moves": ["Leaf Storm"],
        },
    },
    "Urshifu-Rapid-Strike": {
        "Band": {
            "level": 50,
            "sps": {
                "hp": 2,
                "at": 32,
                "df": 0,
                "sa": 0,
                "sd": 0,
                "sp": 32
            },
            "nature": "Jolly",
            "ability": "Unseen Fist",
            "item": "Choice Band",
            "moves": [
                "Surging Strikes",
                "Close Combat",
                "Aqua Jet",
                "U-turn"
            ],
        },
    },
    //"": {
    //    "": {},
    //},
};
`;

test("parses the setdex JS assignment despite comments and trailing commas", () => {
  const setdex = parseNcpSetdex(setdexJs);
  assert.deepEqual(Object.keys(setdex), ["Venusaur", "Urshifu-Rapid-Strike"]);
  assert.equal(setdex.Venusaur["Sun Sleep Offense"].nature, "Modest");
  assert.throws(() => parseNcpSetdex("var X = [1, 2];"));
});

test("builds NCP set entries, converting sps keys and dropping invalid sets", () => {
  const ncp = buildNcpSets(parseNcpSetdex(setdexJs));

  assert.equal(ncp.source, "NCP");
  assert.equal(ncp.dataUrl, NCP_SETDEX_URL);

  const [urshifu, venusaur] = ncp.pokemon;
  assert.equal(venusaur.id, "venusaur");
  assert.equal(venusaur.sets.length, 1, "invalid-nature set is dropped, not repaired");
  assert.deepEqual(venusaur.sets[0], {
    name: "Sun Sleep Offense",
    spreadName: "Modest:2/0/0/32/0/32",
    nature: "Modest",
    sps: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
    ability: "Chlorophyll",
    item: "Focus Sash",
    moves: ["Leaf Storm", "Sludge Bomb", "Earth Power", "Sleep Powder"],
  });

  assert.equal(urshifu.id, "urshifurapidstrike");
  assert.equal(urshifu.sets[0].spreadName, "Jolly:2/32/0/0/0/32");
});

test("merges NCP sets into the Pokémon catalog and clears stale entries", () => {
  const ncp = buildNcpSets(parseNcpSetdex(setdexJs));
  const merged = mergeNcpSets(
    [
      { id: "venusaur", name: "Venusaur", champions: { legal: true, usage: { natures: [] } } },
      { id: "pikachu", name: "Pikachu", champions: { legal: true, ncp: { sets: [] } } },
      { id: "urshifurapidstrike", name: "Urshifu-Rapid-Strike" },
    ],
    ncp,
  );

  const [venusaur, pikachu, urshifu] = merged;
  assert.equal(venusaur.champions.ncp.sets.length, 1);
  assert.equal(venusaur.champions.ncp.meta.source, "NCP");
  assert.deepEqual(venusaur.champions.usage.natures, [], "existing usage is preserved");
  assert.equal(venusaur.champions.legal, true);
  assert.equal(pikachu.champions.ncp, undefined, "stale NCP data is cleared");
  assert.equal(urshifu.champions.ncp.sets[0].name, "Band");
});

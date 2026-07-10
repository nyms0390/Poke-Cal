import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";

const neutralStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const aegislashState = {
  nature: "Brave",
  sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 2, spe: 0 },
  stages: neutralStages,
  ability: null,
  item: null,
};
const blankState = {
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stages: neutralStages,
  ability: null,
  item: null,
};

const aegislash = {
  id: "aegislash",
  name: "Aegislash",
  types: ["Steel", "Ghost"],
  baseStats: { hp: 60, atk: 50, def: 140, spa: 50, spd: 140, spe: 60 },
};
const blastoise = {
  id: "blastoise",
  name: "Blastoise",
  types: ["Water"],
  baseStats: { hp: 79, atk: 83, def: 100, spa: 85, spd: 105, spe: 78 },
};

const poltergeist = {
  id: "poltergeist",
  name: "Poltergeist",
  type: "Ghost",
  category: "Physical",
  basePower: 110,
  target: "normal",
};
const explosion = {
  id: "explosion",
  name: "Explosion",
  type: "Normal",
  category: "Physical",
  basePower: 250,
  target: "allAdjacent",
};
const weatherBall = {
  id: "weatherball",
  name: "Weather Ball",
  type: "Normal",
  category: "Special",
  basePower: 50,
  target: "normal",
};
const flashCannon = {
  id: "flashcannon",
  name: "Flash Cannon",
  type: "Steel",
  category: "Special",
  basePower: 80,
  target: "normal",
};

const GOLDEN_CASES = [
  {
    name: "plain STAB hit",
    // NCP Champions, SP mode: 32+ Atk Spell Tag Aegislash Poltergeist into
    // 32 HP / 0 Def Aegislash -> 104-126, guaranteed 2HKO (recorded 2026-07-10).
    input: {
      attacker: aegislash,
      defender: aegislash,
      move: poltergeist,
      attackerState: { ...aegislashState, item: { id: "spelltag", name: "Spell Tag" } },
      defenderState: aegislashState,
    },
    expected: { min: 104, max: 126, koText: "guaranteed 2HKO" },
  },
  {
    name: "doubles spread move",
    // NCP Champions, SP mode: 32+ Atk Aegislash Explosion into 0 HP / 0 Def
    // Blastoise at 130 current HP -> 66-78, guaranteed 2HKO (recorded 2026-07-10).
    input: {
      attacker: aegislash,
      defender: blastoise,
      move: explosion,
      attackerState: aegislashState,
      defenderState: { ...blankState, currentHpFraction: 130 / 154 },
    },
    expected: { min: 66, max: 78, koText: "guaranteed 2HKO" },
  },
  {
    name: "sun-boosted Weather Ball",
    // NCP Champions, SP mode: 0 SpA Aegislash Weather Ball in Sun into
    // 0 HP / 0 SpD Blastoise at 60 current HP -> 16-19, guaranteed 4HKO
    // (recorded 2026-07-10).
    input: {
      attacker: aegislash,
      defender: blastoise,
      move: weatherBall,
      attackerState: aegislashState,
      defenderState: { ...blankState, currentHpFraction: 60 / 154 },
      field: createField({ weather: "SunnyDay" }),
    },
    expected: { min: 16, max: 19, koText: "guaranteed 4HKO" },
  },
  {
    name: "physical hit through Reflect",
    // NCP Champions, SP mode: 32+ Atk Spell Tag Aegislash Poltergeist through
    // Doubles Reflect into 32 HP / 0 Def Aegislash -> 69-84, 0.39% to 2HKO;
    // PokéCal intentionally formats KO odds to one decimal place.
    input: {
      attacker: aegislash,
      defender: aegislash,
      move: poltergeist,
      attackerState: { ...aegislashState, item: { id: "spelltag", name: "Spell Tag" } },
      defenderState: aegislashState,
      field: createField({ defenderSide: { reflect: true } }),
    },
    expected: { min: 69, max: 84, koText: "0.4% chance to 2HKO" },
  },
  {
    name: "Choice Specs plus Tera STAB",
    // NCP Champions records the non-Tera baseline as 15-18 for Choice Specs
    // Aegislash Flash Cannon into Aegislash. Its Champions UI currently hides
    // the Tera control, so the documented pipeline's same-type Tera STAB (x2)
    // is hand-derived here instead of being misrepresented as an NCP recording.
    input: {
      attacker: aegislash,
      defender: aegislash,
      move: flashCannon,
      attackerState: {
        ...aegislashState,
        item: { id: "choicespecs", name: "Choice Specs" },
        teraType: "Steel",
      },
      defenderState: { ...aegislashState, currentHpFraction: 75 / 167 },
    },
    expected: { min: 20, max: 24, koText: "guaranteed 4HKO" },
  },
];

test("P1-06 golden damage and KO cases", () => {
  for (const { name, input, expected } of GOLDEN_CASES) {
    const result = calculateDamage(input);

    assert.equal(result.supported, true, `${name}: supported`);
    assert.deepEqual([result.minDamage, result.maxDamage], [expected.min, expected.max], name);
    assert.equal(result.ko.text, expected.koText, `${name}: KO text`);
  }
});

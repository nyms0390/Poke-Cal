import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";
import { resultDescription } from "../src/engine/result-text.js";

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
    expected: {
      min: 104,
      max: 126,
      koText: "guaranteed 2HKO",
      description: "32 Atk Spell Tag Aegislash Poltergeist vs. 32 HP / 0 Def Aegislash: 104-126 (62.2 - 75.4%) -- guaranteed 2HKO",
    },
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
    expected: {
      min: 69,
      max: 84,
      koText: "0.4% chance to 2HKO",
      description: "32 Atk Spell Tag Aegislash Poltergeist vs. 32 HP / 0 Def Aegislash through Reflect: 69-84 (41.3 - 50.2%) -- 0.4% chance to 2HKO",
    },
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

const p2Attacker = {
  id: "p2attacker",
  name: "P2 attacker",
  types: ["Normal"],
  baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 50 },
};
const p2Defender = {
  id: "p2defender",
  name: "P2 defender",
  types: ["Normal"],
  baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
};
const p2State = {
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  ability: null,
  item: null,
};
const oneHpState = { ...p2State, currentHpFraction: 1 / 175 };

// Phase 2 hand-calculated cases use the documented level-50 pipeline in ROADMAP.md:
// floor at base damage, random roll, STAB/type, then final modifiers. Each comment names the
// task and the mechanic that changes the otherwise-neutral 120-vs-120 stat matchup.
const P2_GOLDEN_CASES = [
  {
    name: "P2-01 Bullet Seed selected for three independent hits",
    // 25 BP gives 11-13 per hit; three hits total 33-39.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "bulletseed", name: "Bullet Seed", type: "Grass", category: "Physical", basePower: 25 },
      attackerState: p2State,
      defenderState: oneHpState,
      moveOptions: { hitCount: 3 },
    },
    expected: { min: 33, max: 39, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-01 Surging Strikes fixed three critical hits",
    // Always-critical 25 BP gives 16-19 per hit; three hits total 48-57.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "surgingstrikes", name: "Surging Strikes", type: "Water", category: "Physical", basePower: 25 },
      attackerState: p2State,
      defenderState: oneHpState,
    },
    expected: { min: 48, max: 57, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-02 Hex doubles against a statused target",
    // Status doubles 65 BP to 130 BP, producing 50-59 without STAB.
    input: {
      attacker: p2Attacker,
      defender: { ...p2Defender, types: ["Fairy"] },
      move: { id: "hex", name: "Hex", type: "Ghost", category: "Special", basePower: 65 },
      attackerState: p2State,
      defenderState: { ...oneHpState, status: "paralysis" },
    },
    expected: { min: 50, max: 59, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-02 burned Facade doubles and skips the burn penalty",
    // 140 BP after the status double gives 53-63 before Normal STAB, then 79-94.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "facade", name: "Facade", type: "Normal", category: "Physical", basePower: 70 },
      attackerState: { ...p2State, status: "burn" },
      defenderState: oneHpState,
    },
    expected: { min: 79, max: 94, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-03 Gyro Ball uses both final Speed values",
    // 70 user Speed vs 120 target Speed gives 43 BP, then 17-20 damage.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "gyroball", name: "Gyro Ball", type: "Steel", category: "Physical", basePower: 0 },
      attackerState: { ...p2State, pokemon: p2Attacker },
      defenderState: { ...oneHpState, pokemon: p2Defender },
    },
    expected: { min: 17, max: 20, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-03 Bolt Beak doubles before the target moves",
    // Moving first doubles 85 BP to 170 BP, producing 64-76 damage.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "boltbeak", name: "Bolt Beak", type: "Electric", category: "Physical", basePower: 85 },
      attackerState: { ...p2State, pokemon: p2Attacker },
      defenderState: { ...oneHpState, pokemon: p2Defender },
      moveOptions: { targetMoved: false },
    },
    expected: { min: 64, max: 76, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-04 Hard Press scales from half target HP",
    // 88/175 HP gives 50 BP; against 40 Defense the result is 57-68 and a guaranteed 2HKO.
    input: {
      attacker: p2Attacker,
      defender: { ...p2Defender, baseStats: { ...p2Defender.baseStats, def: 20 } },
      move: { id: "hardpress", name: "Hard Press", type: "Steel", category: "Physical", basePower: 0 },
      attackerState: p2State,
      defenderState: { ...p2State, currentHpFraction: 0.5 },
    },
    expected: { min: 57, max: 68, koText: "guaranteed 2HKO" },
  },
  {
    name: "P2-04 itemless Acrobatics doubles base power",
    // Itemless Acrobatics uses 110 BP, producing 42-50 damage without STAB.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "acrobatics", name: "Acrobatics", type: "Flying", category: "Physical", basePower: 55 },
      attackerState: p2State,
      defenderState: oneHpState,
    },
    expected: { min: 42, max: 50, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-05 Cloud Nine suppresses Rain damage",
    // With Rain suppressed, 90 BP Surf stays at its neutral 34-41 range.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "surf", name: "Surf", type: "Water", category: "Special", basePower: 90, target: "normal" },
      attackerState: { ...p2State, ability: { id: "cloudnine", name: "Cloud Nine" } },
      defenderState: oneHpState,
      field: createField({ weather: "RainDance" }),
    },
    expected: { min: 34, max: 41, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-05 Hadron Engine boosts Special Attack in Electric Terrain",
    // 120 SpA becomes floor(120 * 4915/4096) = 143; Normal STAB yields 54-64.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "swift", name: "Swift", type: "Normal", category: "Special", basePower: 80 },
      attackerState: { ...p2State, ability: { id: "hadronengine", name: "Hadron Engine" } },
      defenderState: oneHpState,
      field: createField({ terrain: "Electric Terrain" }),
    },
    expected: { min: 54, max: 64, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-06 Pixilate converts type and boosts power",
    // 90 BP becomes 108 BP; Fairy STAB produces 61-73 damage.
    input: {
      attacker: { ...p2Attacker, types: ["Fairy"] },
      defender: p2Defender,
      move: { id: "hypervoice", name: "Hyper Voice", type: "Normal", category: "Special", basePower: 90, flags: { sound: 1 }, target: "normal" },
      attackerState: { ...p2State, ability: { id: "pixilate", name: "Pixilate" } },
      defenderState: oneHpState,
    },
    expected: { min: 61, max: 73, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-06 Scrappy bypasses Ghost immunity",
    // 40 BP Normal damage is 16-19 before STAB, then 24-28.
    input: {
      attacker: p2Attacker,
      defender: { ...p2Defender, types: ["Ghost"] },
      move: { id: "tackle", name: "Tackle", type: "Normal", category: "Physical", basePower: 40 },
      attackerState: { ...p2State, ability: { id: "scrappy", name: "Scrappy" } },
      defenderState: oneHpState,
    },
    expected: { min: 24, max: 28, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-07 Sturdy removes a partial OHKO chance",
    // Raw damage remains 132-156 into 155 HP; the first hit is capped for KO odds only.
    input: {
      attacker: { ...p2Attacker, baseStats: { ...p2Attacker.baseStats, atk: 100 } },
      defender: { ...p2Defender, baseStats: { ...p2Defender.baseStats, hp: 80, def: 80 } },
      move: { id: "sturdyedge", name: "Sturdy Edge", type: "Normal", category: "Physical", basePower: 194 },
      attackerState: p2State,
      defenderState: { ...p2State, ability: { id: "sturdy", name: "Sturdy" } },
    },
    expected: { min: 132, max: 156, koText: "guaranteed 2HKO (Sturdy)" },
  },
  {
    name: "P2-07 Ice Face negates only the first of three hits",
    // Bullet Seed loses its first 11-13 damage hit, leaving two hits for 22-26 total.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "bulletseed", name: "Bullet Seed", type: "Grass", category: "Physical", basePower: 25 },
      attackerState: p2State,
      defenderState: { ...p2State, ability: { id: "iceface", name: "Ice Face" }, iceFaceIntact: true },
      moveOptions: { hitCount: 3 },
    },
    expected: { min: 22, max: 26, koText: "0.0% chance to 5HKO" },
  },
  {
    name: "P2-08 Protosynthesis boosts the highest Special Attack in Sun",
    // 150 SpA becomes 195; 80 BP without STAB produces 50-59 damage.
    input: {
      attacker: {
        ...p2Attacker,
        baseStats: { hp: 100, atk: 50, def: 50, spa: 130, spd: 50, spe: 50 },
      },
      defender: p2Defender,
      move: { id: "psychic", name: "Psychic", type: "Psychic", category: "Special", basePower: 80 },
      attackerState: { ...p2State, ability: { id: "protosynthesis", name: "Protosynthesis" } },
      defenderState: oneHpState,
      field: createField({ weather: "SunnyDay" }),
    },
    expected: { min: 50, max: 59, koText: "guaranteed OHKO" },
  },
  {
    name: "P2-08 Parental Bond adds a quarter-power second hit",
    // 80 BP Normal STAB gives 46-55; the 20 BP second hit adds 12-15 for 58-70.
    input: {
      attacker: p2Attacker,
      defender: p2Defender,
      move: { id: "megapunch", name: "Mega Punch", type: "Normal", category: "Physical", basePower: 80 },
      attackerState: { ...p2State, ability: { id: "parentalbond", name: "Parental Bond" } },
      defenderState: oneHpState,
    },
    expected: { min: 58, max: 70, koText: "guaranteed OHKO" },
  },
];

test("P1-06 golden damage and KO cases", () => {
  for (const { name, input, expected } of GOLDEN_CASES) {
    const result = calculateDamage(input);

    assert.equal(result.supported, true, `${name}: supported`);
    assert.deepEqual([result.minDamage, result.maxDamage], [expected.min, expected.max], name);
    assert.equal(result.ko.text, expected.koText, `${name}: KO text`);
    if (expected.description) {
      assert.equal(
        resultDescription({
          attackerState: { ...input.attackerState, pokemon: input.attacker },
          defenderState: { ...input.defenderState, pokemon: input.defender },
          move: input.move,
          field: input.field,
          result,
        }),
        expected.description,
        `${name}: result description`,
      );
    }
  }
});

test("Phase 2 golden damage and KO cases", () => {
  for (const { name, input, expected } of P2_GOLDEN_CASES) {
    const result = calculateDamage(input);

    assert.equal(result.supported, true, `${name}: supported`);
    assert.deepEqual([result.minDamage, result.maxDamage], [expected.min, expected.max], name);
    assert.equal(result.ko.text, expected.koText, `${name}: KO text`);
  }
});

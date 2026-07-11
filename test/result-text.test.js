import test from "node:test";
import assert from "node:assert/strict";

import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";
import { resultDescription } from "../src/engine/result-text.js";

const neutralStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const attacker = {
  id: "miraidon",
  name: "Miraidon",
  types: ["Electric", "Dragon"],
  baseStats: { hp: 100, atk: 85, def: 100, spa: 135, spd: 115, spe: 135 },
};
const defender = {
  id: "calyrexice",
  name: "Calyrex-Ice",
  types: ["Psychic", "Ice"],
  baseStats: { hp: 100, atk: 165, def: 150, spa: 85, spd: 130, spe: 50 },
};
const electroDrift = {
  id: "electrodrift",
  name: "Electro Drift",
  type: "Electric",
  category: "Special",
  basePower: 100,
};
const bodyPress = {
  id: "bodypress",
  name: "Body Press",
  type: "Fighting",
  category: "Physical",
  basePower: 80,
  overrideOffensiveStat: "def",
};

const attackerState = {
  pokemon: attacker,
  nature: "Hardy",
  sp: { hp: 0, atk: 0, def: 0, spa: 32, spd: 0, spe: 0 },
  stages: neutralStages,
  ability: null,
  item: { id: "choicespecs", name: "Choice Specs" },
};
const defenderState = {
  pokemon: defender,
  nature: "Hardy",
  sp: { hp: 32, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stages: neutralStages,
  ability: null,
  item: null,
};

function describe(input) {
  const result = calculateDamage(input);
  return resultDescription({
    attackerState: input.attackerState,
    defenderState: input.defenderState,
    move: input.move,
    field: input.field,
    result,
  });
}

test("formats a plain NCP-style result sentence", () => {
  assert.equal(
    describe({
      attacker,
      defender,
      move: electroDrift,
      attackerState,
      defenderState,
      field: createField(),
    }),
    "32 SpA Choice Specs Miraidon Electro Drift vs. 32 HP / 0 SpD Calyrex-Ice: 106-126 (51.2 - 60.8%) -- guaranteed 2HKO",
  );
});

test("includes critical-hit, Tera, weather, and terrain clauses", () => {
  assert.equal(
    describe({
      attacker,
      defender,
      move: electroDrift,
      attackerState: { ...attackerState, teraType: "Electric" },
      defenderState,
      field: createField({
        weather: "SunnyDay",
        terrain: "Electric Terrain",
        defenderSide: { lightScreen: true },
      }),
      critical: true,
    }),
    "32 SpA Choice Specs Miraidon Electro Drift vs. 32 HP / 0 SpD Calyrex-Ice on a critical hit in Electric Terrain in Sun Tera Electric: 274-324 (132.3 - 156.5%) -- guaranteed OHKO",
  );
});

test("prints non-zero stage prefixes and the actual offensive stat", () => {
  const bodyPressState = {
    ...attackerState,
    item: null,
    sp: { ...attackerState.sp, def: 32 },
    stages: { ...neutralStages, def: 2 },
  };

  assert.equal(
    describe({
      attacker,
      defender,
      move: bodyPress,
      attackerState: bodyPressState,
      defenderState: { ...defenderState, stages: { ...neutralStages, def: -1 } },
      field: createField({ defenderSide: { reflect: true } }),
    }),
    "+2 32 Def Miraidon Body Press vs. -1 32 HP / 0 Def Calyrex-Ice through Reflect: 54-64 (26 - 30.9%) -- guaranteed 4HKO",
  );
});

test("omits attacker items that did not modify this damage", () => {
  assert.equal(
    describe({
      attacker,
      defender,
      move: electroDrift,
      attackerState: { ...attackerState, item: { id: "choiceband", name: "Choice Band" } },
      defenderState,
      field: createField(),
    }),
    "32 SpA Miraidon Electro Drift vs. 32 HP / 0 SpD Calyrex-Ice: 70-84 (33.8 - 40.5%) -- guaranteed 3HKO",
  );
});

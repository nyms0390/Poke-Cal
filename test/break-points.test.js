import test from "node:test";
import assert from "node:assert/strict";

import { breakPoints, yourDamage } from "../src/data/break-points.js";
import { compareKoTiers } from "../src/data/bulk-points.js";
import { createSideState } from "../src/ui/battle-state.js";

const attacker = {
  id: "builder",
  name: "Builder",
  types: ["Normal"],
  baseStats: { hp: 80, atk: 80, def: 80, spa: 100, spd: 80, spe: 80 },
};
const defender = {
  id: "threat",
  name: "Threat",
  types: ["Normal"],
  baseStats: { hp: 100, atk: 80, def: 100, spa: 80, spd: 100, spe: 80 },
};
const physicalMove = {
  id: "strength",
  name: "Strength",
  type: "Normal",
  category: "Physical",
  basePower: 110,
  target: "normal",
};
const specialMove = {
  id: "hypervoice",
  name: "Hyper Voice",
  type: "Normal",
  category: "Special",
  basePower: 100,
  target: "normal",
};

function threat(item = null) {
  return {
    pokemon: defender,
    nature: "Hardy",
    ability: null,
    item,
    teraType: "",
    spPresets: {
      offense: { atk: 32, spa: 32 },
      bulk: { hp: 0, def: 0, spd: 0 },
    },
  };
}

function userState() {
  return createSideState(attacker, {
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null,
    item: null,
    moves: [physicalMove, specialMove],
  });
}

test("wraps the damage engine with the builder Pokémon on the attacker side", () => {
  const result = yourDamage(userState(), physicalMove, { threat: threat() });

  assert.equal(Number.isFinite(result.minPct), true);
  assert.equal(result.maxPct >= result.minPct, true);
  assert.match(result.koText, /(OHKO|2HKO|3HKO|4HKO|5HKO|not a KO)/);
});

test("records only minimal offensive SP values where the KO tier improves", () => {
  const state = userState();
  const scenario = { threat: threat() };
  const points = breakPoints(state, physicalMove, scenario)
    .filter(({ requiresPlusNature }) => !requiresPlusNature);

  assert.equal(points.length > 0, true);
  assert.deepEqual(points.map(({ sp }) => sp), [...points.map(({ sp }) => sp)].sort((a, b) => a - b));
  for (const point of points) {
    const before = yourDamage(withOffense(state, "atk", point.sp - 1), physicalMove, scenario);
    const atPoint = yourDamage(withOffense(state, "atk", point.sp), physicalMove, scenario);
    assert.equal(compareKoTiers(atPoint.koText, before.koText) > 0, true);
    assert.equal(point.achieves, atPoint.koText);
    assert.equal(point.minPct, atPoint.minPct);
    assert.equal(point.maxPct, atPoint.maxPct);
  }
});

test("adds a plus-nature variant when 32 SP cannot reach the next tier", () => {
  const state = userState();
  const scenario = { threat: threat() };
  const naturePoint = breakPoints(state, physicalMove, scenario)
    .find(({ requiresPlusNature }) => requiresPlusNature);

  assert.ok(naturePoint);
  const neutralMax = yourDamage(withOffense(state, "atk", 32), physicalMove, scenario);
  const plusAtPoint = yourDamage(
    { ...withOffense(state, "atk", naturePoint.sp), nature: "Adamant" },
    physicalMove,
    scenario,
  );
  const plusBefore = yourDamage(
    { ...withOffense(state, "atk", naturePoint.sp - 1), nature: "Adamant" },
    physicalMove,
    scenario,
  );
  assert.equal(compareKoTiers(plusAtPoint.koText, neutralMax.koText) > 0, true);
  assert.equal(compareKoTiers(plusAtPoint.koText, plusBefore.koText) > 0, true);
});

test("passes the threat's defensive item through to the damage engine", () => {
  const state = userState();
  const unvested = yourDamage(state, specialMove, { threat: threat() });
  const vested = yourDamage(state, specialMove, {
    threat: threat({ id: "assaultvest", name: "Assault Vest" }),
  });

  assert.equal(vested.maxPct < unvested.maxPct, true);
});

function withOffense(state, stat, sp) {
  return { ...state, sp: { ...state.sp, [stat]: sp } };
}

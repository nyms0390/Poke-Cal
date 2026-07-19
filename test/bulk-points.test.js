import test from "node:test";
import assert from "node:assert/strict";

import {
  bulkPointMatchups,
  bulkPoints,
  compareKoTiers,
  threatDamage,
} from "../src/data/bulk-points.js";
import { createSideState } from "../src/ui/battle-state.js";

const defender = {
  id: "defender",
  name: "Defender",
  types: ["Normal"],
  baseStats: { hp: 100, atk: 80, def: 85, spa: 80, spd: 80, spe: 80 },
};
const attacker = {
  id: "attacker",
  name: "Attacker",
  types: ["Normal"],
  baseStats: { hp: 90, atk: 115, def: 80, spa: 120, spd: 80, spe: 90 },
};
const physicalMove = {
  id: "megapunch",
  name: "Mega Punch",
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
const ohkoMove = {
  ...physicalMove,
  id: "giga-impact",
  name: "Giga Impact",
  basePower: 200,
};

const threat = {
  pokemon: attacker,
  nature: "Hardy",
  ability: null,
  item: null,
  teraType: "",
  spPresets: {
    offense: { atk: 32, spa: 32 },
    bulk: { hp: 0, def: 0, spd: 0 },
  },
};

function userState(item = null) {
  return createSideState(defender, {
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null,
    item,
    moves: [],
  });
}

test("orders KO tiers from no KO through guaranteed OHKO", () => {
  const ordered = [
    "not a KO within 5 hits",
    "25.0% chance to 5HKO",
    "guaranteed 5HKO",
    "1.0% chance to 4HKO",
    "guaranteed 2HKO",
    "1.0% chance to OHKO",
    "50.0% chance to OHKO",
    "guaranteed OHKO",
  ];

  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(compareKoTiers(ordered[index], ordered[index - 1]) > 0, true);
  }
});

test("wraps the damage engine with the threat on the attacker side", () => {
  const result = threatDamage(userState(), { threat, move: physicalMove });

  assert.equal(Number.isFinite(result.minPct), true);
  assert.equal(result.maxPct >= result.minPct, true);
  assert.match(result.koText, /(OHKO|2HKO|3HKO|4HKO|5HKO|not a KO)/);
});

test("more HP and relevant defense SP never increases incoming damage percent", () => {
  const scenario = { threat, move: specialMove };
  let previous = Infinity;
  for (let sp = 0; sp <= 32; sp += 1) {
    const state = userState();
    state.sp = { ...state.sp, hp: sp, spd: sp };
    const { maxPct } = threatDamage(state, scenario);
    assert.equal(maxPct <= previous, true, `${sp} SP should not increase ${previous}%`);
    previous = maxPct;
  }
});

test("returns only frontier points whose tier is unreachable more cheaply", () => {
  const state = userState();
  const scenario = { threat, move: physicalMove };
  const points = bulkPoints(state, scenario);

  assert.equal(points.length > 0, true);
  assert.deepEqual(points.map(({ totalSp }) => totalSp), [...points.map(({ totalSp }) => totalSp)].sort((a, b) => a - b));
  for (const point of points) {
    const pointState = withBulk(state, point.hpSp, point.defSp, "def");
    const pointTier = threatDamage(pointState, scenario).koText;
    for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
      for (let defSp = 0; defSp <= 32; defSp += 1) {
        if (hpSp + defSp >= point.totalSp) continue;
        const cheaperTier = threatDamage(withBulk(state, hpSp, defSp, "def"), scenario).koText;
        assert.equal(compareKoTiers(cheaperTier, pointTier) > 0, true);
      }
    }
  }
});

test("shows the cheapest spread that changes an OHKO into guaranteed survival", () => {
  const state = userState();
  const scenario = { threat, move: ohkoMove };
  const points = bulkPoints(state, scenario);

  assert.deepEqual(points, [{
    hpSp: 0,
    defSp: 23,
    totalSp: 23,
    fromKoText: "guaranteed OHKO",
    achieves: "survives 1 hit (guaranteed) · guaranteed 2HKO",
    koText: "guaranteed 2HKO",
    maxPct: 99.4,
  }]);

  for (let hpSp = 0; hpSp <= 32; hpSp += 1) {
    for (let defSp = 0; defSp <= 32; defSp += 1) {
      if (hpSp + defSp >= points[0].totalSp) continue;
      assert.match(threatDamage(withBulk(state, hpSp, defSp, "def"), scenario).koText, /OHKO/);
    }
  }
});

test("never replaces already assigned defensive SP with a lower value", () => {
  const state = withBulk(userState(), 5, 7, "def");
  const points = bulkPoints(state, { threat, move: ohkoMove });

  assert.equal(points.length > 0, true);
  for (const point of points) {
    assert.equal(point.hpSp >= state.sp.hp, true);
    assert.equal(point.defSp >= state.sp.def, true);
    assert.equal(point.totalSp > state.sp.hp + state.sp.def, true);
  }
});

test("keeps supported matchups without a reachable bulk spread", () => {
  const state = userState();
  const matchups = bulkPointMatchups(state, [{
    ...threat,
    moves: [physicalMove, ohkoMove],
  }], { budget: 24 });

  assert.equal(matchups.length, 2);
  assert.deepEqual(
    matchups.find(({ scenario }) => scenario.move === ohkoMove).points.map(({ totalSp }) => totalSp),
    [23],
  );
  assert.deepEqual(
    matchups.find(({ scenario }) => scenario.move === physicalMove).points,
    [],
  );
});

test("passes the user's defensive item through to the damage engine", () => {
  const scenario = { threat, move: specialMove };
  const unvested = threatDamage(userState(), scenario);
  const vested = threatDamage(userState({ id: "assaultvest", name: "Assault Vest" }), scenario);

  assert.equal(vested.maxPct < unvested.maxPct, true);
});

function withBulk(state, hpSp, defenseSp, defenseStat) {
  return {
    ...state,
    sp: { ...state.sp, hp: hpSp, [defenseStat]: defenseSp },
  };
}

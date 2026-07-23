import test from "node:test";
import assert from "node:assert/strict";

import {
  breakPoints,
  rankBreakPointPokemonGroups,
  yourDamage,
} from "../src/data/break-points.js";
import { compareKoTiers } from "../src/data/bulk-points.js";
import { createField } from "../src/engine/field.js";
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
const weatherBall = {
  id: "weatherball",
  name: "Weather Ball",
  type: "Normal",
  category: "Special",
  basePower: 50,
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

test("ranks moves within each Pokémon by maximum damage percentage", () => {
  const higherDamage = breakAnalysis("guaranteed 3HKO", [
    { sp: 20, achieves: "guaranteed 2HKO" },
  ], 70);
  const lowerDamageBetterBreak = breakAnalysis("guaranteed 2HKO", [
    { sp: 1, achieves: "guaranteed OHKO" },
  ], 60);

  const [ranked] = rankBreakPointPokemonGroups([
    { id: "mixed", analyses: [lowerDamageBetterBreak, higherDamage] },
  ]);

  assert.deepEqual(ranked.analyses, [higherDamage, lowerDamageBetterBreak]);
});

test("ranks the highest-damage move by transition tier then minimum SP", () => {
  const groups = [
    {
      id: "better-secondary-only",
      analyses: [
        breakAnalysis("guaranteed 3HKO", [
          { sp: 10, achieves: "guaranteed 2HKO" },
        ], 90),
        breakAnalysis("guaranteed 2HKO", [
          { sp: 1, achieves: "guaranteed OHKO" },
        ], 80),
      ],
    },
    {
      id: "best-top-move",
      analyses: [breakAnalysis("30.0% chance to 2HKO", [
        { sp: 5, achieves: "guaranteed OHKO" },
      ], 70)],
    },
    {
      id: "costlier-top-move",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 7, achieves: "guaranteed OHKO" },
      ], 75)],
    },
    {
      id: "unreachable-top-move",
      analyses: [breakAnalysis("50.0% chance to 2HKO", [
        { sp: 1, achieves: "50.0% chance to OHKO" },
      ], 65)],
    },
  ];

  const ranked = rankBreakPointPokemonGroups(groups);

  assert.deepEqual(
    ranked.map(({ id }) => id),
    ["best-top-move", "costlier-top-move", "better-secondary-only", "unreachable-top-move"],
  );
});

test("ranks a Mega-family stack from the strongest move across every form", () => {
  const groups = [
    {
      id: "other-family",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 2, achieves: "guaranteed OHKO" },
      ], 90)],
    },
    {
      id: "base-and-mega",
      analyses: [
        breakAnalysis("guaranteed 2HKO", [
          { sp: 20, achieves: "guaranteed OHKO" },
        ], 70),
        breakAnalysis("guaranteed 3HKO", [
          { sp: 24, achieves: "guaranteed 2HKO" },
        ], 95),
      ],
    },
  ];

  assert.deepEqual(
    rankBreakPointPokemonGroups(groups).map(({ id }) => id),
    ["other-family", "base-and-mega"],
  );
});

test("uses breakpoint cost to order equal-damage Pokémon", () => {
  const groups = [
    {
      id: "costly",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 20, achieves: "guaranteed OHKO" },
      ], 90)],
    },
    {
      id: "cheap",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 4, achieves: "guaranteed OHKO" },
      ], 90)],
    },
  ];

  assert.deepEqual(
    rankBreakPointPokemonGroups(groups).map(({ id }) => id),
    ["cheap", "costly"],
  );
});

test("prioritizes a possible OHKO transition before a 2HKO transition", () => {
  const groups = [
    {
      id: "two-hko-transition",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 1, achieves: "guaranteed OHKO" },
      ], 90)],
    },
    {
      id: "possible-ohko-transition",
      analyses: [breakAnalysis("62.5% chance to OHKO", [
        { sp: 20, achieves: "guaranteed OHKO" },
      ], 100)],
    },
  ];

  assert.deepEqual(
    rankBreakPointPokemonGroups(groups).map(({ id }) => id),
    ["possible-ohko-transition", "two-hko-transition"],
  );
});

test("uses the first move when maximum damage percentages tie", () => {
  const groups = [
    {
      id: "mixed-top-ties",
      analyses: [
        breakAnalysis("guaranteed 3HKO", [
          { sp: 1, achieves: "guaranteed 2HKO" },
        ], 100),
        breakAnalysis("guaranteed 3HKO", [
          { sp: 20, achieves: "guaranteed OHKO" },
        ], 100),
      ],
    },
    {
      id: "single-ohko",
      analyses: [breakAnalysis("guaranteed 3HKO", [
        { sp: 5, achieves: "guaranteed OHKO" },
      ], 100)],
    },
  ];

  assert.deepEqual(
    rankBreakPointPokemonGroups(groups).map(({ id }) => id),
    ["mixed-top-ties", "single-ohko"],
  );
});

test("does not treat an already guaranteed OHKO as a breakpoint", () => {
  const groups = [
    {
      id: "needs-sp",
      analyses: [breakAnalysis("guaranteed 2HKO", [
        { sp: 20, achieves: "guaranteed OHKO" },
      ], 100)],
    },
    {
      id: "already-ohko",
      analyses: [breakAnalysis("guaranteed OHKO", [], 100)],
    },
  ];

  assert.deepEqual(
    rankBreakPointPokemonGroups(groups).map(({ id }) => id),
    ["needs-sp", "already-ohko"],
  );
});

test("ranks a possible OHKO by the SP needed to make it guaranteed", () => {
  const groups = [
    {
      id: "already-guaranteed",
      analyses: [breakAnalysis("guaranteed OHKO", [], 90)],
    },
    {
      id: "guaranteed-at-ten",
      analyses: [breakAnalysis("62.5% chance to OHKO", [
        { sp: 10, achieves: "guaranteed OHKO" },
      ], 110.8)],
    },
  ];

  const ranked = rankBreakPointPokemonGroups(groups);

  assert.deepEqual(ranked.map(({ id }) => id), [
    "guaranteed-at-ten",
    "already-guaranteed",
  ]);
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

test("never lowers assigned offensive SP for a plus-nature threshold", () => {
  const state = withOffense(userState(), "atk", 31);
  const points = breakPoints(state, physicalMove, { threat: threat() });

  assert.equal(points.length > 0, true);
  assert.equal(points.every(({ sp }) => sp >= state.sp.atk), true);
});

test("passes the threat's defensive item through to the damage engine", () => {
  const state = userState();
  const unvested = yourDamage(state, specialMove, { threat: threat() });
  const vested = yourDamage(state, specialMove, {
    threat: threat({ id: "assaultvest", name: "Assault Vest" }),
  });

  assert.equal(vested.maxPct < unvested.maxPct, true);
});

test("uses the selected ambient field throughout Weather Ball break-point searches", () => {
  const state = userState();
  const neutralScenario = { threat: threat() };
  const sunnyScenario = {
    threat: threat(),
    field: createField({ weather: "SunnyDay" }),
  };
  const neutral = yourDamage(state, weatherBall, neutralScenario);
  const sunny = yourDamage(state, weatherBall, sunnyScenario);
  const points = breakPoints(state, weatherBall, sunnyScenario)
    .filter(({ requiresPlusNature }) => !requiresPlusNature);

  assert.equal(sunny.maxPct > neutral.maxPct, true);
  for (const point of points) {
    const damage = yourDamage(
      withOffense(state, "spa", point.sp),
      weatherBall,
      sunnyScenario,
    );
    assert.equal(point.achieves, damage.koText);
    assert.equal(point.maxPct, damage.maxPct);
  }
});

function withOffense(state, stat, sp) {
  return { ...state, sp: { ...state.sp, [stat]: sp } };
}

function breakAnalysis(koText, points, maxPct) {
  return { damage: { koText, maxPct }, points };
}

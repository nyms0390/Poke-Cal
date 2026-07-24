import test from "node:test";
import assert from "node:assert/strict";

import {
  bulkCoverage,
  bulkPointMatchups,
  bulkPoints,
  compareKoTiers,
  koHitCount,
  rankBulkCoverageGroups,
  threatDamage,
  zeroBulkState,
} from "../src/data/bulk-points.js";
import { createField } from "../src/engine/field.js";
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
const weatherBall = {
  id: "weatherball",
  name: "Weather Ball",
  type: "Normal",
  category: "Special",
  basePower: 50,
  target: "normal",
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

test("zeros only defensive SP without mutating the current state", () => {
  const state = {
    ...userState({ id: "assaultvest", name: "Assault Vest" }),
    nature: "Careful",
    sp: { hp: 12, atk: 7, def: 8, spa: 9, spd: 10, spe: 11 },
    stages: { atk: 1, def: 2, spa: -1, spd: 3, spe: 0 },
    teraType: "Steel",
    status: "par",
  };
  const baseline = zeroBulkState(state);

  assert.deepEqual(baseline.sp, { hp: 0, atk: 7, def: 0, spa: 9, spd: 0, spe: 11 });
  assert.equal(baseline.nature, "Careful");
  assert.equal(baseline.item, state.item);
  assert.equal(baseline.stages, state.stages);
  assert.equal(baseline.teraType, "Steel");
  assert.equal(baseline.status, "par");
  assert.deepEqual(state.sp, { hp: 12, atk: 7, def: 8, spa: 9, spd: 10, spe: 11 });
});

test("targets the next modeled KO tier from every non-terminal origin", () => {
  const tiers = [
    ["guaranteed OHKO", 1, 2],
    ["guaranteed 2HKO", 2, 3],
    ["guaranteed 3HKO", 3, 4],
    ["guaranteed 4HKO", 4, 5],
    ["guaranteed 5HKO", 5, 6],
  ];

  for (const [koText, originHits, targetHits] of tiers) {
    const coverage = bulkCoverage(userState(), [coverageMatchup(physicalMove, koText)], {
      budget: 0,
    });
    assert.equal(coverage.originHits, originHits);
    assert.equal(coverage.targetHits, targetHits);
  }
});

test("treats a terminal zero-bulk tier as covered at zero required SP", () => {
  const coverage = bulkCoverage(
    userState(),
    [coverageMatchup(physicalMove, "not a KO within 5 hits")],
    { budget: 0 },
  );

  assert.deepEqual(coverage, {
    status: "covered",
    originHits: 6,
    targetHits: 6,
    currentHits: 6,
    requiredSp: 0,
  });
});

test("requires every form's constraining matchup to reach the family target", () => {
  const physicalThreat = {
    ...threat,
    pokemon: { ...attacker, id: "attacker", name: "Attacker" },
    moves: [ohkoMove],
  };
  const specialThreat = {
    ...threat,
    pokemon: { ...attacker, id: "attackermega", name: "Attacker-Mega" },
    moves: [{ ...ohkoMove, id: "mega-wave", name: "Mega Wave", category: "Special" }],
  };
  const physicalOnly = withDefensiveSp(userState(), { def: 23 });
  const partialMatchups = bulkPointMatchups(
    physicalOnly,
    [physicalThreat, specialThreat],
    { budget: 66 },
  );

  assert.equal(
    partialMatchups.find(({ scenario }) => scenario.move.category === "Physical").covered,
    true,
  );
  assert.equal(
    partialMatchups.find(({ scenario }) => scenario.move.category === "Special").covered,
    false,
  );
  assert.notEqual(
    bulkCoverage(physicalOnly, partialMatchups, { budget: 66 }).status,
    "covered",
  );

  const coveringState = withDefensiveSp(userState(), { hp: 28, def: 5, spd: 13 });
  const coveredMatchups = bulkPointMatchups(
    coveringState,
    [physicalThreat, specialThreat],
    { budget: 66 },
  );
  assert.equal(bulkCoverage(coveringState, coveredMatchups, { budget: 66 }).status, "covered");
});

test("distinguishes independent thresholds from one legal joint allocation", () => {
  const moves = [
    ohkoMove,
    { ...ohkoMove, id: "special-impact", name: "Special Impact", category: "Special" },
  ];
  const matchups = bulkPointMatchups(userState(), [{ ...threat, moves }], { budget: 32 });

  assert.deepEqual(
    matchups
      .map(({ baselinePoints }) => baselinePoints[0].totalSp)
      .sort((left, right) => left - right),
    [23, 32],
  );
  assert.deepEqual(bulkCoverage(userState(), matchups, { budget: 32 }), {
    status: "unreachable",
    originHits: 1,
    targetHits: 2,
    currentHits: 1,
    requiredSp: Infinity,
  });

  const possible = bulkCoverage(userState(), matchups, { budget: 46 });
  assert.equal(possible.status, "possible");
  assert.equal(possible.requiredSp, 46);

  const coveringState = withDefensiveSp(userState(), { hp: 28, def: 5, spd: 13 });
  const coveredMatchups = bulkPointMatchups(
    coveringState,
    [{ ...threat, moves }],
    { budget: 46 },
  );
  assert.deepEqual(bulkCoverage(coveringState, coveredMatchups, { budget: 46 }), {
    status: "covered",
    originHits: 1,
    targetHits: 2,
    currentHits: 2,
    requiredSp: 46,
  });
});

test("matches a brute-force reference minimum over legal joint defensive spreads", () => {
  const moves = [
    ohkoMove,
    { ...ohkoMove, id: "special-impact", name: "Special Impact", category: "Special" },
  ];
  const state = userState();
  const matchups = bulkPointMatchups(state, [{ ...threat, moves }], { budget: 66 });
  const coverage = bulkCoverage(state, matchups, { budget: 66 });

  assert.equal(
    coverage.requiredSp,
    bruteForceRequiredSp(state, matchups, coverage.targetHits, 66),
  );
});

test("ranks coverage by origin tier and joint SP while preserving complete ties", () => {
  const groups = [
    coverageGroup("two-unreachable", 2, Infinity),
    coverageGroup("terminal", 6, 0),
    coverageGroup("ohko-costly", 1, 20),
    coverageGroup("four", 4, 3),
    coverageGroup("ohko-tie-a", 1, 4),
    coverageGroup("five", 5, 1),
    coverageGroup("ohko-unreachable", 1, Infinity),
    coverageGroup("three", 3, 7),
    coverageGroup("ohko-tie-b", 1, 4),
    coverageGroup("two-cheap", 2, 2),
  ];

  assert.deepEqual(
    rankBulkCoverageGroups(groups).map(({ id }) => id),
    [
      "ohko-tie-a",
      "ohko-tie-b",
      "ohko-costly",
      "ohko-unreachable",
      "two-cheap",
      "two-unreachable",
      "three",
      "four",
      "five",
      "terminal",
    ],
  );
});

test("marks a move covered only when its exact KO hit count improves", () => {
  const coveredState = withDefensiveSp(userState(), { def: 23 });
  const [covered] = bulkPointMatchups(
    coveredState,
    [{ ...threat, moves: [ohkoMove] }],
    { budget: 66 },
  );
  assert.equal(covered.covered, true);
  assert.equal(koHitCount(covered.baselineDamage.koText), 1);
  assert.equal(koHitCount(covered.damage.koText), 2);

  const sameTierState = withDefensiveSp(userState(), { def: 1 });
  const [sameTier] = bulkPointMatchups(
    sameTierState,
    [{ ...threat, moves: [ohkoMove] }],
    { budget: 66 },
  );
  assert.notEqual(sameTier.damage.maxPct, sameTier.baselineDamage.maxPct);
  assert.equal(koHitCount(sameTier.damage.koText), koHitCount(sameTier.baselineDamage.koText));
  assert.equal(sameTier.covered, false);
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

test("uses the selected ambient field for threat damage and every bulk matchup", () => {
  const weatherThreat = { ...threat, moves: [weatherBall] };
  const scenario = { threat: weatherThreat, move: weatherBall };
  const sunnyField = createField({ weather: "SunnyDay" });
  const neutral = threatDamage(userState(), scenario);
  const sunny = threatDamage(userState(), { ...scenario, field: sunnyField });
  const [matchup] = bulkPointMatchups(userState(), [weatherThreat], {
    budget: 0,
    field: sunnyField,
  });

  assert.equal(sunny.maxPct > neutral.maxPct, true);
  assert.deepEqual(matchup.damage, sunny);
  assert.equal(matchup.scenario.field, sunnyField);
});

function withBulk(state, hpSp, defenseSp, defenseStat) {
  return {
    ...state,
    sp: { ...state.sp, hp: hpSp, [defenseStat]: defenseSp },
  };
}

function withDefensiveSp(state, { hp = 0, def = 0, spd = 0 }) {
  return {
    ...state,
    sp: { ...state.sp, hp, def, spd },
  };
}

function coverageMatchup(move, koText) {
  const damage = { minPct: 10, maxPct: 20, koText };
  return {
    scenario: { threat, move },
    baselineDamage: damage,
    baselinePoints: [],
    damage,
    points: [],
    covered: false,
  };
}

function coverageGroup(id, originHits, requiredSp) {
  return {
    id,
    coverage: {
      status: Number.isFinite(requiredSp) ? "possible" : "unreachable",
      originHits,
      targetHits: Math.min(6, originHits + 1),
      currentHits: originHits,
      requiredSp,
    },
  };
}

function bruteForceRequiredSp(state, matchups, targetHits, budget) {
  for (let totalSp = 0; totalSp <= budget; totalSp += 1) {
    for (let hp = 0; hp <= 32; hp += 1) {
      for (let def = 0; def <= 32; def += 1) {
        const spd = totalSp - hp - def;
        if (spd < 0 || spd > 32) continue;
        const candidate = withDefensiveSp(state, { hp, def, spd });
        if (matchups.every(({ scenario }) =>
          koHitCount(threatDamage(candidate, scenario).koText) >= targetHits)) {
          return totalSp;
        }
      }
    }
  }
  return Infinity;
}

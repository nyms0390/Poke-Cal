import test from "node:test";
import assert from "node:assert/strict";

import { breakPoints, yourDamage, yourDamageAnalysis } from "../src/data/break-points.js";
import { createSideState } from "../src/ui/battle-state.js";

import {
  applyGlobalThreatStatus,
  applyThreatControl,
  availableBulkSpBudget,
  breakCoverage,
  canApplySpTargets,
  createBuilderState,
  detachFamilyForms,
  finalStats,
  normalizeThreatCount,
  partitionBulkCoverageGroups,
  selectBuilderAnalysis,
  selectBuilderSort,
  significantBreakPoints,
} from "../src/ui/builder-state.js";

const pikachu = {
  id: "pikachu",
  name: "Pikachu",
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
};

const usageDefaults = {
  nature: "Timid",
  sp: { hp: 0, atk: 0, def: 4, spa: 32, spd: 0, spe: 32 },
  ability: { id: "static", name: "Static" },
  item: { id: "lightball", name: "Light Ball" },
  teraType: "Electric",
  moves: [
    { id: "thunderbolt", name: "Thunderbolt" },
    { id: "voltswitch", name: "Volt Switch" },
    { id: "protect", name: "Protect" },
    { id: "nastyplot", name: "Nasty Plot" },
  ],
};

const threat = {
  pokemon: { id: "charizard", name: "Charizard" },
  nature: "Timid",
  ability: { id: "blaze", name: "Blaze" },
  item: { id: "lifeorb", name: "Life Orb" },
  teraType: "",
  moves: [
    { id: "heatwave", name: "Heat Wave" },
    { id: "airslash", name: "Air Slash" },
  ],
  spPresets: {
    offense: { atk: 32, spa: 32 },
    bulk: { hp: 2, def: 0, spd: 0 },
  },
};

test("creates an empty builder with the default threat count", () => {
  assert.deepEqual(createBuilderState(), {
    user: null,
    field: {
      format: "doubles",
      weather: "",
      terrain: "",
      gravity: false,
    },
    threatCount: 20,
    threatStatus: "",
    analysisTab: "bulk",
    analysisSort: "breakpoint",
  });
});

test("selects only supported builder analysis tabs", () => {
  const state = createBuilderState();
  const selected = selectBuilderAnalysis(state, "break");

  assert.equal(selected.analysisTab, "break");
  assert.equal(selectBuilderAnalysis(selected, "unknown"), selected);
});

test("selects only supported Pokémon sorting methods", () => {
  const state = createBuilderState();
  const selected = selectBuilderSort(state, "default");

  assert.equal(selected.analysisSort, "default");
  assert.equal(selectBuilderSort(selected, "breakpoint").analysisSort, "breakpoint");
  assert.equal(selectBuilderSort(selected, "unknown"), selected);
});

test("normalizes an editable threat count to a whole number from zero through fifty", () => {
  assert.equal(normalizeThreatCount("12.9"), 12);
  assert.equal(normalizeThreatCount(-3), 0);
  assert.equal(normalizeThreatCount(80), 50);
  assert.equal(normalizeThreatCount(""), 20);
  assert.equal(normalizeThreatCount("not a number"), 20);
});

test("applies editable threat build controls immutably", () => {
  const ability = { id: "solarpower", name: "Solar Power" };
  const item = { id: "choicespecs", name: "Choice Specs" };
  const move = { id: "overheat", name: "Overheat" };

  let edited = applyThreatControl(threat, { kind: "nature", value: "Modest" });
  edited = applyThreatControl(edited, { kind: "ability", value: ability });
  edited = applyThreatControl(edited, { kind: "item", value: item });
  assert.equal(applyThreatControl(edited, { kind: "teraType", value: "Fire" }), edited);
  edited = applyThreatControl(edited, { kind: "sp", stat: "hp", value: "80" });
  edited = applyThreatControl(edited, { kind: "sp", stat: "spa", value: "18.9" });
  edited = applyThreatControl(edited, { kind: "move", index: 1, value: move });

  assert.equal(edited.nature, "Modest");
  assert.equal(edited.ability, ability);
  assert.equal(edited.item, item);
  assert.equal(edited.teraType, "");
  assert.deepEqual(edited.spPresets.bulk, { hp: 32, def: 0, spd: 0 });
  assert.deepEqual(edited.spPresets.offense, { atk: 32, spa: 18 });
  assert.deepEqual(edited.moves, [threat.moves[0], move]);
  assert.equal(threat.nature, "Timid");
  assert.deepEqual(threat.spPresets.bulk, { hp: 2, def: 0, spd: 0 });
  assert.equal(threat.moves[1].id, "airslash");
});

test("applies one global threat status to every threat immutably", () => {
  const secondThreat = { ...threat, pokemon: { id: "blastoise", name: "Blastoise" } };
  const threats = [threat, secondThreat];
  const soaked = applyGlobalThreatStatus(threats, "soak");

  assert.deepEqual(soaked.map(({ status, soaked: isSoaked }) => [status, isSoaked]), [
    ["", true],
    ["", true],
  ]);
  assert.notEqual(soaked[0], threat);
  assert.equal(threat.status, undefined);
  assert.equal(threat.soaked, undefined);

  const burned = applyGlobalThreatStatus(soaked, "burn");
  assert.deepEqual(burned.map(({ status, soaked: isSoaked }) => [status, isSoaked]), [
    ["burn", false],
    ["burn", false],
  ]);
  assert.deepEqual(soaked.map(({ status, soaked: isSoaked }) => [status, isSoaked]), [
    ["", true],
    ["", true],
  ]);
});

test("ignores unsupported threat build controls and stat keys", () => {
  assert.equal(applyThreatControl(threat, { kind: "unknown", value: true }), threat);
  assert.equal(applyThreatControl(threat, { kind: "sp", stat: "spe", value: 32 }), threat);
  assert.equal(applyThreatControl(threat, { kind: "move", index: 8, value: threat.moves[0] }), threat);
});

test("creates one canonical side state without activating the usage-backed Tera type", () => {
  const state = createBuilderState(pikachu, usageDefaults, {
    threatCount: 12,
    threatStatus: "soak",
    analysisTab: "break",
    analysisSort: "default",
    field: { weather: "SunnyDay", gravity: true },
  });

  assert.equal(state.user.pokemon, pikachu);
  assert.equal(state.user.nature, "Timid");
  assert.deepEqual(state.user.sp, usageDefaults.sp);
  assert.equal(state.user.teraType, "");
  assert.deepEqual(state.user.selectedMoveIds, [
    "thunderbolt",
    "voltswitch",
    "protect",
    "nastyplot",
  ]);
  assert.equal(state.threatCount, 12);
  assert.equal(state.threatStatus, "soak");
  assert.equal(state.analysisTab, "break");
  assert.equal(state.analysisSort, "default");
  assert.deepEqual(state.field, {
    format: "doubles",
    weather: "SunnyDay",
    terrain: "",
    gravity: true,
  });
});

test("calculates all six final level-50 stats without mutating builder state", () => {
  const state = createBuilderState(pikachu, usageDefaults);

  assert.deepEqual(finalStats(state), {
    hp: 110,
    atk: 67,
    def: 64,
    spa: 102,
    spd: 70,
    spe: 156,
  });
  assert.deepEqual(state.user.sp, usageDefaults.sp);
  assert.equal(finalStats(createBuilderState()), null);
});

test("applies battle stages to the builder final-stat table", () => {
  const state = createBuilderState(pikachu, usageDefaults);
  state.user.stages = { ...state.user.stages, spa: 2, spe: -1 };

  assert.deepEqual(finalStats(state), {
    hp: 110,
    atk: 67,
    def: 64,
    spa: 204,
    spd: 70,
    spe: 104,
  });
});

test("checks whether a recommended SP allocation fits the 66-point budget", () => {
  const sp = { hp: 4, atk: 20, def: 0, spa: 8, spd: 0, spe: 20 };

  assert.equal(canApplySpTargets(sp, { atk: 32, def: 2 }), true);
  assert.equal(canApplySpTargets(sp, { atk: 32, def: 3 }), false);
});

test("replaces the defensive allocation within the remaining total-SP budget", () => {
  assert.equal(availableBulkSpBudget({
    hp: 32,
    atk: 15,
    def: 31,
    spa: 16,
    spd: 30,
    spe: 17,
  }), 18);
  assert.equal(availableBulkSpBudget({ atk: 32, spa: 32, spe: 32 }), 0);
});

test("partitions ranked results into exactly one coverage section without reordering", () => {
  const groups = [
    { id: "possible-a", coverage: { status: "possible" } },
    { id: "covered-a", coverage: { status: "covered" } },
    { id: "possible-b", coverage: { status: "possible" } },
    { id: "unreachable-a", coverage: { status: "unreachable" } },
    { id: "covered-b", coverage: { status: "covered" } },
  ];

  const partitioned = partitionBulkCoverageGroups(groups);

  assert.deepEqual(partitioned.possible.map(({ id }) => id), ["possible-a", "possible-b"]);
  assert.deepEqual(partitioned.covered.map(({ id }) => id), ["covered-a", "covered-b"]);
  assert.deepEqual(partitioned.unreachable.map(({ id }) => id), ["unreachable-a"]);
  assert.equal(Object.values(partitioned).flat().length, groups.length);
});

test("detaches related forms so each form keeps its own coverage section", () => {
  const base = {
    threat: { pokemon: { id: "charizard", name: "Charizard" } },
    coverage: { status: "covered" },
  };
  const mega = {
    threat: { pokemon: { id: "charizardmegax", name: "Charizard-Mega-X" } },
    coverage: { status: "unreachable" },
  };

  const detached = detachFamilyForms([{
    familyId: "charizard",
    forms: [base, mega],
  }]);
  const partitioned = partitionBulkCoverageGroups(detached);

  assert.deepEqual(
    detached.map(({ threat: { pokemon } }) => pokemon.id),
    ["charizard", "charizardmegax"],
  );
  assert.deepEqual(
    detached[0].relatedForms.map(({ threat: { pokemon }, coverage }) =>
      [pokemon.id, coverage.status]),
    [
      ["charizard", "covered"],
      ["charizardmegax", "unreachable"],
    ],
  );
  assert.deepEqual(
    partitioned.covered.map(({ threat: { pokemon } }) => pokemon.id),
    ["charizard"],
  );
  assert.deepEqual(
    partitioned.unreachable.map(({ threat: { pokemon } }) => pokemon.id),
    ["charizardmegax"],
  );
});

test("keeps only meaningful break-point spread milestones", () => {
  const points = [
    { sp: 3, achieves: "100.0% chance to 4HKO" },
    { sp: 19, achieves: "58.0% chance to 3HKO", requiresPlusNature: true },
    { sp: 20, achieves: "0.1% chance to 3HKO" },
    { sp: 22, achieves: "0.5% chance to 3HKO" },
    { sp: 32, achieves: "guaranteed 3HKO" },
  ];

  assert.deepEqual(
    significantBreakPoints("99.5% chance to 4HKO", points),
    [points[1], points[2], points[4]],
  );
});

function breakAnalysis(move, koText, points = [], maxPct = 40) {
  return { move, damage: { koText, maxPct }, points };
}

test("only current guaranteed or chance-based OHKOs count as break coverage", () => {
  const physical = { category: "Physical" };
  const special = { category: "Special" };
  const state = { sp: {} };
  assert.deepEqual(breakCoverage(state, [
    breakAnalysis(physical, "guaranteed 3HKO"),
    breakAnalysis(special, "guaranteed 2HKO"),
  ]), { status: "unreachable" });
  for (const koText of ["guaranteed OHKO", "6.3% chance to OHKO"]) {
    assert.deepEqual(breakCoverage(state, [
      breakAnalysis(physical, "guaranteed 2HKO", [{ sp: 8, achieves: "guaranteed OHKO" }]),
      breakAnalysis(special, koText, [], 110),
    ]), { status: "covered" });
  }
});

for (const hits of [2, 3, 4, 5]) {
  for (const currentKoText of [`guaranteed ${hits}HKO`, `12.5% chance to ${hits}HKO`]) {
    test(`break coverage can improve ${currentKoText} to a guaranteed lower-hit tier`, () => {
      const achieves = hits === 2 ? "guaranteed OHKO" : `guaranteed ${hits - 1}HKO`;
      assert.deepEqual(breakCoverage({ sp: {} }, [
        breakAnalysis({ category: "Physical" }, currentKoText, [{ sp: 8, achieves }]),
      ]), { status: "possible" });
    });
  }
}

test("chance-based lower tiers and same-tier probability improvements are not possible coverage", () => {
  const move = { category: "Physical" };
  for (const [currentKoText, achieves] of [
    ["guaranteed 2HKO", "99.9% chance to OHKO"],
    ["guaranteed 3HKO", "100.0% chance to 2HKO"],
    ["12.5% chance to 3HKO", "guaranteed 3HKO"],
    ["12.5% chance to 3HKO", "99.9% chance to 3HKO"],
  ]) {
    assert.deepEqual(breakCoverage({ sp: {} }, [
      breakAnalysis(move, currentKoText, [{ sp: 8, achieves }]),
    ]), { status: "unreachable" });
  }
});

test("each selected move can make its own guaranteed tier improvement", () => {
  const physical = breakAnalysis({ category: "Physical" }, "guaranteed 2HKO");
  const special = breakAnalysis({ category: "Special" }, "guaranteed 3HKO", [
    { sp: 8, achieves: "guaranteed 2HKO" },
  ]);
  assert.deepEqual(breakCoverage({ sp: {} }, [physical, special]), { status: "possible" });
});

test("break coverage allows a guaranteed 5HKO improvement from no KO within five hits", () => {
  assert.deepEqual(breakCoverage({ sp: {} }, [
    breakAnalysis({ category: "Physical" }, "not a KO", [{ sp: 8, achieves: "guaranteed 5HKO" }]),
  ]), { status: "possible" });
});

test("break coverage allows affordable nature-changing guaranteed tier improvements", () => {
  assert.deepEqual(breakCoverage({ sp: { atk: 32, spe: 32 } }, [
    breakAnalysis({ category: "Physical" }, "guaranteed 2HKO", [
      { sp: 32, achieves: "guaranteed OHKO", requiresPlusNature: true },
    ]),
  ]), { status: "possible" });
});

test("break coverage respects the 66 SP budget and ignores unsupported damage", () => {
  const physical = { category: "Physical" };
  const special = { category: "Special" };
  const state = { sp: { hp: 32, atk: 0, def: 32, spa: 0, spd: 0, spe: 0 } };
  const analyses = [
    breakAnalysis(physical, "guaranteed OHKO", [{ sp: 1, achieves: "guaranteed OHKO" }], null),
    breakAnalysis(special, "guaranteed 3HKO", [{ sp: 3, achieves: "guaranteed 2HKO" }]),
  ];
  assert.deepEqual(breakCoverage(state, analyses), { status: "unreachable" });
  assert.deepEqual(breakCoverage(state, [
    analyses[0],
    { ...analyses[1], points: [{ sp: 2, achieves: "guaranteed 2HKO" }] },
  ]), { status: "possible" });
  assert.deepEqual(breakCoverage(state, [analyses[0]]), { status: "unreachable" });
  assert.deepEqual(breakCoverage(state, []), { status: "unreachable" });
});

test("unknown KO tiers cannot supply possible coverage", () => {
  const move = { category: "Physical" };
  assert.deepEqual(breakCoverage({ sp: {} }, [
    breakAnalysis(move, "Unsupported", [{ sp: 8, achieves: "guaranteed OHKO" }]),
    breakAnalysis(move, "guaranteed 2HKO", [{ sp: 8, achieves: "Unsupported" }]),
  ]), { status: "unreachable" });
});

test("a current Body Press 2HKO is not covered after improving from a zero-Defense 3HKO", () => {
  const attacker = {
    id: "body-press-user", types: ["Fighting"],
    baseStats: { hp: 80, atk: 80, def: 120, spa: 80, spd: 80, spe: 80 },
  };
  const defender = {
    id: "body-press-threat", types: ["Normal"],
    baseStats: { hp: 190, atk: 80, def: 100, spa: 80, spd: 80, spe: 80 },
  };
  const move = {
    id: "bodypress", type: "Fighting", category: "Physical", basePower: 80,
    target: "normal", overrideOffensiveStat: "def",
  };
  const state = createSideState(attacker, {
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 32, spa: 0, spd: 0, spe: 0 },
    ability: null, item: null, moves: [move],
  });
  const scenario = {
    threat: { pokemon: defender, nature: "Hardy", spPresets: { bulk: { hp: 0, def: 0, spd: 0 } } },
  };
  const current = yourDamage(state, move, scenario);
  const baseline = yourDamage({ ...state, sp: { ...state.sp, def: 0 } }, move, scenario);
  assert.match(current.koText, /2HKO/);
  assert.match(baseline.koText, /3HKO/);
  assert.deepEqual(breakCoverage(state, [
    { move, ...yourDamageAnalysis(state, move, scenario), points: breakPoints(state, move, scenario) },
  ]), { status: "unreachable" });
});

test("Body Press coverage budgets the actual Defense target", () => {
  const attacker = {
    id: "body-press-user", types: ["Fighting"],
    baseStats: { hp: 80, atk: 80, def: 120, spa: 80, spd: 80, spe: 80 },
  };
  const defender = {
    id: "body-press-threat", types: ["Normal"],
    baseStats: { hp: 188, atk: 80, def: 100, spa: 80, spd: 80, spe: 80 },
  };
  const move = {
    id: "bodypress", type: "Fighting", category: "Physical", basePower: 80,
    target: "normal", overrideOffensiveStat: "def",
  };
  const scenario = {
    threat: { pokemon: defender, nature: "Hardy", spPresets: { bulk: { hp: 0, def: 0, spd: 0 } } },
  };
  const state = createSideState(attacker, {
    nature: "Hardy",
    sp: { hp: 32, atk: 32, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null, item: null, moves: [move],
  });
  const detail = yourDamageAnalysis(state, move, scenario);
  const points = breakPoints(state, move, scenario);
  const guaranteedPoint = points.find(({ achieves }) => achieves === "guaranteed 2HKO");
  assert.equal(detail.attackStat, "def");
  assert.equal(detail.damage.koText, "guaranteed 3HKO");
  assert.ok(guaranteedPoint);
  assert.equal(canApplySpTargets(state.sp, { def: guaranteedPoint.sp }), false);
  assert.deepEqual(breakCoverage(state, [{ move, ...detail, points }]), { status: "unreachable" });
  const freed = { ...state, sp: { ...state.sp, hp: 0 } };
  assert.equal(canApplySpTargets(freed.sp, { def: guaranteedPoint.sp }), true);
  assert.deepEqual(breakCoverage(freed, [{ move, ...detail, points }]), { status: "possible" });
});

test("Tera Blast coverage budgets its actual Attack target and preserves damage summaries", () => {
  const attacker = {
    id: "tera-blast-user", types: ["Normal"],
    baseStats: { hp: 80, atk: 130, def: 80, spa: 50, spd: 80, spe: 80 },
  };
  const defender = {
    id: "tera-blast-threat", types: ["Normal"],
    baseStats: { hp: 90, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
  };
  const move = {
    id: "terablast", type: "Normal", category: "Special", basePower: 80,
  };
  const scenario = {
    threat: { pokemon: defender, nature: "Hardy", spPresets: { bulk: { hp: 0, def: 0, spd: 0 } } },
  };
  const analyze = (spa) => {
    const state = {
      ...createSideState(attacker, {
        nature: "Hardy",
        sp: { hp: 32, atk: 0, def: 2, spa, spd: 0, spe: 0 },
        ability: null, item: null, moves: [move],
      }),
      teraType: "Fighting",
    };
    const detail = yourDamageAnalysis(state, move, scenario);
    const points = breakPoints(state, move, scenario);
    return { state, detail, points, coverage: breakCoverage(state, [
      { move, ...detail, points },
    ]) };
  };
  const full = analyze(32);
  assert.equal(full.detail.attackStat, "atk");
  assert.deepEqual(full.detail.damage, yourDamage(full.state, move, scenario));
  assert.equal(full.detail.damage.koText, "guaranteed 2HKO");
  const guaranteedPoint = full.points.find(({ achieves, requiresPlusNature }) =>
    !requiresPlusNature && achieves === "guaranteed OHKO");
  assert.equal(guaranteedPoint.sp, 32);
  assert.equal(canApplySpTargets(full.state.sp, { atk: guaranteedPoint.sp }), false);
  assert.equal(full.coverage.status, "unreachable");

  const freed = analyze(0);
  assert.equal(freed.detail.attackStat, "atk");
  assert.equal(canApplySpTargets(freed.state.sp, { atk: guaranteedPoint.sp }), true);
  assert.equal(freed.coverage.status, "possible");
});

import test from "node:test";
import assert from "node:assert/strict";

import { yourDamage } from "../src/data/break-points.js";
import { threatDamage } from "../src/data/bulk-points.js";
import { calculateDamage } from "../src/engine/damage.js";
import { createField } from "../src/engine/field.js";
import { koChance, koText } from "../src/engine/ko-chance.js";
import { createSideState } from "../src/ui/battle-state.js";

const neutralStages = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const userPokemon = {
  id: "builder-user",
  name: "Builder User",
  types: ["Fire", "Psychic"],
  baseStats: { hp: 90, atk: 110, def: 85, spa: 125, spd: 95, spe: 90 },
};
const threatPokemon = {
  id: "usage-threat",
  name: "Usage Threat",
  types: ["Water", "Fairy"],
  baseStats: { hp: 100, atk: 120, def: 100, spa: 115, spd: 105, spe: 80 },
};

const CASES = [
  {
    name: "physical damage with asymmetric SP spreads",
    move: damagingMove("zenheadbutt", "Zen Headbutt", "Psychic", "Physical", 80),
    user: { nature: "Adamant", sp: { hp: 12, atk: 21, def: 8, spa: 0, spd: 6, spe: 17 } },
    threat: {
      nature: "Brave",
      spPresets: {
        offense: { atk: 27, spa: 3 },
        bulk: { hp: 14, def: 19, spd: 7 },
      },
    },
  },
  {
    name: "special damage in sun",
    move: damagingMove("flamethrower", "Flamethrower", "Fire", "Special", 90),
    user: { nature: "Modest", sp: { hp: 4, atk: 0, def: 9, spa: 28, spd: 11, spe: 14 } },
    threat: {
      nature: "Modest",
      spPresets: {
        offense: { atk: 0, spa: 32 },
        bulk: { hp: 20, def: 4, spd: 22 },
      },
    },
    field: createField({ weather: "SunnyDay" }),
  },
  {
    name: "ability and held-item modifiers",
    move: damagingMove("psychic", "Psychic", "Psychic", "Special", 90),
    user: {
      ability: { id: "adaptability", name: "Adaptability" },
      item: { id: "lifeorb", name: "Life Orb" },
      sp: { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 },
    },
    threat: {
      ability: { id: "filter", name: "Filter" },
      item: { id: "choicespecs", name: "Choice Specs" },
    },
  },
  {
    name: "active Tera types on both sides",
    move: damagingMove("flashcannon", "Flash Cannon", "Steel", "Special", 80),
    user: {
      teraType: "Steel",
      sp: { hp: 18, atk: 0, def: 10, spa: 25, spd: 16, spe: 8 },
    },
    threat: {
      teraType: "Steel",
      spPresets: {
        offense: { atk: 12, spa: 30 },
        bulk: { hp: 26, def: 13, spd: 20 },
      },
    },
  },
  {
    name: "user stage, burn, and Reflect",
    move: damagingMove("crunch", "Crunch", "Dark", "Physical", 80),
    user: {
      status: "burn",
      stages: { ...neutralStages, atk: 2 },
      currentHpFraction: 0.25,
      sp: { hp: 24, atk: 32, def: 5, spa: 0, spd: 5, spe: 0 },
    },
    threat: {
      nature: "Adamant",
      spPresets: {
        offense: { atk: 32, spa: 0 },
        bulk: { hp: 32, def: 24, spd: 6 },
      },
    },
    field: createField({ defenderSide: { reflect: true } }),
  },
];

test("builder damage wrappers match direct engine assembly for representative matchups", () => {
  assert.equal(CASES.length, 5);

  for (const fixture of CASES) {
    const userState = makeUserState(fixture.user);
    const threat = makeThreat(fixture.threat);
    const field = fixture.field ?? createField();
    const scenario = { threat, move: fixture.move, field };

    assert.deepEqual(
      threatDamage(userState, scenario),
      directSummary({
        attacker: threat.pokemon,
        defender: userState.pokemon,
        move: fixture.move,
        attackerState: directThreatOffenseState(threat),
        defenderState: { ...userState, currentHpFraction: 1 },
        field,
      }),
      `${fixture.name}: threatDamage`,
    );

    assert.deepEqual(
      yourDamage(userState, fixture.move, scenario),
      directSummary({
        attacker: userState.pokemon,
        defender: threat.pokemon,
        move: fixture.move,
        attackerState: { ...userState, currentHpFraction: 1 },
        defenderState: directThreatBulkState(threat),
        field,
      }),
      `${fixture.name}: yourDamage`,
    );
  }
});

function makeUserState(overrides = {}) {
  const state = createSideState(userPokemon, {
    nature: "Hardy",
    sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: null,
    item: null,
    moves: [],
  });
  return {
    ...state,
    ...overrides,
    sp: { ...state.sp, ...overrides.sp },
    stages: { ...state.stages, ...overrides.stages },
  };
}

function makeThreat(overrides = {}) {
  const defaults = {
    pokemon: threatPokemon,
    nature: "Hardy",
    ability: null,
    item: null,
    teraType: "",
    spPresets: {
      offense: { atk: 32, spa: 32 },
      bulk: { hp: 2, def: 0, spd: 0 },
    },
  };
  return {
    ...defaults,
    ...overrides,
    spPresets: {
      offense: { ...defaults.spPresets.offense, ...overrides.spPresets?.offense },
      bulk: { ...defaults.spPresets.bulk, ...overrides.spPresets?.bulk },
    },
  };
}

function directThreatOffenseState(threat) {
  return {
    pokemon: threat.pokemon,
    nature: threat.nature ?? "Hardy",
    sp: {
      hp: 0,
      atk: threat.spPresets?.offense?.atk ?? 32,
      def: 0,
      spa: threat.spPresets?.offense?.spa ?? 32,
      spd: 0,
      spe: 0,
    },
    stages: neutralStages,
    ability: threat.ability ?? null,
    item: threat.item ?? null,
    teraType: threat.teraType ?? "",
    status: "",
    currentHpFraction: 1,
    iceFaceIntact: true,
  };
}

function directThreatBulkState(threat) {
  return {
    pokemon: threat.pokemon,
    nature: threat.nature ?? "Hardy",
    sp: {
      hp: threat.spPresets?.bulk?.hp ?? 0,
      atk: 0,
      def: threat.spPresets?.bulk?.def ?? 0,
      spa: 0,
      spd: threat.spPresets?.bulk?.spd ?? 0,
      spe: 0,
    },
    stages: neutralStages,
    ability: threat.ability ?? null,
    item: threat.item ?? null,
    teraType: threat.teraType ?? "",
    status: "",
    currentHpFraction: 1,
    iceFaceIntact: true,
  };
}

function directSummary(input) {
  const result = calculateDamage(input);
  assert.equal(result.supported, true);
  return {
    minPct: result.minPercent,
    maxPct: result.maxPercent,
    koText: koText(koChance({
      rolls: result.rolls,
      targetHp: result.defenderCurrentHp,
    })),
  };
}

function damagingMove(id, name, type, category, basePower) {
  return { id, name, type, category, basePower, target: "normal" };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  availableHpEffects,
  hpNumberPlan,
  hpNumberRules,
  hpRuleMatches,
  hpRuleTarget,
} from "../src/data/hp-rules.js";

const rillaboom = {
  id: "rillaboom",
  name: "Rillaboom",
  types: ["Grass"],
  baseStats: { hp: 100, atk: 125, def: 90, spa: 60, spd: 70, spe: 85 },
};
const woodHammer = { id: "woodhammer", name: "Wood Hammer", flags: { contact: 1 } };
const grassyGlide = { id: "grassyglide", name: "Grassy Glide", flags: { contact: 1 } };
const fakeOut = { id: "fakeout", name: "Fake Out", flags: { contact: 1 } };
const protect = { id: "protect", name: "Protect", flags: {} };

function user(overrides = {}) {
  return {
    pokemon: rillaboom,
    nature: "Adamant",
    ability: { id: "grassysurge", name: "Grassy Surge" },
    item: null,
    sp: { hp: 0, atk: 32, def: 0, spa: 0, spd: 0, spe: 2 },
    ...overrides,
  };
}

const targets = (rules) => rules.map((rule) => `${rule.goal} ${hpRuleTarget(rule)}`);

test("writes HP number targets the way players do", () => {
  assert.equal(hpRuleTarget({ modulus: 16, remainder: 15 }), "16n − 1");
  assert.equal(hpRuleTarget({ modulus: 16, remainder: 0 }), "16n");
  assert.equal(hpRuleTarget({ modulus: 4, remainder: 1 }), "4n + 1");
  assert.equal(hpRuleMatches({ modulus: 10, remainder: 9 }, 179), true);
  assert.equal(hpRuleMatches({ modulus: 10, remainder: 9 }, 180), false);
});

test("reads HP number rules from the set's item, ability and moves", () => {
  assert.deepEqual(targets(hpNumberRules(user({ item: { id: "leftovers" } }))), ["heal 16n"]);
  assert.deepEqual(targets(hpNumberRules(user({ item: { id: "lifeorb" } }))), ["chip 10n − 1"]);
  assert.deepEqual(targets(hpNumberRules(user({ item: { id: "sitrusberry" } }))), ["heal 4n"]);
  assert.deepEqual(targets(hpNumberRules(user({ ability: { id: "regenerator" } }))), ["heal 3n"]);
  assert.deepEqual(
    targets(hpNumberRules(user({ item: { id: "sitrusberry" } }), { moves: [{ id: "bellydrum" }] })),
    ["halfCost 2n", "heal 4n"],
  );
  assert.deepEqual(
    targets(hpNumberRules(user({ item: { id: "sitrusberry" } }), { moves: [{ id: "substitute" }] })),
    ["substituteSitrus 4n"],
  );
  assert.deepEqual(targets(hpNumberRules(user(), { moves: [{ id: "substitute" }] })), ["substitute 4n + 1"]);
  assert.deepEqual(hpNumberRules(user()), []);
});

test("Magic Guard skips Life Orb and every chip effect", () => {
  const magicGuard = user({ item: { id: "lifeorb" }, ability: { id: "magicguard" } });
  assert.deepEqual(hpNumberRules(magicGuard, { moves: [fakeOut], effects: ["sand", "burn", "contact"] }), []);
  assert.deepEqual(availableHpEffects(magicGuard, [fakeOut]), ["grassy"]);
});

test("offers only the opponent effects that can reach the set", () => {
  assert.deepEqual(availableHpEffects(user(), [woodHammer, protect]), ["sand", "burn", "grassy", "contact"]);
  assert.deepEqual(availableHpEffects(user(), [protect]), ["sand", "burn", "grassy"]);
  const tyranitar = { ...rillaboom, types: ["Rock", "Dark"] };
  assert.deepEqual(availableHpEffects(user({ pokemon: tyranitar }), []), ["burn", "grassy"]);
  const flyer = { ...rillaboom, types: ["Fire", "Flying"] };
  assert.deepEqual(availableHpEffects(user({ pokemon: flyer, ability: { id: "sandveil" } }), []), ["burn"]);
});

test("merges chip effects that share a target and keeps the item first", () => {
  const rules = hpNumberRules(user({ item: { id: "lifeorb" } }), {
    moves: [woodHammer],
    effects: ["burn", "sand", "contact"],
  });
  assert.deepEqual(targets(rules), ["chip 10n − 1", "chip 16n − 1", "chip 8n − 1", "chip 6n − 1"]);
  assert.deepEqual(rules[1].sources, [
    { kind: "move", id: "sandstorm" },
    { kind: "status", id: "burn" },
  ]);
});

test("plans the closest fitting HP below and above the current HP", () => {
  // Rillaboom HP runs 175 (0 SP) to 207 (32 SP); 16n − 1 = 175, 191 and 207.
  const plan = hpNumberPlan(user({ sp: { ...user().sp, hp: 4 } }), {
    effects: ["sand"],
    unassignedSp: 10,
  });
  assert.equal(plan.hp, 179);
  assert.equal(plan.fits, false);
  assert.deepEqual(plan.below, { sp: 0, hp: 175 });
  assert.deepEqual(plan.above, { sp: 16, hp: 191, affordable: false });
  assert.equal(plan.matches(207), true);

  const fitting = hpNumberPlan(user({ sp: { ...user().sp, hp: 16 } }), { effects: ["sand"], unassignedSp: 16 });
  assert.equal(fitting.fits, true);
  assert.deepEqual(fitting.below, { sp: 16, hp: 191 });
  assert.deepEqual(fitting.above, { sp: 32, hp: 207, affordable: true });
});

test("drops a lower-priority rule that cannot share the HP range", () => {
  // Leftovers (16n) and sand (16n − 1) can never both hold; Leftovers wins.
  const plan = hpNumberPlan(user({ item: { id: "leftovers" } }), { effects: ["sand"] });
  assert.deepEqual(targets(plan.rules), ["heal 16n"]);
  assert.deepEqual(targets(plan.dropped), ["chip 16n − 1"]);

  // Rough Skin (8n − 1) and Rocky Helmet (6n − 1) combine into 24n − 1 = 191.
  const contact = hpNumberPlan(user(), { moves: [grassyGlide], effects: ["contact"] });
  assert.equal(contact.dropped.length, 0);
  assert.deepEqual(contact.below, null);
  assert.deepEqual(contact.above, { sp: 16, hp: 191, affordable: false });
});

test("has no plan targets without rules", () => {
  const plan = hpNumberPlan(user());
  assert.equal(plan.rules.length, 0);
  assert.equal(plan.fits, false);
  assert.equal(plan.matches, null);
  assert.equal(plan.below, null);
  assert.equal(plan.above, null);
});

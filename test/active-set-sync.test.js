import test from "node:test";
import assert from "node:assert/strict";

import { ACTIVE_SET_STORAGE_KEY, planActiveSetRefresh } from "../src/data/active-set.js";
import { watchActiveSet } from "../src/ui/active-set-sync.js";

const set = (overrides = {}) => ({
  pokemonId: "garchomp",
  nature: "Jolly",
  sp: { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 },
  abilityId: "roughskin",
  itemId: "lifeorb",
  moveIds: ["earthquake", "", "", ""],
  ...overrides,
});

test("planActiveSetRefresh: none when the page already matches the store or the store is empty", () => {
  assert.equal(planActiveSetRefresh(set(), set()), "none");
  assert.equal(planActiveSetRefresh(null, set()), "none");
});

test("planActiveSetRefresh: apply for the same Pokémon, seed for another", () => {
  assert.equal(planActiveSetRefresh(set({ sp: { ...set().sp, spe: 20 } }), set()), "apply");
  assert.equal(planActiveSetRefresh(set({ nature: "Adamant" }), set()), "apply");
  assert.equal(planActiveSetRefresh(set({ pokemonId: "rillaboom" }), set()), "seed");
  assert.equal(planActiveSetRefresh(set(), null), "seed");
});

function fakeEnvironment({ hidden = false } = {}) {
  const win = new EventTarget();
  const doc = new EventTarget();
  doc.hidden = hidden;
  const fire = (target, type, props = {}) => target.dispatchEvent(Object.assign(new Event(type), props));
  return { win, doc, fire };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

test("watchActiveSet refreshes on a bfcache restore, not on a normal pageshow", async () => {
  const { win, doc, fire } = fakeEnvironment();
  let calls = 0;
  const stop = watchActiveSet(() => calls++, { win, doc, delayMs: 0 });
  fire(win, "pageshow", { persisted: false });
  await flush();
  assert.equal(calls, 0);
  fire(win, "pageshow", { persisted: true });
  await flush();
  assert.equal(calls, 1);
  stop();
});

test("watchActiveSet follows other tabs' writes to the active-set key only, and coalesces them", async () => {
  const { win, doc, fire } = fakeEnvironment();
  let calls = 0;
  const stop = watchActiveSet(() => calls++, { win, doc, delayMs: 1 });
  fire(win, "storage", { key: "pokecal.teams.v1" });
  await flush();
  assert.equal(calls, 0);
  for (let step = 0; step < 5; step++) fire(win, "storage", { key: ACTIVE_SET_STORAGE_KEY });
  await flush();
  assert.equal(calls, 1);
  stop();
  fire(win, "storage", { key: ACTIVE_SET_STORAGE_KEY });
  await flush();
  assert.equal(calls, 1);
});

test("watchActiveSet defers a hidden tab's refresh until it is shown", async () => {
  const { win, doc, fire } = fakeEnvironment({ hidden: true });
  let calls = 0;
  watchActiveSet(() => calls++, { win, doc, delayMs: 0 });
  fire(win, "storage", { key: ACTIVE_SET_STORAGE_KEY });
  await flush();
  assert.equal(calls, 0);
  doc.hidden = false;
  fire(doc, "visibilitychange");
  await flush();
  assert.equal(calls, 1);
});

test("watchActiveSet without crossTab ignores other tabs and tab switches", async () => {
  const { win, doc, fire } = fakeEnvironment();
  let calls = 0;
  watchActiveSet(() => calls++, { win, doc, crossTab: false, delayMs: 0 });
  fire(win, "storage", { key: ACTIVE_SET_STORAGE_KEY });
  fire(doc, "visibilitychange");
  await flush();
  assert.equal(calls, 0);
  fire(win, "pageshow", { persisted: true });
  await flush();
  assert.equal(calls, 1);
});

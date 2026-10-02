import test from "node:test";
import assert from "node:assert/strict";

import { loadWithRecovery } from "../src/ui/bootstrap.js";
import { EN_MESSAGES } from "../src/locales/en.js";
import { ZH_TW_MESSAGES } from "../src/locales/zh-tw.js";

test("loadWithRecovery resolves the loaded value on success", async () => {
  assert.deepEqual(await loadWithRecovery(async () => ({ ok: true })), { ok: true });
});

test("loadWithRecovery reports failure and resolves null without a DOM", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  let failures = 0;
  const value = await loadWithRecovery(async () => { throw new Error("404"); }, {
    messageKey: "loadError.catalog",
    devHint: "run npm run sync-data",
    onFailure: () => { failures += 1; },
  });
  assert.equal(value, null);
  assert.equal(failures, 1);
  assert.match(logged[0][0], /sync-data/, "developer hint goes to console.error only");
});

test("load-error copy is user-facing and localized in both languages", () => {
  for (const key of ["catalog.missing", "catalog.loading", "loadError.title", "loadError.catalog", "loadError.teams", "loadError.retry", "loadError.retrying"]) {
    for (const messages of [EN_MESSAGES, ZH_TW_MESSAGES]) {
      assert.equal(typeof messages[key], "string", key);
      assert.doesNotMatch(messages[key], /npm|sync-/, key);
    }
    assert.notEqual(EN_MESSAGES[key], ZH_TW_MESSAGES[key], key);
  }
});

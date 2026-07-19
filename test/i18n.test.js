import test from "node:test";
import assert from "node:assert/strict";

import { EN_MESSAGES } from "../src/locales/en.js";
import { ZH_TW_MESSAGES } from "../src/locales/zh-tw.js";
import {
  formatNumber,
  localizedName,
  localizedSpreadName,
  localizedTerm,
  resolveLocale,
  tFor,
  toTraditionalChinese,
} from "../src/i18n.js";
import {
  formatChampionsUsage,
  formatDamageNote,
  formatDamageReason,
  formatKoResult,
  formatKoText,
  formatMoveOrderResult,
  formatSetWarning,
} from "../src/i18n-formatters.js";

test("resolves a saved or browser Traditional Chinese locale before English", () => {
  assert.equal(resolveLocale({ storedLocale: "zh-TW", languages: ["en-US"] }), "zh-TW");
  assert.equal(resolveLocale({ languages: ["zh-Hant-TW", "en-US"] }), "zh-TW");
  assert.equal(resolveLocale({ storedLocale: "fr", languages: ["zh-CN"] }), "en");
});

test("keeps English and Traditional Chinese message catalogs in parity", () => {
  assert.deepEqual(Object.keys(ZH_TW_MESSAGES).sort(), Object.keys(EN_MESSAGES).sort());
  assert.equal(tFor("zh-TW", "nav.lookup"), "查詢");
  assert.equal(tFor("zh-TW", "count.moves", { count: 4 }), "4 個招式");
});

test("localizes catalog names without changing their stable identifiers", () => {
  assert.equal(localizedName({ id: "pikachu", name: "Pikachu", aliases: ["皮卡丘"] }, "zh-TW"), "皮卡丘");
  assert.equal(localizedName({ id: "missing", name: "Missing", aliases: [] }, "zh-TW"), "Missing");
  assert.equal(
    localizedName({
      id: "charizardmegax",
      name: "Charizard-Mega-X",
      baseSpecies: "Charizard",
      aliases: ["噴火龍"],
    }, "zh-TW"),
    "噴火龍（超級X）",
  );
});

test("localizes domain terms and locale-sensitive numbers", () => {
  assert.equal(localizedTerm("type", "Electric", "zh-TW"), "電");
  assert.equal(localizedTerm("category", "Special", "zh-TW"), "特殊");
  assert.equal(localizedTerm("nature", "Adamant", "zh-TW"), "固執");
  assert.equal(formatNumber(12345, "en"), "12,345");
  assert.equal(formatNumber(12345, "zh-TW"), "12,345");
  assert.equal(toTraditionalChinese("波动冲 · 特性护具"), "波動衝 · 特性護具");
  assert.equal(localizedName({ id: "terashell", name: "Tera Shell", aliases: ["貫穿鑽"] }, "zh-TW"), "太晶甲殼");
  assert.equal(localizedSpreadName("Jolly:2/32/0/0/0/32", "zh-TW"), "爽朗:2/32/0/0/0/32");
});

test("formats usage, KO, order, damage reasons, and paste warnings in zh-TW", () => {
  assert.equal(
    formatChampionsUsage({ champions: { usageCount: 12, usagePercent: 34.56 } }, "zh-TW"),
    "34.6% · 12 次使用",
  );
  assert.equal(formatKoResult({ hits: 1, chance: 1, text: "guaranteed OHKO" }, "zh-TW"), "必定一擊倒下");
  assert.equal(formatKoResult({ hits: 2, chance: 0.5, text: "50.0% chance to 2HKO" }, "zh-TW"), "50.0% 機率兩擊倒下");
  assert.equal(formatKoText("guaranteed 2HKO (Sturdy)", "zh-TW"), "必定兩擊倒下（結實）");
  assert.equal(
    formatMoveOrderResult({
      firstSide: "attacker",
      attackerPriority: 1,
      defenderPriority: 0,
      attackerSpeed: 100,
      defenderSpeed: 200,
    }, { trickRoom: false }, "zh-TW"),
    "攻擊方依優先度先行（+1 對 0）。",
  );
  assert.equal(formatDamageReason("Status moves do not deal direct damage.", "zh-TW"), "變化招式不會造成直接傷害。");
  assert.equal(formatDamageReason("Natural Gift requires a held Berry.", "zh-TW"), "自然之恩需要攜帶樹果。");
  assert.equal(formatDamageNote("Tera (Electric)", "zh-TW"), "太晶（電）");
  assert.equal(formatDamageNote("Assumes target already moved", "zh-TW"), "假設目標已行動");
  assert.equal(formatSetWarning("Unknown move: Missing Move", "zh-TW"), "未知招式：Missing Move");
});

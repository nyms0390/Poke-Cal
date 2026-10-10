import test from "node:test";
import assert from "node:assert/strict";

import { EN_MESSAGES } from "../src/locales/en.js";
import { STATIC_ZH_TW, ZH_TW_MESSAGES } from "../src/locales/zh-tw.js";
import {
  applyDocumentTranslations,
  formatNumber,
  getLocale,
  localizedName,
  localizedSpreadName,
  localizedNatureDropdownLabel,
  localizedTerm,
  resolveLocale,
  setLocale,
  tFor,
  translateSubtree,
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
  assert.equal(tFor("en", "nav.moves"), "Moves");
  assert.equal(tFor("zh-TW", "nav.moves"), "招式");
  assert.equal(tFor("en", "moves.title"), "Move catalog");
  assert.equal(tFor("zh-TW", "moves.title"), "招式圖鑑");
  assert.equal(tFor("en", "moves.ariaLabel"), "Move catalog");
  assert.equal(tFor("zh-TW", "moves.ariaLabel"), "招式圖鑑");
  assert.equal(tFor("en", "moves.footer"), "Champions catalog · Level 50 · 31 IV · 1 SP = 8 EV");
  assert.equal(tFor("zh-TW", "moves.footer"), "Champions 圖鑑 · 等級 50 · 31 IV · 1 SP = 8 EV");
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
  assert.equal(localizedTerm("status", "Soaked", "zh-TW"), "浸水");
  assert.equal(STATIC_ZH_TW["Threat status"], "對手狀態");
  assert.equal(localizedTerm("nature", "Adamant", "zh-TW"), "固執");
  assert.equal(localizedNatureDropdownLabel("Adamant", "en"), "Adamant (+Atk, -SpA)");
  assert.equal(localizedNatureDropdownLabel("Adamant", "zh-TW"), "固執（+攻擊，-特攻）");
  assert.equal(localizedNatureDropdownLabel("Timid", "zh-TW"), "膽小（+速度，-攻擊）");
  assert.equal(localizedNatureDropdownLabel("Hardy", "zh-TW"), "勤奮");
  assert.equal(formatNumber(12345, "en"), "12,345");
  assert.equal(formatNumber(12345, "zh-TW"), "12,345");
  assert.equal(toTraditionalChinese("波动冲 · 特性护具"), "波動衝 · 特性護具");
  assert.equal(localizedName({ id: "terashell", name: "Tera Shell", aliases: ["太晶甲殼"] }, "zh-TW"), "太晶甲殼");
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
  assert.equal(formatKoText("guaranteed 2HKO after Leftovers recovery", "zh-TW"), "必定兩擊倒下（計入吃剩的東西回復）");
  assert.equal(
    formatKoResult({ hits: 4, chance: 1, text: "guaranteed 4HKO after Sitrus Berry and Grassy Terrain recovery" }, "zh-TW"),
    "必定四擊倒下（計入文柚果、青草場地回復）",
  );
  assert.equal(
    formatKoResult({ hits: 3, chance: 0.002, text: "0.2% chance to 3HKO after Leftovers recovery" }, "en"),
    "0.2% chance to 3HKO after Leftovers recovery",
  );
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
  assert.equal(formatDamageNote("Protean changed type to Fighting", "zh-TW"), "Protean將屬性變為格鬥");
  assert.equal(formatSetWarning("Unknown move: Missing Move", "zh-TW"), "未知招式：Missing Move");
});

// Minimal attribute-only DOM stand-in: enough for applyDocumentTranslations' selectors.
function fakeElement(attributes, dataset = {}) {
  return {
    attributes: { ...attributes },
    dataset: { ...dataset },
    hasAttribute(name) { return name in this.attributes; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
}

function fakeRoot(elements) {
  const matches = (element, selector) => selector.split(",").some((part) => {
    const attribute = part.trim().match(/^\[([a-z0-9-]+)\]$/)?.[1];
    if (!attribute) return false;
    if (!attribute.startsWith("data-")) return element.hasAttribute(attribute);
    const key = attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return element.dataset[key] !== undefined;
  });
  return { querySelectorAll: (selector) => elements.filter((element) => matches(element, selector)) };
}

test("keyed aria-labels follow every language switch instead of the load-time value", () => {
  const previous = getLocale();
  const keyed = fakeElement({ "aria-label": "Move catalog" }, { i18nAriaLabel: "moves.ariaLabel" });
  const unmarked = fakeElement({ "aria-label": "Move catalog" });
  const root = fakeRoot([keyed, unmarked]);
  try {
    setLocale("zh-TW", { persist: false });
    applyDocumentTranslations(root);
    assert.equal(keyed.getAttribute("aria-label"), "招式圖鑑");
    assert.equal(unmarked.getAttribute("aria-label"), STATIC_ZH_TW["Move catalog"] ?? "Move catalog");
    setLocale("en", { persist: false });
    applyDocumentTranslations(root);
    assert.equal(keyed.getAttribute("aria-label"), "Move catalog");
    assert.equal(unmarked.getAttribute("aria-label"), "Move catalog");
    setLocale("zh-TW", { persist: false });
    applyDocumentTranslations(root);
    assert.equal(keyed.getAttribute("aria-label"), "招式圖鑑");
  } finally {
    setLocale(previous, { persist: false });
  }
});

test("translateSubtree touches only the given subtree and never third-party containers", () => {
  const previous = getLocale();
  const inside = fakeElement({ "aria-label": "Speed" });
  const outside = fakeElement({ "aria-label": "Speed" });
  const thirdParty = Object.assign(fakeElement({ "aria-label": "Speed" }), { closest: () => ({}) });
  const subtree = { ...fakeRoot([inside, thirdParty]), matches: () => false };
  try {
    setLocale("zh-TW", { persist: false });
    translateSubtree(subtree, null);
    assert.equal(inside.getAttribute("aria-label"), STATIC_ZH_TW.Speed);
    assert.equal(outside.getAttribute("aria-label"), "Speed");
    assert.equal(thirdParty.getAttribute("aria-label"), "Speed");
  } finally {
    setLocale(previous, { persist: false });
  }
});

test("formats newer engine notes in zh-TW", () => {
  const move = { id: "snarl", name: "Snarl", aliases: ["大聲咆哮"] };
  assert.equal(formatDamageNote("Immune (item)", "zh-TW"), "因道具免疫");
  assert.equal(formatDamageNote("Snow Ice Def boost", "zh-TW"), "下雪提升冰屬性防禦");
  assert.equal(formatDamageNote("Attacker SP total 80 exceeds 66", "zh-TW"), "攻擊方 SP 總和 80 超過 66");
  assert.match(formatDamageNote("Tera Dark raises Snarl to 60 power", "zh-TW", { move }), /^太晶.+使.+威力提升至 60$/);
  assert.match(formatDamageNote("Snarl hits 2 times (child hit ×0.25)", "zh-TW", { move }), /攻擊 2 次（第二擊 ×0.25）$/);
  assert.match(formatDamageNote("Snarl hit count assumes 90% accuracy for each hit after the first", "zh-TW", { move }), /每擊命中率為 90%$/);
});

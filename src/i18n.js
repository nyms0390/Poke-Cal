import { EN_MESSAGES } from "./locales/en.js";
import { STATIC_ZH_TW, ZH_TW_MESSAGES } from "./locales/zh-tw.js";

export const SUPPORTED_LOCALES = ["en", "zh-TW"];
export const LOCALE_STORAGE_KEY = "pokecal.locale.v1";

const CATALOGS = { en: EN_MESSAGES, "zh-TW": ZH_TW_MESSAGES };
const listeners = new Set();
const ZH_TW_NAME_OVERRIDES = { terashell: "太晶甲殼" };
const SIMPLIFIED_TO_TRADITIONAL = {
  压: "壓", 针: "針", 热: "熱", 冲: "衝", 叶: "葉", 绿: "綠", 开: "開", 电: "電", 双: "雙", 击: "擊",
  闪: "閃", 场: "場", 变: "變", 万: "萬", 锤: "鎚", 剑: "劍", 飞: "飛", 扑: "撲", 强: "強", 钻: "鑽",
  喷: "噴", 转: "轉", 剧: "劇", 数: "數", 儿: "兒", 虫: "蟲", 闭: "閉", 关: "關", 线: "線", 轮: "輪",
  气: "氣", 发: "發", 动: "動", 铁: "鐵", 护: "護", 刚: "剛", 宝: "寶", 驱: "驅", 劲: "勁", 净: "淨",
  坠: "墜", 饰: "飾", 术: "術", 铠: "鎧",
};

const TERMS = {
  type: {
    Normal: "一般", Fire: "火", Water: "水", Electric: "電", Grass: "草", Ice: "冰",
    Fighting: "格鬥", Poison: "毒", Ground: "地面", Flying: "飛行", Psychic: "超能",
    Bug: "蟲", Rock: "岩石", Ghost: "幽靈", Dragon: "龍", Dark: "惡", Steel: "鋼", Fairy: "妖精",
  },
  category: { Physical: "物理", Special: "特殊", Status: "變化" },
  stat: { HP: "HP", Atk: "攻擊", Def: "防禦", SpA: "特攻", SpD: "特防", Spe: "速度", Attack: "攻擊", Defense: "防禦", "Sp. Atk": "特攻", "Sp. Def": "特防", Speed: "速度" },
  status: { Healthy: "正常", Burned: "灼傷", Poisoned: "中毒", "Badly Poisoned": "劇毒", Paralyzed: "麻痺", Asleep: "睡眠", Frozen: "冰凍" },
  nature: {
    Hardy: "勤奮", Lonely: "怕寂寞", Brave: "勇敢", Adamant: "固執", Naughty: "頑皮",
    Bold: "大膽", Docile: "坦率", Relaxed: "悠閒", Impish: "淘氣", Lax: "樂天",
    Timid: "膽小", Hasty: "急躁", Serious: "認真", Jolly: "爽朗", Naive: "天真",
    Modest: "內斂", Mild: "慢吞吞", Quiet: "冷靜", Bashful: "害羞", Rash: "馬虎",
    Calm: "溫和", Gentle: "溫順", Sassy: "自大", Careful: "慎重", Quirky: "浮躁",
  },
  form: { Mega: "超級", "Mega-X": "超級X", "Mega-Y": "超級Y", Alola: "阿羅拉", Galar: "伽勒爾", Hisui: "洗翠", Paldea: "帕底亞" },
  speedPreset: { Max: "極速", Fast: "高速", Neutral: "無投資", Slow: "最慢", "Your spread": "你的分配", Base: "種族值" },
  speedClass: { "+Spe": "+速度", Neutral: "無修正", "-Spe": "-速度" },
  condition: { "No item": "無道具", "Target statused": "目標有異常狀態", "User statused": "使用者有異常狀態" },
};

let locale = resolveLocale({
  storedLocale: readStoredLocale(),
  languages: globalThis.navigator?.languages ?? [],
});

export function resolveLocale({ storedLocale, languages = [] } = {}) {
  if (SUPPORTED_LOCALES.includes(storedLocale)) return storedLocale;
  return languages.some((language) => /^zh-(TW|Hant)(-|$)/i.test(language)) ? "zh-TW" : "en";
}

export function getLocale() {
  return locale;
}

export function setLocale(nextLocale, { persist = true } = {}) {
  const normalized = SUPPORTED_LOCALES.includes(nextLocale) ? nextLocale : "en";
  if (persist) writeStoredLocale(normalized);
  const changed = normalized !== locale;
  locale = normalized;
  applyDocumentTranslations();
  if (changed) for (const listener of listeners) listener(locale);
  if (changed) applyDocumentTranslations();
  return locale;
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key, params = {}) {
  return tFor(locale, key, params);
}

export function tFor(requestedLocale, key, params = {}) {
  const messages = CATALOGS[requestedLocale] ?? EN_MESSAGES;
  const message = messages[key] ?? EN_MESSAGES[key] ?? key;
  return typeof message === "function" ? message(params) : message;
}

export function formatNumber(value, requestedLocale = locale, options) {
  return new Intl.NumberFormat(requestedLocale, options).format(value);
}

export function localizedName(entry, requestedLocale = locale) {
  if (!entry) return "";
  if (requestedLocale !== "zh-TW") return entry.name ?? entry.id ?? "";
  const translated = ZH_TW_NAME_OVERRIDES[entry.id]
    ?? entry.localizations?.["zh-TW"]?.name
    ?? entry.aliases?.[0];
  if (!translated) return entry.name ?? entry.id ?? "";
  const baseSpecies = String(entry.baseSpecies ?? "");
  const name = String(entry.name ?? "");
  const traditionalName = toTraditionalChinese(translated);
  if (!baseSpecies || name === baseSpecies || !name.startsWith(`${baseSpecies}-`)) return traditionalName;
  const suffix = name.slice(baseSpecies.length + 1);
  return `${traditionalName}（${TERMS.form[suffix] ?? suffix}）`;
}

export function toTraditionalChinese(value) {
  return [...String(value ?? "")].map((character) => SIMPLIFIED_TO_TRADITIONAL[character] ?? character).join("");
}

export function localizedTerm(kind, value, requestedLocale = locale) {
  if (requestedLocale !== "zh-TW") return value;
  return TERMS[kind]?.[value] ?? value;
}

export function localizedNatureOptionLabel(natureName, requestedLocale = locale) {
  const nature = localizedTerm("nature", natureName, requestedLocale);
  return requestedLocale === "zh-TW" ? `${nature}（${natureName}）` : natureName;
}

export function localizedSpreadName(value, requestedLocale = locale) {
  const text = String(value ?? "");
  if (requestedLocale !== "zh-TW") return text;
  const separator = text.indexOf(":");
  if (separator < 0) return text;
  const nature = text.slice(0, separator);
  return `${localizedTerm("nature", nature, requestedLocale)}${text.slice(separator)}`;
}

export function initI18n() {
  applyDocumentTranslations();
  for (const select of document.querySelectorAll("[data-language-switch]")) {
    select.value = locale;
    if (select.dataset.i18nBound === "true") continue;
    select.dataset.i18nBound = "true";
    select.addEventListener("change", () => setLocale(select.value));
  }
  return locale;
}

export function applyDocumentTranslations(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  if (root.documentElement) root.documentElement.lang = locale;
  for (const element of root.querySelectorAll("[data-i18n]")) element.textContent = t(element.dataset.i18n);
  for (const [attribute, selector] of [
    ["placeholder", "[data-i18n-placeholder]"],
    ["aria-label", "[data-i18n-aria-label]"],
    ["title", "[data-i18n-title]"],
    ["content", "[data-i18n-content]"],
  ]) {
    const dataKey = `i18n${attribute.replace(/(^|-)([a-z])/g, (_, _dash, letter) => letter.toUpperCase())}`;
    for (const element of root.querySelectorAll(selector)) element.setAttribute(attribute, t(element.dataset[dataKey]));
  }
  for (const select of root.querySelectorAll("[data-language-switch]")) select.value = locale;
  translateUnmarkedDocumentCopy(root);
}

function translateUnmarkedDocumentCopy(root) {
  const nodeFilter = root.defaultView?.NodeFilter ?? globalThis.NodeFilter;
  if (root.createTreeWalker && nodeFilter) {
    const walker = root.createTreeWalker(root.body ?? root, nodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (!['SCRIPT', 'STYLE'].includes(node.parentElement?.tagName)) {
        const original = node.__pokecalEnglishText ?? node.nodeValue;
        node.__pokecalEnglishText = original;
        node.nodeValue = localizedStaticValue(original);
      }
      node = walker.nextNode();
    }
  }
  for (const element of root.querySelectorAll("[placeholder], [aria-label], [title], meta[name='description']")) {
    for (const attribute of ["placeholder", "aria-label", "title", "content"]) {
      if (!element.hasAttribute(attribute)) continue;
      const camelAttribute = attribute.replace(/(^|-)([a-z])/g, (_, _dash, letter) => letter.toUpperCase());
      const property = `pokecalEnglish${camelAttribute}`;
      const original = element.dataset[property] ?? element.getAttribute(attribute);
      element.dataset[property] = original;
      element.setAttribute(attribute, localizedStaticValue(original));
    }
  }
  const title = root.querySelector?.("title");
  if (title) {
    const original = title.dataset.pokecalEnglishTitle ?? title.textContent;
    title.dataset.pokecalEnglishTitle = original;
    title.textContent = localizedStaticValue(original);
  }
}

function localizedStaticValue(value) {
  if (locale !== "zh-TW") return value;
  const text = String(value ?? "");
  const trimmed = text.trim();
  const translated = STATIC_ZH_TW[trimmed.replace(/\s+/g, " ")];
  if (!translated) return text;
  const leading = text.match(/^\s*/)?.[0] ?? "";
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function readStoredLocale() {
  try {
    return globalThis.window?.localStorage?.getItem(LOCALE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredLocale(value) {
  try {
    globalThis.window?.localStorage?.setItem(LOCALE_STORAGE_KEY, value);
  } catch {
    // Storage can be unavailable in privacy modes; the in-memory locale still works.
  }
}

import { formatNumber, localizedName, localizedTerm, tFor } from "./i18n.js";
import { formatMovePriority } from "./data/catalog.js";
import { resultDescription } from "./engine/result-text.js";

export function formatChampionsUsage(entry, locale = "en") {
  const count = entry?.champions?.usageCount;
  const percent = entry?.champions?.usagePercent;
  if (!Number.isFinite(count)) return "—";
  const uses = tFor(locale, "count.uses", { count: formatNumber(count, locale) });
  return Number.isFinite(percent) ? `${percent.toFixed(1)}% · ${uses}` : uses;
}

export function formatKoResult(ko, locale = "en", maxHits = 5) {
  if (!ko || !Number.isFinite(ko.chance) || !ko.hits) {
    if (locale === "zh-TW" && /variable hit count/i.test(ko?.text ?? "")) return "連續招式次數不定，無法計算擊倒機率";
    if (locale === "zh-TW" && /Sturdy/i.test(ko?.text ?? "")) return "滿 HP 時靠結實存活";
    return locale === "en" && ko?.text ? ko.text : tFor(locale, "ko.notWithin", { hits: maxHits });
  }
  const label = ko.hits === 1 ? tFor(locale, "ko.ohko") : tFor(locale, "ko.hko", { hits: ko.hits });
  return ko.chance === 1
    ? tFor(locale, "ko.guaranteed", { label })
    : tFor(locale, "ko.chance", { chance: (ko.chance * 100).toFixed(1), label });
}

export function formatKoText(text, locale = "en") {
  if (locale !== "zh-TW") return text;
  const guaranteed = /^guaranteed (OHKO|([2-5])HKO)( \(Sturdy\))?$/i.exec(text);
  if (guaranteed) {
    const hits = guaranteed[1].toUpperCase() === "OHKO" ? 1 : Number(guaranteed[2]);
    const label = formatKoResult({ hits, chance: 1, text }, locale);
    return guaranteed[3] ? `${label}（結實）` : label;
  }
  const chance = /^([\d.]+)% chance to (OHKO|([2-5])HKO)$/i.exec(text);
  if (chance) {
    const hits = chance[2].toUpperCase() === "OHKO" ? 1 : Number(chance[3]);
    return formatKoResult({ hits, chance: Number(chance[1]) / 100, text }, locale);
  }
  const noKo = /not a KO(?:'d)? within (\d+) hits/i.exec(text);
  if (noKo) return tFor(locale, "ko.notWithin", { hits: noKo[1] });
  if (/cannot survive 1 hit/i.test(text)) return "無法擋下一擊";
  const surviveChance = /survives 1 hit \(([\d.]+)% chance\)/i.exec(text);
  if (surviveChance) return `${surviveChance[1]}% 機率擋下一擊`;
  if (/survives 1 hit \(guaranteed\)/i.test(text)) return "必定擋下一擊";
  if (/survives with Sturdy at full HP/i.test(text)) return "滿 HP 時靠結實存活";
  if (/KO chance unavailable for variable hit count/i.test(text)) return "連續招式次數不定，無法計算擊倒機率";
  return formatDamageReason(text, locale);
}

export function formatMoveOrderResult(result, field = {}, locale = "en") {
  const side = tFor(locale, `side.${result.firstSide}`);
  if (result.attackerPriority !== result.defenderPriority) {
    return tFor(locale, "order.priority", {
      side,
      attackerPriority: formatMovePriority(result.attackerPriority),
      defenderPriority: formatMovePriority(result.defenderPriority),
    });
  }
  if (result.attackerSpeed === result.defenderSpeed) {
    return tFor(locale, "order.tie", {
      priority: formatMovePriority(result.attackerPriority),
      speed: result.attackerSpeed,
    });
  }
  const speed = field.trickRoom
    ? Math.min(result.attackerSpeed, result.defenderSpeed)
    : Math.max(result.attackerSpeed, result.defenderSpeed);
  return tFor(locale, field.trickRoom ? "order.trickRoom" : "order.speed", { side, speed });
}

export function formatDamageReason(reason, locale = "en") {
  const key = new Map([
    ["Status moves do not deal direct damage.", "damage.status"],
    ["Fixed-damage moves are not supported.", "damage.fixed"],
    ["Variable or zero base power is not supported.", "damage.variable"],
    ["Custom damage behavior is not supported.", "damage.custom"],
    ["No direct damage", "damage.none"],
  ]).get(reason);
  if (key) return tFor(locale, key);
  if (locale !== "zh-TW") return reason;
  const exact = {
    "Missing move data.": "缺少招式資料。",
    "Only Physical and Special moves are supported.": "僅支援物理與特殊招式。",
    "Requires the last damage received this turn.": "需要本回合最後一次受到的傷害資料。",
    "Requires delayed damage resolution and stored user state.": "需要延遲傷害結算與已儲存的使用者狀態。",
    "Requires stored damage taken over prior turns.": "需要先前回合累積的受傷資料。",
    "Natural Gift requires a held Berry.": "自然之恩需要攜帶樹果。",
    "Fling requires a held item with fling power data.": "投擲需要攜帶具有投擲威力資料的道具。",
  };
  if (exact[reason]) return exact[reason];
  const bothWeights = /^(.+) requires attacker and defender weights\.$/.exec(reason);
  if (bothWeights) return `${bothWeights[1]}需要攻擊方與防守方的體重資料。`;
  const defenderWeight = /^(.+) requires defender weight\.$/.exec(reason);
  if (defenderWeight) return `${defenderWeight[1]}需要防守方的體重資料。`;
  return reason;
}

export function formatSetWarning(warning, locale = "en") {
  const patterns = [
    [/^Unknown move: (.+)$/, "paste.unknownMove"],
    [/^Unknown ability: (.+)$/, "paste.unknownAbility"],
    [/^Unknown Pokémon: (.+)$/, "paste.unknownPokemon"],
    [/^Unknown item: (.+)$/, "paste.unknownItem"],
    [/^Unknown stat: (.+)$/, "paste.unknownStat"],
    [/^Could not parse spread part: (.+)$/, "paste.unparsedSpread"],
  ];
  if (warning === "Mapped EVs to Champions SPs.") return tFor(locale, "paste.mappedEvs");
  for (const [pattern, key] of patterns) {
    const match = pattern.exec(warning);
    if (match) return tFor(locale, key, { value: match[1] });
  }
  return warning;
}

export function localizedType(type, locale = "en") {
  return localizedTerm("type", type, locale);
}

export function formatResultDescription(args, locale = "en") {
  if (locale !== "zh-TW") return resultDescription(args);
  const { attackerState, defenderState, move, field = {}, result } = args;
  if (!result?.supported) return formatDamageReason(result?.reason ?? "No direct damage", locale);
  const attackStat = result.attackStat ?? (move.category === "Special" ? "spa" : "atk");
  const defenseStat = result.defenseStat ?? (move.category === "Special" ? "spd" : "def");
  const statLabels = { hp: "HP", atk: "攻擊", def: "防禦", spa: "特攻", spd: "特防", spe: "速度" };
  const attackerPrefix = [stagePrefix(attackerState.stages?.[attackStat]), `${attackerState.sp?.[attackStat] ?? 0} ${statLabels[attackStat]}`]
    .filter(Boolean).join(" ");
  const defenderPrefix = [
    stagePrefix(defenderState.stages?.[defenseStat]),
    `${defenderState.sp?.hp ?? 0} HP / ${defenderState.sp?.[defenseStat] ?? 0} ${statLabels[defenseStat]}`,
  ].filter(Boolean).join(" ");
  const item = attackerState.item?.name && result.notes?.includes(attackerState.item.name)
    ? `${localizedName(attackerState.item, locale)} `
    : "";
  const clauses = localizedFieldClauses({ attackerState, defenderState, field, result });
  const matchup = `${attackerPrefix} ${item}${localizedName(attackerState.pokemon, locale)}的${localizedName(move, locale)} 對 ${defenderPrefix} ${localizedName(defenderState.pokemon, locale)}${clauses}`;
  return `${matchup}：${result.minDamage}-${result.maxDamage} (${result.minPercent} - ${result.maxPercent}%) -- ${formatKoResult(result.ko, locale)}`;
}

export function formatDamageNote(note, locale = "en", { move, entities = [] } = {}) {
  if (locale !== "zh-TW") return note;
  const exact = {
    "Immune": "免疫",
    "Fixed damage": "固定傷害",
    "Doubles spread move": "雙打範圍招式",
    "Pledge combo STAB": "誓約組合的屬性一致加成",
    "Ice Face intact (first hit negated)": "冰臉完好（抵銷第一次攻擊）",
    "Cloud Nine/Air Lock suppresses weather": "無關天氣/氣閘屏蔽天氣",
    "Primordial Sea treated as Rain": "始源之海視為下雨",
    "Mega Sol treats this move as Sunny Day": "超級太陽將此招式視為大晴天",
    "Sandstorm Rock SpD boost": "沙暴提升岩石屬性特防",
    "Immune (ability)": "因特性免疫",
    "Sun": "大晴天",
    "Rain": "下雨",
    "Sand": "沙暴",
    "Snow": "下雪",
    "Reflect": "反射壁",
    "Light Screen": "光牆",
    "Aurora Veil": "極光幕",
    "Friend Guard": "友情防守",
    "Helping Hand": "幫助",
    "Assumes maximum friendship (102 BP)": "假設親密度最高（威力 102）",
    "Assumes minimum friendship (102 BP)": "假設親密度最低（威力 102）",
    "Assumes 3 Stockpile uses (300 BP)": "假設已使用蓄力 3 次（威力 300）",
    "Assumes 5+ PP remaining (40 BP)": "假設剩餘 5 以上 PP（威力 40）",
    "×2 on switch not modeled": "未計算換上時的 ×2 修正",
    "Assumes the 80 BP outcome; 30% chance of 140 BP": "假設威力 80 的結果；有 30% 機率為威力 140",
    "Assumes Magnitude 7 (70 BP)": "假設震級 7（威力 70）",
    "Assumes the 80 BP outcome": "假設威力 80 的結果",
    "Assumes the level-50 average (50 damage)": "假設等級 50 的平均值（50 傷害）",
    "Salt Cure residual: 1/8 max HP (1/4 vs Water/Steel) per turn": "鹽醃每回合造成最大 HP 的 1/8 傷害（對水／鋼為 1/4）",
    "-1 Def / +1 Spe after use": "使用後防禦 -1／速度 +1",
  };
  if (exact[note]) return exact[note];
  for (const entity of entities.filter(Boolean)) {
    if (note === entity.name) return localizedName(entity, locale);
    if (note.startsWith(`${entity.name} (`)) return note.replace(entity.name, localizedName(entity, locale));
  }
  const moveName = move?.name && note.startsWith(move.name) ? localizedName(move, locale) : null;
  if (moveName) {
    const suffix = note.slice(move.name.length);
    const power = /^ power (\d+)$/.exec(suffix);
    if (power) return `${moveName}威力 ${power[1]}`;
    const baseline = /^ baseline power (\d+)$/.exec(suffix);
    if (baseline) return `${moveName}基礎威力 ${baseline[1]}`;
    const typed = /^ is (.+) type$/.exec(suffix);
    if (typed) return `${moveName}變為${localizedTerm("type", typed[1], locale)}屬性`;
    const hits = /^ hits (\d+) times$/.exec(suffix);
    if (hits) return `${moveName}攻擊 ${hits[1]} 次`;
    const hitPowers = /^ hits (\d+) times at (.+)$/.exec(suffix);
    if (hitPowers) return `${moveName}以威力 ${hitPowers[2]} 攻擊 ${hitPowers[1]} 次`;
    const variableHits = /^ hits (\d+)-(\d+) times$/.exec(suffix);
    if (variableHits) return `${moveName}攻擊 ${variableHits[1]}-${variableHits[2]} 次`;
  }
  const targetMoved = /^Assumes target (already moved|has not moved)$/.exec(note);
  if (targetMoved) return targetMoved[1] === "already moved" ? "假設目標已行動" : "假設目標尚未行動";
  const forecast = /^Forecast (.+) type$/.exec(note);
  if (forecast) return `預報將屬性變為${localizedTerm("type", forecast[1], locale)}`;
  const tera = /^Tera \((.+)\)$/.exec(note);
  if (tera) return `太晶（${localizedTerm("type", tera[1], locale)}）`;
  return note;
}

function stagePrefix(stage = 0) {
  return stage > 0 ? `+${stage}` : stage < 0 ? String(stage) : "";
}

function localizedFieldClauses({ attackerState, defenderState, field, result }) {
  const clauses = [];
  if (result.critical) clauses.push("要害");
  if (field.terrain) {
    const terrainType = field.terrain.replace(" Terrain", "");
    clauses.push(`${localizedTerm("type", terrainType, "zh-TW")}場地`);
  }
  const weather = { SunnyDay: "大晴天", RainDance: "下雨", Sandstorm: "沙暴", Snowscape: "下雪" }[field.weather];
  if (weather) clauses.push(weather);
  for (const [key, english, translated] of [
    ["reflect", "Reflect", "反射壁"],
    ["lightScreen", "Light Screen", "光牆"],
    ["auroraVeil", "Aurora Veil", "極光幕"],
  ]) {
    if (field.defenderSide?.[key] && result.notes?.includes(english)) clauses.push(`穿過${translated}`);
  }
  if (attackerState.teraType) clauses.push(`攻擊方太晶${localizedTerm("type", attackerState.teraType, "zh-TW")}`);
  if (defenderState.teraType) clauses.push(`防守方太晶${localizedTerm("type", defenderState.teraType, "zh-TW")}`);
  return clauses.length ? `（${clauses.join("、")}）` : "";
}

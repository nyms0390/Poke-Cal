// Pure analyses behind the MCP's set, Speed tier, bulk point and break point tools. They reuse
// the browser pages' modules (speed-line.js, bulk-points.js, break-points.js) on states built
// by strategy-tools.js, so there is never a second calculation path.
import { breakPoints, yourDamageAnalysis } from "./break-points.js";
import { bulkBaseline, bulkPoints, threatDamage } from "./bulk-points.js";
import { ncpSetPaste } from "./ncp-data.js";
import { popularOpponentPool, speedBreakpoints, speedItemIdForSet, speedTiers } from "./speed-line.js";
import { damageField, resolveMove, resolvePokemon, sideState } from "./strategy-tools.js";
import { threatList } from "./threats.js";
import { parseUsageSpread } from "./usage-defaults.js";

export const SP_BUDGET = 66;
// Each Limitless/Smogon usage list keeps its most used entries. The MCP catalogs keep exactly
// these (scripts/lib/mcp-catalogs.mjs), so the full and minified catalogs give the same sets.
export const USAGE_LIST_LIMIT = 12;
export const USAGE_LIST_KEYS = ["abilities", "items", "moves", "natures", "teammates", "spreads"];
export const SPEED_OPPONENT_COUNTS = [10, 20, 30, 40, 50];
export const DEFAULT_SPEED_OPPONENT_COUNT = 20;

// Most used first (ties by name), capped at USAGE_LIST_LIMIT. Sorting is stable, so a capped
// list sorts and caps to itself.
export function topUsageList(entries = []) {
  return [...entries]
    .sort((a, b) => usageValue(b) - usageValue(a) || String(a.name).localeCompare(String(b.name)))
    .slice(0, USAGE_LIST_LIMIT);
}

export function pokemonSets(context, pokemonName) {
  const pokemon = resolvePokemon(context, pokemonName);
  const champions = pokemon.champions ?? {};
  const usage = champions.usage ?? {};
  const list = (key) => topUsageList(usage[key]).map((entry) => ({
    id: entry.id ?? null,
    name: entry.name,
    usagePercent: roundPercent(entry.usagePercent),
  }));
  return {
    pokemon: { id: pokemon.id, name: pokemon.name, types: pokemon.types ?? [] },
    legal: champions.legal === true,
    teamUsage: {
      teams: champions.usageCount ?? null,
      percent: roundPercent(champions.usagePercent),
    },
    limitless: {
      abilities: list("abilities"),
      items: list("items"),
      moves: list("moves"),
      natures: list("natures"),
      teammates: list("teammates"),
    },
    smogonSpreads: topUsageList(usage.spreads).flatMap((entry) => {
      const spread = parseUsageSpread(entry.name);
      return spread ? [{ spread: entry.name, nature: spread.nature, sp: spread.sp, usagePercent: roundPercent(entry.usagePercent) }] : [];
    }),
    ncpSets: (champions.ncp?.sets ?? []).map((set) => ({
      name: set.name,
      nature: set.nature,
      sp: set.sps,
      ability: set.ability || null,
      item: set.item || null,
      moves: set.moves ?? [],
      paste: ncpSetPaste(pokemon, set),
    })),
    sources: {
      limitless: "Limitless: Champions tournament usage (share of teams that run the Pokémon).",
      smogonSpreads: "Smogon ladder stats: Champions SP spreads.",
      ncpSets: "NCP (Nimbasa City Post): curated Champions sets.",
    },
  };
}

// Final Speed of one set against the most used Pokémon, as on the Speed Tiers page: each
// opponent lists its Speed presets, NCP curated sets and Limitless profiles, and the likely one
// decides the summary. Outside Trick Room each slower-than-you tier is skipped and each faster
// one carries the SP needed to outspeed it with a +Spe, neutral or −Spe nature.
export function speedTierTable(context, options = {}) {
  const userState = sideState(context, options.pokemon, {
    set: options.set,
    spread: options.spread,
    ability: options.ability,
    item: options.item,
  });
  const count = SPEED_OPPONENT_COUNTS.includes(options.count) ? options.count : DEFAULT_SPEED_OPPONENT_COUNT;
  const trickRoom = Boolean(options.trickRoom);
  const user = {
    pokemon: userState.pokemon,
    nature: userState.nature,
    spe: userState.sp.spe ?? 0,
    ability: userState.ability,
    item: userState.item,
  };
  const opponents = popularOpponentPool(popularSpeedOpponents(context), [], count, context.pokemon, { excludePokemonId: user.pokemon.id });
  const rows = speedTiers(user, opponents, {
    mode: "battle",
    trickRoom,
    userMods: {
      stage: options.speedStage ?? 0,
      tailwind: Boolean(options.tailwind),
      paralysis: Boolean(options.paralysis),
      speedItem: speedItemIdForSet(user.item),
      ability: user.ability,
      item: user.item,
      abilityActive: Boolean(options.abilityActive),
    },
    opponentMods: {
      stage: options.opponentSpeedStage ?? 0,
      tailwind: Boolean(options.opponentTailwind),
      paralysis: Boolean(options.opponentParalysis),
    },
    includeActiveSpeedAbilities: Boolean(options.includeActiveOpponentAbilities),
  });
  const userSpeed = rows.context.userSpeed;
  const breakpoints = trickRoom ? new Map() : new Map(speedBreakpoints(user, rows).map((point) => [point.tierSpeed, point.choices]));
  const usageById = new Map(opponents.map(({ pokemon }) => [pokemon.id, pokemon.champions?.usagePercent]));
  const byOpponent = new Map(opponents.map(({ pokemon }) => [pokemon.id, []]));
  for (const row of rows) {
    for (const entry of row.entries) {
      if (entry.isUser) continue;
      byOpponent.get(entry.id)?.push(compactEntry({
        speed: row.speed,
        set: entry.presetLabel,
        source: entry.source,
        nature: entry.nature,
        sp: entry.sp,
        item: entry.item?.name,
        ability: entry.ability?.name,
        likely: entry.likely || undefined,
        abilityActive: entry.abilityActive || undefined,
        movesFirst: actingOrder(row.actsBefore),
        toOutspeed: row.actsBefore && breakpoints.get(row.speed)?.length ? breakpoints.get(row.speed) : undefined,
      }));
    }
  }
  const summary = { youMoveFirst: 0, theyMoveFirst: 0, speedTie: 0 };
  const table = opponents.map(({ pokemon }) => {
    const sets = byOpponent.get(pokemon.id) ?? [];
    const likely = sets.find((set) => set.likely) ?? sets[0] ?? null;
    const fastest = sets[0] ?? null;
    if (likely?.movesFirst === "you") summary.youMoveFirst += 1;
    else if (likely?.movesFirst === "opponent") summary.theyMoveFirst += 1;
    else if (likely) summary.speedTie += 1;
    return compactEntry({
      id: pokemon.id,
      name: pokemon.name,
      usagePercent: roundPercent(usageById.get(pokemon.id)) ?? undefined,
      likely,
      fastest: fastest !== likely ? fastest : undefined,
      sets: options.includeAllSets ? sets : undefined,
    });
  });
  return {
    user: setSummary(userState, { speed: userSpeed }),
    trickRoom,
    count,
    summary,
    opponents: table,
    pasteWarnings: userState.pasteWarnings,
    assumptions: [
      `Opponents: the ${count} most used Pokémon on Limitless (Champions tournament usage), with their Mega forms.`,
      "Presets assume 32 or 0 Speed SP; Limitless profiles take Speed SP from the matching Smogon ladder spread when there is one; NCP sets are exact.",
      "likely is the preset or Limitless profile the opponent most often runs; fastest is its fastest listed set (Trick Room order still applies to movesFirst).",
    ],
  };
}

// The 50 most used Pokémon as the Speed Tiers page builds them; they depend only on the
// catalog, so each context computes them once.
const speedOpponentCache = new WeakMap();
function popularSpeedOpponents(context) {
  if (!speedOpponentCache.has(context)) {
    speedOpponentCache.set(context, threatList(context.pokemon, { count: 50, moveLookup: context.moveLookup })
      .map((threat) => ({
        pokemon: threat.pokemon,
        likelyPresetLabel: threat.spPresets.speed.find(({ likely }) => likely)?.label ?? "",
      })));
  }
  return speedOpponentCache.get(context);
}

// The fewest HP + defence SP that move one attacker's move into a better KO tier against your
// Pokémon, as on Builder: from your current spread, and from zero bulk SP (HP, Def and SpD all
// 0). The budget is 66 SP minus your Atk, SpA and Spe unless given.
export function bulkPointAnalysis(context, options = {}) {
  const defender = sideState(context, options.pokemon, sideOverrides(options, ""));
  const attacker = sideState(context, options.attacker, sideOverrides(options, "attacker"));
  const move = resolveMove(context, options.move);
  const scenario = { threat: threatFromState(attacker), move, field: damageField(options) };
  const budget = options.budget ?? remainingBudget(defender.sp, ["atk", "spa", "spe"]);
  const baseline = bulkBaseline(defender, scenario, { budget });
  const defenseStat = move.overrideDefensiveStat ?? (move.category === "Physical" ? "def" : "spd");
  const points = (frontier) => frontier.map((point) => ({
    hp: point.hpSp,
    [defenseStat]: point.defSp,
    totalSp: point.totalSp,
    achieves: point.achieves,
    koText: point.koText,
    maxPercent: point.maxPct,
  }));
  return {
    pokemon: setSummary(defender),
    attacker: setSummary(attacker),
    move: { id: move.id, name: move.name, type: move.type, category: move.category },
    defenseStat,
    budget,
    current: damageSummary(threatDamage(defender, scenario)),
    fromCurrent: points(bulkPoints(defender, scenario, { budget })),
    zeroBulk: damageSummary(baseline.baselineDamage),
    fromZeroBulk: points(baseline.baselinePoints),
    pasteWarnings: [...defender.pasteWarnings, ...attacker.pasteWarnings],
    assumptions: [
      "Both sides at full HP with no stat stages; the attacker's Atk/SpA SP, nature, ability, item and Tera type come from its set.",
      "Points only move HP and the defence stat the move hits; each stat caps at 32 SP.",
    ],
  };
}

// The Atk or SpA SP at which your move reaches a better KO tier against one target, as on
// Builder; points marked requiresPlusNature need an Adamant or Modest nature.
export function breakPointAnalysis(context, options = {}) {
  const attacker = sideState(context, options.pokemon, sideOverrides(options, ""));
  const target = sideState(context, options.target, sideOverrides(options, "target"));
  const move = resolveMove(context, options.move);
  const scenario = {
    threat: threatFromState(target),
    field: damageField(options),
    critical: Boolean(options.critical),
    moveOptions: options.moveOptions ?? {},
  };
  const analysis = yourDamageAnalysis(attacker, move, scenario);
  return {
    pokemon: setSummary(attacker),
    target: setSummary(target),
    move: { id: move.id, name: move.name, type: move.type, category: move.category },
    attackStat: analysis.attackStat,
    current: damageSummary(analysis.damage),
    points: breakPoints(attacker, move, scenario).map((point) => ({
      sp: point.sp,
      achieves: point.achieves,
      minPercent: point.minPct,
      maxPercent: point.maxPct,
      ...(point.requiresPlusNature ? { requiresPlusNature: true } : {}),
    })),
    pasteWarnings: [...attacker.pasteWarnings, ...target.pasteWarnings],
    assumptions: [
      "Both sides at full HP with no stat stages; the target's HP/Def/SpD SP, nature, ability, item and Tera type come from its set.",
      "Points only move the attacking stat the move uses; it caps at 32 SP.",
    ],
  };
}

function sideOverrides(options, prefix) {
  const key = (name) => prefix ? `${prefix}${name}` : name.charAt(0).toLowerCase() + name.slice(1);
  return {
    set: options[key("Set")],
    spread: options[key("Spread")],
    ability: options[key("Ability")],
    item: options[key("Item")],
    teraType: options[key("TeraType")],
    status: options[key("Status")],
  };
}

// bulk-points.js and break-points.js take the other side as a Builder threat; this carries a
// resolved state's whole set into one.
function threatFromState(state) {
  return {
    pokemon: state.pokemon,
    nature: state.nature,
    ability: state.ability,
    item: state.item,
    teraType: state.teraType,
    status: state.status,
    spPresets: {
      offense: { atk: state.sp.atk ?? 0, spa: state.sp.spa ?? 0 },
      bulk: { hp: state.sp.hp ?? 0, def: state.sp.def ?? 0, spd: state.sp.spd ?? 0 },
    },
  };
}

function remainingBudget(sp, stats) {
  return Math.max(0, SP_BUDGET - stats.reduce((total, stat) => total + (Number(sp?.[stat]) || 0), 0));
}

function setSummary(state, extra = {}) {
  return {
    id: state.pokemon.id,
    name: state.pokemon.name,
    nature: state.nature,
    sp: state.sp,
    ability: state.ability?.name ?? null,
    item: state.item?.name ?? null,
    ...(state.teraType ? { teraType: state.teraType } : {}),
    ...extra,
  };
}

function damageSummary(damage) {
  return { minPercent: damage.minPct, maxPercent: damage.maxPct, koText: damage.koText };
}

function compactEntry(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined && value !== null));
}

function actingOrder(actsBefore) {
  if (actsBefore === null) return "tie";
  return actsBefore ? "opponent" : "you";
}

function usageValue(entry) {
  return Number.isFinite(entry?.usagePercent) ? entry.usagePercent : -1;
}

function roundPercent(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

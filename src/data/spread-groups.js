import { calculateStat } from "../engine/stats.js";
import { parseUsageSpread } from "./usage-defaults.js";

/*
 * Smogon ladder spreads grouped by the stats a calculation reads. Many spreads differ only in
 * stats a given calculation ignores (a Bold 1 Def and a neutral 8 Def can share a Def stat), so
 * ranking whole spreads splits one real build across several rows. Each group key is the final
 * stat values, never SP or nature, so grouping loses nothing for the calculation that uses it.
 * See docs/DECISIONS.md "Threat spreads are grouped by the stats each calculation reads".
 *
 * Keyed by the stat a move hits or attacks with: break points read the target's HP and the
 * defense the move hits, bulk points read the attacker's offensive stat.
 */
export const SPREAD_GROUP_STATS = Object.freeze({
  def: Object.freeze(["hp", "def"]),
  spd: Object.freeze(["hp", "spd"]),
  atk: Object.freeze(["atk"]),
  spa: Object.freeze(["spa"]),
});
export const SPREAD_GROUP_LIMIT = 3;

/**
 * Groups for one stat key, most used first: `{ spread, share, spreadCount }`, where `spread` is
 * the group's most used spread name and `share` the summed usage percent of its spreads.
 */
export function spreadGroupsFor(pokemon, spreads, key, { limit = SPREAD_GROUP_LIMIT } = {}) {
  const stats = SPREAD_GROUP_STATS[key];
  if (!stats || !pokemon?.baseStats) return [];
  const groups = new Map();
  for (const entry of spreads ?? []) {
    const share = Number(entry?.usagePercent);
    const parsed = parseUsageSpread(entry?.name);
    if (!parsed || !Number.isFinite(share) || share <= 0) continue;
    const values = stats.map((stat) => statValue(pokemon, stat, parsed));
    if (values.some((value) => value === null)) continue;
    const groupKey = values.join("/");
    const group = groups.get(groupKey) ?? { spread: entry.name, top: share, share: 0, spreadCount: 0 };
    if (share > group.top || (share === group.top && entry.name.localeCompare(group.spread) < 0)) {
      group.spread = entry.name;
      group.top = share;
    }
    group.share += share;
    group.spreadCount += 1;
    groups.set(groupKey, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.share - a.share || b.top - a.top || a.spread.localeCompare(b.spread))
    .slice(0, limit)
    .map(({ spread, share, spreadCount }) => ({ spread, share: round(share), spreadCount }));
}

/** Every stat key's groups for one Pokémon, as stored in `champions.usage.spreadGroups`. */
export function buildSpreadGroups(pokemon, spreads, options) {
  const result = {};
  for (const key of Object.keys(SPREAD_GROUP_STATS)) {
    const groups = spreadGroupsFor(pokemon, spreads, key, options);
    if (groups.length > 0) result[key] = groups;
  }
  return Object.keys(result).length > 0 ? result : null;
}

/**
 * The most used group for one stat key, resolved to a spread: `{ key, spreadName, nature, sp,
 * share, spreadCount, stats }`, or null when the Pokémon has no ladder spreads. Synced catalogs
 * store groups built from every ladder spread; older catalogs fall back to the stored top spreads.
 */
export function topSpreadGroup(pokemon, key) {
  const usage = pokemon?.champions?.usage;
  const stored = usage?.spreadGroups?.[key];
  const group = stored?.length ? stored[0] : spreadGroupsFor(pokemon, usage?.spreads, key, { limit: 1 })[0];
  const parsed = parseUsageSpread(group?.spread);
  if (!parsed) return null;
  return {
    key,
    spreadName: group.spread,
    nature: parsed.nature,
    sp: parsed.sp,
    share: group.share,
    spreadCount: group.spreadCount ?? 1,
    stats: Object.fromEntries(SPREAD_GROUP_STATS[key].map((stat) => [stat, statValue(pokemon, stat, parsed)])),
  };
}

/** The top group for every stat key that has one, keyed like SPREAD_GROUP_STATS. */
export function topSpreadGroups(pokemon) {
  const result = {};
  for (const key of Object.keys(SPREAD_GROUP_STATS)) {
    const group = topSpreadGroup(pokemon, key);
    if (group) result[key] = group;
  }
  return Object.keys(result).length > 0 ? result : null;
}

function statValue(pokemon, stat, { nature, sp }) {
  const base = pokemon.baseStats?.[stat];
  if (!Number.isInteger(base) || base < 1) return null;
  return calculateStat({ base, stat, sp: sp[stat], nature });
}

function round(value) {
  return Math.round(value * 100) / 100;
}

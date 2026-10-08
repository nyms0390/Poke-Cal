import { normalizeId } from "../identifiers.js";
import { matchup } from "./matchups.js";
import { UNCOMMON_MIN_TEAMS, theoryConfigs } from "./uncommon-sets.js";

/*
 * "Beyond the usual sets", part 2: rarely used Pokémon (fewer than UNCOMMON_MIN_TEAMS Limitless
 * teams, including none). Their samples are too small to say which choices are rare, so each
 * one gets its strongest theory set against you (uncommon-sets.js), and the page shows only the
 * ways of beating you that nothing more common already covers.
 */

/** Every non-battle-only Pokémon split at `minTeams` Limitless teams, each ranked by usage. */
export function splitByTeams(pokemonCatalog = [], { minTeams = UNCOMMON_MIN_TEAMS } = {}) {
  const entries = pokemonCatalog.filter((pokemon) => pokemon && !pokemon.battleOnly);
  const ranked = entries
    .filter((pokemon) => Number.isFinite(pokemon.champions?.usagePercent))
    .sort((a, b) => b.champions.usagePercent - a.champions.usagePercent || String(a.name).localeCompare(String(b.name)));
  const rankOf = new Map(ranked.map((pokemon, index) => [pokemon, index + 1]));
  const entry = (pokemon) => ({
    pokemon,
    rank: rankOf.get(pokemon) ?? null,
    usagePercent: pokemon.champions?.usagePercent ?? 0,
  });
  const byRank = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || String(a.pokemon.name).localeCompare(String(b.pokemon.name));
  return {
    popular: entries.filter((pokemon) => (pokemon.champions?.usageCount ?? 0) >= minTeams).map(entry).sort(byRank),
    rare: entries.filter((pokemon) => (pokemon.champions?.usageCount ?? 0) < minTeams).map(entry).sort(byRank),
  };
}

/**
 * How a set beats you, for grouping: the type and category of its KO move, plus "walls" when
 * your moves cannot 3HKO it.
 */
export function threatPattern(result) {
  const move = result?.theirs?.best?.move;
  if (!move) return null;
  const walls = Boolean(result.ourOffenseWalled);
  return { type: move.type, category: move.category, walls, key: `${move.type}|${move.category}|${walls ? "walls" : ""}` };
}

/**
 * The strongest theory set of a rarely used Pokémon that beats you, or null. Hard counters
 * come first, then the widest margin.
 */
export function nicheThreatRow({ pokemon, rank, usagePercent }, ours, lookups = {}, { field = {} } = {}) {
  if (!ours?.pokemon || ours.moves.length === 0) return null;
  let best = null;
  for (const config of theoryConfigs(pokemon, ours, lookups)) {
    const result = matchup({ ours, theirs: config.set, field });
    if (result.outcome !== "loss") continue;
    if (!best || severity(result) > severity(best.result)) best = { config, result };
  }
  if (!best) return null;
  return {
    pokemon,
    rank,
    usagePercent,
    id: normalizeId(pokemon.id),
    template: best.config.template,
    changes: [],
    set: { ...best.config.set, source: { spread: "theory", spreadName: "", teams: pokemon.champions?.usageCount ?? 0 } },
    result: best.result,
    pattern: threatPattern(best.result),
  };
}

// Margin is their turns minus ours, so the most negative margin is the worst loss.
function severity(result) {
  return (result.decisive ? 100 : 0) - result.margin;
}

/**
 * Splits rarely used threats into those that beat you in a way no more common threat does
 * (`novel`, hard counters first) and the rest, grouped by the KO move's type (`repeats`,
 * largest group first). `coveredResults` are the race results already shown above.
 */
export function groupNicheThreats(rows = [], coveredResults = []) {
  const covered = new Set(coveredResults.map(threatPattern).filter(Boolean).map(({ key }) => key));
  const novel = [];
  const repeatsByType = new Map();
  for (const row of rows) {
    if (!covered.has(row.pattern?.key)) {
      novel.push(row);
      continue;
    }
    const type = row.pattern.type;
    repeatsByType.set(type, [...(repeatsByType.get(type) ?? []), row]);
  }
  const bySeverity = (a, b) => Number(b.result.decisive) - Number(a.result.decisive) || a.result.margin - b.result.margin ||
    (a.rank ?? Infinity) - (b.rank ?? Infinity) || String(a.pokemon.name).localeCompare(String(b.pokemon.name));
  return {
    novel: novel.sort(bySeverity),
    repeats: [...repeatsByType].map(([type, typeRows]) => ({ type, rows: typeRows.sort(bySeverity) }))
      .sort((a, b) => b.rows.length - a.rows.length || a.type.localeCompare(b.type)),
  };
}

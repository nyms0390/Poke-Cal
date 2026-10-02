// Pure data-quality checks for the generated catalogs in public/*.json.
//
// Sync scripts and `scripts/validate-data.mjs` use these checks to fail closed when an upstream
// source silently degrades (an empty Limitless tournament list, an empty NCP setdex, a Smogon
// month without data, HTML instead of a PokeAPI CSV, ...). Each metric has an absolute minimum
// and may not shrink by more than `maxShrink` versus a baseline (normally the committed data).

const CJK_PATTERN = /[㐀-鿿豈-﫿]/u;

export const DEFAULT_MAX_SHRINK = 0.25;

// Minimums are set well below the committed data as of 2026-10 so that ordinary churn
// (rotating tournaments, a new Smogon regulation, Showdown cleanups) passes, while an empty or
// truncated upstream response does not. Committed values at the time are noted per metric.
export const DEFAULT_MINIMUMS = Object.freeze({
  pokemon: 1000, // 1380 species/forms
  championsLegalPokemon: 250, // 358
  legalPokemonWithUsage: 150, // 300 with Limitless usageCount > 0
  legalPokemonWithSpreads: 100, // 278 with Smogon SP spreads
  legalPokemonWithNcpSets: 40, // 90 with NCP curated sets
  pokemonWithZhAliases: 1000, // 1380 with a Traditional Chinese alias
  legalPokemonWithZhAliases: 250, // 358
  moves: 800, // 954
  championsLegalMoves: 350, // 515
  movesWithZhAliases: 700, // 917
  items: 400, // 583
  championsLegalItems: 100, // 166
  itemsWithZhAliases: 350, // 529
  abilities: 250, // 321
  abilitiesWithZhAliases: 230, // 311
  teamTournaments: 3, // 10 archived Limitless brackets
  teamCount: 24, // 92 archived top-cut teams
});

// Which metrics each generated source is responsible for. A sync script checks only the metrics
// its own output determines; `validate-data` checks all of them.
export const METRIC_GROUPS = Object.freeze({
  showdown: [
    "pokemon",
    "championsLegalPokemon",
    "pokemonWithZhAliases",
    "legalPokemonWithZhAliases",
    "moves",
    "championsLegalMoves",
    "movesWithZhAliases",
    "items",
    "championsLegalItems",
    "itemsWithZhAliases",
    "abilities",
    "abilitiesWithZhAliases",
  ],
  limitless: ["legalPokemonWithUsage", "teamTournaments", "teamCount"],
  smogon: ["legalPokemonWithSpreads"],
  ncp: ["legalPokemonWithNcpSets"],
});

export const METRIC_NAMES = Object.freeze(Object.keys(DEFAULT_MINIMUMS));

// `catalogs` is `{ pokemon, abilities, moves, items, teams }` as parsed from public/*.json
// (teams = limitless-teams.json). Missing catalogs produce `null` metrics, which fail the
// minimum check for any metric that is requested.
export function computeCatalogMetrics({ pokemon, abilities, moves, items, teams } = {}) {
  const pokemonList = asArray(pokemon);
  const legalPokemon = pokemonList?.filter(isChampionsLegal);
  const moveList = asArray(moves);
  const itemList = asArray(items);
  const abilityList = asArray(abilities);
  const tournaments = Array.isArray(teams?.tournaments) ? teams.tournaments : null;

  return {
    pokemon: pokemonList?.length ?? null,
    championsLegalPokemon: legalPokemon?.length ?? null,
    legalPokemonWithUsage: countWhere(legalPokemon, (entry) => entry.champions?.usageCount > 0),
    legalPokemonWithSpreads: countWhere(
      legalPokemon,
      (entry) => entry.champions?.usage?.spreads?.length > 0,
    ),
    legalPokemonWithNcpSets: countWhere(
      legalPokemon,
      (entry) => entry.champions?.ncp?.sets?.length > 0,
    ),
    pokemonWithZhAliases: countWhere(pokemonList, hasZhAlias),
    legalPokemonWithZhAliases: countWhere(legalPokemon, hasZhAlias),
    moves: moveList?.length ?? null,
    championsLegalMoves: countWhere(moveList, isChampionsLegal),
    movesWithZhAliases: countWhere(moveList, hasZhAlias),
    items: itemList?.length ?? null,
    championsLegalItems: countWhere(itemList, isChampionsLegal),
    itemsWithZhAliases: countWhere(itemList, hasZhAlias),
    abilities: abilityList?.length ?? null,
    abilitiesWithZhAliases: countWhere(abilityList, hasZhAlias),
    teamTournaments: tournaments?.length ?? null,
    teamCount: tournaments
      ? tournaments.reduce(
          (sum, tournament) => sum + (Array.isArray(tournament?.topCut) ? tournament.topCut.length : 0),
          0,
        )
      : null,
  };
}

// Returns `{ ok, errors, metrics }`. `baseline` is either a metrics object or catalogs; when
// present, every checked metric may shrink by at most `maxShrink` (0.25 = 25%) versus it.
// `metrics` restricts the checks to the named metrics (default: all).
export function validateCatalogMetrics(
  metrics,
  {
    baseline,
    minimums = DEFAULT_MINIMUMS,
    maxShrink = DEFAULT_MAX_SHRINK,
    metrics: metricNames = METRIC_NAMES,
    allowShrink = false,
  } = {},
) {
  const errors = [];

  for (const name of metricNames) {
    const value = metrics?.[name];
    const minimum = minimums[name] ?? 0;
    if (!Number.isFinite(value)) {
      errors.push(`${name}: missing (expected at least ${minimum})`);
      continue;
    }
    if (value < minimum) {
      errors.push(`${name}: ${value} is below the minimum of ${minimum}`);
    }

    const previous = baseline?.[name];
    if (allowShrink || !Number.isFinite(previous) || previous <= 0) continue;
    const floor = Math.ceil(previous * (1 - maxShrink));
    if (value < floor) {
      const shrink = Math.round((1 - value / previous) * 100);
      errors.push(
        `${name}: ${value} shrank ${shrink}% from baseline ${previous} ` +
          `(more than the allowed ${Math.round(maxShrink * 100)}%)`,
      );
    }
  }

  return { ok: errors.length === 0, errors, metrics };
}

export function validateCatalogs(catalogs, { baseline, ...options } = {}) {
  const baselineMetrics = baseline && !isMetrics(baseline) ? computeCatalogMetrics(baseline) : baseline;
  return validateCatalogMetrics(computeCatalogMetrics(catalogs), {
    ...options,
    baseline: baselineMetrics,
  });
}

// Throws with every failed check listed; used by the sync scripts before writing anything.
export function assertValidCatalogs(catalogs, { label = "Generated data", ...options } = {}) {
  const result = validateCatalogs(catalogs, options);
  if (!result.ok) {
    throw new Error(
      `${label} failed validation; nothing was written:\n  - ${result.errors.join("\n  - ")}`,
    );
  }
  return result;
}

function isMetrics(value) {
  if (!value || typeof value !== "object") return false;
  const looksLikeCatalogs =
    ["pokemon", "abilities", "moves", "items"].some((name) => Array.isArray(value[name])) ||
    (value.teams && typeof value.teams === "object");
  return !looksLikeCatalogs;
}

function asArray(value) {
  return Array.isArray(value) ? value : null;
}

function countWhere(entries, predicate) {
  return entries ? entries.filter((entry) => entry && predicate(entry)).length : null;
}

function isChampionsLegal(entry) {
  return entry?.champions?.legal === true;
}

function hasZhAlias(entry) {
  return Array.isArray(entry.aliases) && entry.aliases.some((alias) => CJK_PATTERN.test(String(alias)));
}

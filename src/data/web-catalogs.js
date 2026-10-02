// Pure derivation of the slim browser catalogs in public/web/*.json from the full generated
// catalogs in public/*.json. The browser only ever keeps Champions-legal entries (plus Mega forms
// of legal species and abilities those Pokémon reference), so `scripts/build-web-catalogs.mjs`
// applies that selection ahead of time, drops fields no page reads, and writes minified JSON.
// The full catalogs stay in public/*.json for the MCP Worker, scripts, and agent skills.
//
// Browser-safe: no Node imports. `src/data/data.js` re-applies `selectChampionsCatalogs` to the
// fetched slim files, which is idempotent.

export const WEB_CATALOG_NAMES = Object.freeze([
  "pokemon",
  "abilities",
  "moves",
  "items",
  "limitless-teams",
]);

// Per-generation history overrides from Showdown (`gen8: { desc, shortDesc }`, `gen7letsgo`,
// `gen8bdsp`, ...). No browser code reads them; `gen` (the numeric introduction generation) is
// kept.
const GENERATION_HISTORY_KEY = /^gen\d+[a-z]*$/;

export function selectChampionsCatalogs({ pokemon, abilities, moves, items }) {
  const championPokemon = includeMegaFamilies(championsEntries(pokemon), pokemon);
  const championAbilities = includeNamedEntries(
    championsEntries(abilities),
    abilities,
    championPokemon.flatMap((entry) => entry.abilities ?? []),
  );
  return {
    pokemon: championPokemon,
    abilities: championAbilities,
    moves: championsEntries(moves),
    items: championsEntries(items),
  };
}

export function deriveWebCatalogs({ pokemon, abilities, moves, items, teams }) {
  const selected = selectChampionsCatalogs({ pokemon, abilities, moves, items });
  return {
    pokemon: selected.pokemon,
    abilities: selected.abilities.map(stripGenerationHistory),
    moves: selected.moves.map(stripGenerationHistory),
    items: selected.items.map(stripGenerationHistory),
    "limitless-teams": teams,
  };
}

export function serializeWebCatalog(value) {
  return `${JSON.stringify(value)}\n`;
}

export function stripGenerationHistory(entry) {
  if (!Object.keys(entry).some((key) => GENERATION_HISTORY_KEY.test(key))) return entry;
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => !GENERATION_HISTORY_KEY.test(key)),
  );
}

export function championsEntries(entries) {
  const hasLegality = entries.some((entry) => typeof entry.champions?.legal === "boolean");
  if (hasLegality) return entries.filter((entry) => entry.champions?.legal === true);

  const filtered = entries.filter((entry) => entry.champions);
  return filtered.length > 0 ? filtered : entries;
}

export function includeMegaFamilies(entries, allPokemon) {
  if (entries.length === allPokemon.length) return entries;

  const retainedIds = new Set(entries.map((entry) => entry.id));
  const retainedBaseSpecies = new Set(entries.map((entry) => entry.baseSpecies ?? entry.name));
  return allPokemon.filter(
    (entry) =>
      retainedIds.has(entry.id) ||
      (retainedBaseSpecies.has(entry.baseSpecies) &&
        entry.name.includes("-Mega") &&
        entry.champions?.legal !== false),
  );
}

export function includeNamedEntries(entries, allEntries, names) {
  if (entries.length === allEntries.length) return entries;

  const retainedIds = new Set(entries.map((entry) => entry.id));
  const retainedNames = new Set(entries.map((entry) => entry.name));
  for (const name of names) {
    retainedNames.add(name);
  }

  return allEntries.filter((entry) => retainedIds.has(entry.id) || retainedNames.has(entry.name));
}

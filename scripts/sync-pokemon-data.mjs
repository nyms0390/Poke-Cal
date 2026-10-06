import {
  applyChampionsData,
  championsModBaseUrl,
  showdownDataBaseUrl,
} from "../src/data/champions-data.js";
import { normalizeId } from "../src/identifiers.js";
import { applyZhTwNameOverrides } from "../src/locales/zh-tw-name-overrides.js";
import {
  extractAbilities,
  extractCatalogEntries,
  extractLearnsetMoves,
  parseShowdownExport,
} from "../src/data/showdown-data.js";
import { METRIC_GROUPS, assertValidCatalogs } from "../src/data/catalog-validation.js";
import {
  fetchText as fetchUpstreamText,
  hasFlag,
  isMainModule,
  readCatalogs,
  writeJsonEntries,
} from "./lib/sync-utils.mjs";
import { readShowdownPin } from "./lib/showdown-pin.mjs";

// Showdown base data, text, and the Champions mod are fetched from the commit pinned in
// scripts/showdown-pin.json (see scripts/bump-showdown-pin.mjs). PokeAPI stays on `master`.
export function showdownUrls(pin) {
  const data = showdownDataBaseUrl(pin);
  const mod = championsModBaseUrl(pin);
  return {
    pokedex: `${data}/pokedex.ts`,
    learnsets: `${data}/learnsets.ts`,
    abilities: `${data}/abilities.ts`,
    moves: `${data}/moves.ts`,
    items: `${data}/items.ts`,
    abilitiesText: `${data}/text/abilities.ts`,
    movesText: `${data}/text/moves.ts`,
    itemsText: `${data}/text/items.ts`,
    championsFormatsData: `${mod}/formats-data.ts`,
    championsLearnsets: `${mod}/learnsets.ts`,
    championsAbilities: `${mod}/abilities.ts`,
    championsMoves: `${mod}/moves.ts`,
    championsItems: `${mod}/items.ts`,
  };
}

const SPECIES_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const MOVE_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv";
const ABILITY_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/ability_names.csv";
const ITEMS_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/items.csv";
const ITEM_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/item_names.csv";

const outputDirectory = new URL("../public/", import.meta.url);
const TRADITIONAL_CHINESE_LANGUAGE_ID = 4;

// `pin` defaults to scripts/showdown-pin.json; pass `{ repo, commit }` to sync another commit.
export async function downloadEverything(fetcher = fetchText, { pin } = {}) {
  const showdown = showdownUrls(pin ?? (await readShowdownPin()));
  const [
    pokedexSource,
    learnsetsSource,
    abilitiesSource,
    movesSource,
    itemsSource,
    abilitiesTextSource,
    movesTextSource,
    itemsTextSource,
    championsFormatsDataSource,
    championsLearnsetsSource,
    championsAbilitiesSource,
    championsMovesSource,
    championsItemsSource,
    speciesNamesCsv,
    moveNamesCsv,
    abilityNamesCsv,
    itemsCsv,
    itemNamesCsv,
  ] = await Promise.all([
    fetcher(showdown.pokedex),
    fetcher(showdown.learnsets),
    fetcher(showdown.abilities),
    fetcher(showdown.moves),
    fetcher(showdown.items),
    fetcher(showdown.abilitiesText),
    fetcher(showdown.movesText),
    fetcher(showdown.itemsText),
    fetcher(showdown.championsFormatsData),
    fetcher(showdown.championsLearnsets),
    fetcher(showdown.championsAbilities),
    fetcher(showdown.championsMoves),
    fetcher(showdown.championsItems),
    fetcher(SPECIES_NAMES_URL),
    fetcher(MOVE_NAMES_URL),
    fetcher(ABILITY_NAMES_URL),
    fetcher(ITEMS_URL),
    fetcher(ITEM_NAMES_URL),
  ]);

  const pokedex = parseShowdownExport(pokedexSource, "Pokedex");
  const learnsets = parseShowdownExport(learnsetsSource, "Learnsets");
  const abilities = parseShowdownExport(abilitiesSource, "Abilities");
  const moves = parseShowdownExport(movesSource, "Moves");
  const items = parseShowdownExport(itemsSource, "Items");
  const abilitiesText = parseShowdownExport(abilitiesTextSource, "AbilitiesText");
  const movesText = parseShowdownExport(movesTextSource, "MovesText");
  const itemsText = parseShowdownExport(itemsTextSource, "ItemsText");
  const championsMod = {
    formatsData: parseShowdownExport(championsFormatsDataSource, "FormatsData"),
    learnsets: parseShowdownExport(championsLearnsetsSource, "Learnsets"),
    abilities: parseShowdownExport(championsAbilitiesSource, "Abilities"),
    moves: parseShowdownExport(championsMovesSource, "Moves"),
    items: parseShowdownExport(championsItemsSource, "Items"),
  };
  const aliasesByNumber = parseTraditionalChineseNames(speciesNamesCsv);
  const moveAliasesByNumber = parseLocalizedNamesByNumber(moveNamesCsv);
  const abilityAliasesByNumber = parseLocalizedNamesByNumber(abilityNamesCsv);
  const itemIdsByIdentifier = parsePokeApiItemIds(itemsCsv);
  const itemAliasesByNumber = parseLocalizedNamesByNumber(itemNamesCsv);

  // Hand-maintained zh-TW names (src/locales/zh-tw-name-overrides.js) win over PokeAPI.
  return applyZhTwNameOverrides(applyChampionsData(
    {
      pokemon: buildPokemon(pokedex, learnsets, aliasesByNumber),
      abilities: attachNumberedAliases(
        extractCatalogEntries(abilities, abilitiesText),
        abilityAliasesByNumber,
      ),
      moves: attachNumberedAliases(extractCatalogEntries(moves, movesText), moveAliasesByNumber),
      items: attachIdentifierAliases(
        extractCatalogEntries(items, itemsText),
        itemIdsByIdentifier,
        itemAliasesByNumber,
      ),
    },
    championsMod,
  ));
}

export async function writeEverything(data, directory = outputDirectory) {
  await writeJsonEntries(directory, data);
}

// Downloads, validates (fail closed: nothing is written when the fresh catalogs fail the
// Showdown/PokeAPI checks in src/data/catalog-validation.js, using the current files in
// `directory` as the shrink baseline), then writes.
export async function syncPokemonData({
  fetcher = fetchText,
  directory = outputDirectory,
  allowShrink = false,
  minimums,
  pin,
} = {}) {
  const data = await downloadEverything(fetcher, { pin });
  const baseline = await readCatalogs(directory);
  assertValidCatalogs(data, {
    label: "Showdown/PokeAPI catalogs",
    baseline,
    metrics: METRIC_GROUPS.showdown,
    allowShrink,
    ...(minimums ? { minimums } : {}),
  });
  await writeEverything(data, directory);
  return data;
}

function buildPokemon(pokedex, learnsets, aliasesByNumber) {
  return Object.entries(pokedex)
    .filter(([, entry]) => Number.isInteger(entry.num) && entry.num > 0 && entry.baseStats?.spe)
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      baseSpecies: entry.baseSpecies ?? entry.name,
      ...(entry.battleOnly ? { battleOnly: entry.battleOnly } : {}),
      types: [...(entry.types ?? [])],
      baseStats: { ...entry.baseStats },
      baseSpeed: entry.baseStats.spe,
      weightkg: entry.weightkg,
      abilities: extractAbilities(entry, { megaOnly: /-Mega(?:-|$)/i.test(entry.name ?? "") }),
      moves: extractLearnsetMoves(learnsets, id, entry.baseSpecies ?? entry.name),
      aliases: aliasesByNumber.get(entry.num) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function fetchText(url) {
  return fetchUpstreamText(url);
}

function parseTraditionalChineseNames(csv) {
  const names = new Map();

  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [numberText, languageText, name] = parseCsvLine(line);
    const number = Number(numberText);
    const language = Number(languageText);
    if (!Number.isInteger(number) || language !== TRADITIONAL_CHINESE_LANGUAGE_ID || !name) {
      continue;
    }

    const aliases = names.get(number) ?? [];
    if (!aliases.includes(name)) aliases.push(name);
    names.set(number, aliases);
  }

  return names;
}

function parseLocalizedNamesByNumber(csv) {
  const names = new Map();

  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [numberText, languageText, name] = parseCsvLine(line);
    const number = Number(numberText);
    const language = Number(languageText);
    if (!Number.isInteger(number) || language !== TRADITIONAL_CHINESE_LANGUAGE_ID || !name) {
      continue;
    }

    names.set(number, [name]);
  }

  return names;
}

function parsePokeApiItemIds(csv) {
  const ids = new Map();

  for (const line of csv.split(/\r?\n/).slice(1)) {
    if (!line) continue;
    const [idText, identifier] = parseCsvLine(line);
    const id = Number(idText);
    if (!Number.isInteger(id) || !identifier) continue;
    ids.set(normalizeId(identifier), id);
  }

  return ids;
}

function attachNumberedAliases(entries, aliasesByNumber) {
  return entries.map((entry) => attachAliases(entry, aliasesByNumber.get(entry.num)));
}

function attachIdentifierAliases(entries, idsByIdentifier, aliasesByNumber) {
  return entries.map((entry) => {
    const pokeApiId = idsByIdentifier.get(normalizeId(entry.id));
    return attachAliases(entry, aliasesByNumber.get(pokeApiId));
  });
}

function attachAliases(entry, aliases = []) {
  const uniqueAliases = [...new Set(aliases)].filter((alias) => alias && alias !== entry.name);
  return uniqueAliases.length > 0 ? { ...entry, aliases: uniqueAliases } : entry;
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields;
}

if (isMainModule(import.meta.url)) {
  try {
    const pin = await readShowdownPin();
    const data = await syncPokemonData({ pin, allowShrink: hasFlag(process.argv, "--allow-shrink") });
    console.log(
      `Wrote ${data.pokemon.length} Pokémon/forms, ${data.items.length} items, ` +
        `${data.abilities.length} abilities, and ${data.moves.length} moves to public/*.json ` +
        `(Showdown ${pin.repo}@${pin.commit})`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

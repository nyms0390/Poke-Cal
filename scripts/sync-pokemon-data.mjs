import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { CHAMPIONS_MOD_BASE_URL, applyChampionsData } from "../src/champions-data.js";
import {
  extractAbilities,
  extractCatalogEntries,
  extractLearnsetMoves,
  parseShowdownExport,
} from "../src/showdown-data.js";

const SHOWDOWN_POKEDEX_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/pokedex.ts";
const SHOWDOWN_LEARNSETS_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/learnsets.ts";
const SHOWDOWN_ABILITIES_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/abilities.ts";
const SHOWDOWN_MOVES_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/moves.ts";
const SHOWDOWN_ITEMS_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/items.ts";
const SHOWDOWN_ABILITIES_TEXT_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/abilities.ts";
const SHOWDOWN_MOVES_TEXT_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/moves.ts";
const SHOWDOWN_ITEMS_TEXT_URL =
  "https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/items.ts";
const CHAMPIONS_FORMATS_DATA_URL = `${CHAMPIONS_MOD_BASE_URL}/formats-data.ts`;
const CHAMPIONS_LEARNSETS_URL = `${CHAMPIONS_MOD_BASE_URL}/learnsets.ts`;
const CHAMPIONS_ABILITIES_URL = `${CHAMPIONS_MOD_BASE_URL}/abilities.ts`;
const CHAMPIONS_MOVES_URL = `${CHAMPIONS_MOD_BASE_URL}/moves.ts`;
const CHAMPIONS_ITEMS_URL = `${CHAMPIONS_MOD_BASE_URL}/items.ts`;
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

export async function downloadEverything(fetcher = fetchText) {
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
    fetcher(SHOWDOWN_POKEDEX_URL),
    fetcher(SHOWDOWN_LEARNSETS_URL),
    fetcher(SHOWDOWN_ABILITIES_URL),
    fetcher(SHOWDOWN_MOVES_URL),
    fetcher(SHOWDOWN_ITEMS_URL),
    fetcher(SHOWDOWN_ABILITIES_TEXT_URL),
    fetcher(SHOWDOWN_MOVES_TEXT_URL),
    fetcher(SHOWDOWN_ITEMS_TEXT_URL),
    fetcher(CHAMPIONS_FORMATS_DATA_URL),
    fetcher(CHAMPIONS_LEARNSETS_URL),
    fetcher(CHAMPIONS_ABILITIES_URL),
    fetcher(CHAMPIONS_MOVES_URL),
    fetcher(CHAMPIONS_ITEMS_URL),
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

  return applyChampionsData(
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
  );
}

export async function writeEverything(data) {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all(
    Object.entries(data).map(([name, entries]) =>
      writeFile(new URL(`${name}.json`, outputDirectory), `${JSON.stringify(entries, null, 2)}\n`),
    ),
  );
}

function buildPokemon(pokedex, learnsets, aliasesByNumber) {
  return Object.entries(pokedex)
    .filter(([, entry]) => Number.isInteger(entry.num) && entry.num > 0 && entry.baseStats?.spe)
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      baseSpecies: entry.baseSpecies ?? entry.name,
      types: [...(entry.types ?? [])],
      baseStats: { ...entry.baseStats },
      baseSpeed: entry.baseStats.spe,
      weightkg: entry.weightkg,
      abilities: extractAbilities(entry),
      moves: extractLearnsetMoves(learnsets, id, entry.baseSpecies ?? entry.name),
      aliases: aliasesByNumber.get(entry.num) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
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
    ids.set(normalizePokeApiIdentifier(identifier), id);
  }

  return ids;
}

function attachNumberedAliases(entries, aliasesByNumber) {
  return entries.map((entry) => attachAliases(entry, aliasesByNumber.get(entry.num)));
}

function attachIdentifierAliases(entries, idsByIdentifier, aliasesByNumber) {
  return entries.map((entry) => {
    const pokeApiId = idsByIdentifier.get(normalizePokeApiIdentifier(entry.id));
    return attachAliases(entry, aliasesByNumber.get(pokeApiId));
  });
}

function attachAliases(entry, aliases = []) {
  const uniqueAliases = [...new Set(aliases)].filter((alias) => alias && alias !== entry.name);
  return uniqueAliases.length > 0 ? { ...entry, aliases: uniqueAliases } : entry;
}

function normalizePokeApiIdentifier(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = await downloadEverything();
  await writeEverything(data);
  console.log(
    `Wrote ${data.pokemon.length} Pokémon/forms, ${data.items.length} items, ` +
      `${data.abilities.length} abilities, and ${data.moves.length} moves to public/*.json`,
  );
}

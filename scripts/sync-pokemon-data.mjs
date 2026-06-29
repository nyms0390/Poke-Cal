import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

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
const SPECIES_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";

const outputDirectory = new URL("../public/", import.meta.url);

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
    speciesNamesCsv,
  ] = await Promise.all([
    fetcher(SHOWDOWN_POKEDEX_URL),
    fetcher(SHOWDOWN_LEARNSETS_URL),
    fetcher(SHOWDOWN_ABILITIES_URL),
    fetcher(SHOWDOWN_MOVES_URL),
    fetcher(SHOWDOWN_ITEMS_URL),
    fetcher(SHOWDOWN_ABILITIES_TEXT_URL),
    fetcher(SHOWDOWN_MOVES_TEXT_URL),
    fetcher(SHOWDOWN_ITEMS_TEXT_URL),
    fetcher(SPECIES_NAMES_URL),
  ]);

  const pokedex = parseShowdownExport(pokedexSource, "Pokedex");
  const learnsets = parseShowdownExport(learnsetsSource, "Learnsets");
  const abilities = parseShowdownExport(abilitiesSource, "Abilities");
  const moves = parseShowdownExport(movesSource, "Moves");
  const items = parseShowdownExport(itemsSource, "Items");
  const abilitiesText = parseShowdownExport(abilitiesTextSource, "AbilitiesText");
  const movesText = parseShowdownExport(movesTextSource, "MovesText");
  const itemsText = parseShowdownExport(itemsTextSource, "ItemsText");
  const aliasesByNumber = parseTraditionalChineseNames(speciesNamesCsv);

  return {
    pokemon: buildPokemon(pokedex, learnsets, aliasesByNumber),
    abilities: extractCatalogEntries(abilities, abilitiesText),
    moves: extractCatalogEntries(moves, movesText),
    items: extractCatalogEntries(items, itemsText),
  };
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
    if (!Number.isInteger(number) || language !== 4 || !name) continue;

    const aliases = names.get(number) ?? [];
    if (!aliases.includes(name)) aliases.push(name);
    names.set(number, aliases);
  }

  return names;
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

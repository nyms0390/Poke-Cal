import { mkdir, writeFile } from "node:fs/promises";
import vm from "node:vm";

const SHOWDOWN_URL = "https://play.pokemonshowdown.com/data/pokedex.js";
const SPECIES_NAMES_URL =
  "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const outputPath = new URL("../public/pokemon.json", import.meta.url);

const [showdownSource, speciesNamesCsv] = await Promise.all([
  fetchText(SHOWDOWN_URL),
  fetchText(SPECIES_NAMES_URL),
]);

const pokedex = parseShowdownPokedex(showdownSource);
const aliasesByNumber = parseTraditionalChineseNames(speciesNamesCsv);
const pokemon = Object.entries(pokedex)
  .filter(([, entry]) => Number.isInteger(entry.num) && entry.num > 0 && entry.baseStats?.spe)
  .map(([id, entry]) => ({
    id,
    name: entry.name,
    baseSpecies: entry.baseSpecies ?? entry.name,
    baseStats: entry.baseStats,
    baseSpeed: entry.baseStats.spe,
    aliases: aliasesByNumber.get(entry.num) ?? [],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(pokemon, null, 2)}\n`);
console.log(`Wrote ${pokemon.length} Pokémon and forms to public/pokemon.json`);

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}

function parseShowdownPokedex(source) {
  const sandbox = { exports: {} };
  vm.runInNewContext(source, sandbox, { timeout: 5000 });
  const pokedex = sandbox.BattlePokedex ?? sandbox.exports.BattlePokedex;
  if (!pokedex || typeof pokedex !== "object") {
    throw new Error("Pokémon Showdown pokedex.js did not expose BattlePokedex.");
  }
  return pokedex;
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

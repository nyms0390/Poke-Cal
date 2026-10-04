import { normalizeId } from "../identifiers.js";
import { extractLearnsetMoves } from "./showdown-data.js";

// Showdown data is fetched from a pinned commit (scripts/showdown-pin.json), never a branch, so a
// weekly sync only picks up catalog changes after the pin is bumped in a reviewed pull request.
const SHOWDOWN_REPO_PATTERN = /^(?!\.+\/)[A-Za-z0-9_.-]+\/(?!\.+$)[A-Za-z0-9_.-]+$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export function isValidShowdownPin(pin) {
  return (
    typeof pin?.repo === "string" &&
    SHOWDOWN_REPO_PATTERN.test(pin.repo) &&
    typeof pin?.commit === "string" &&
    COMMIT_SHA_PATTERN.test(pin.commit)
  );
}

// `https://raw.githubusercontent.com/<repo>/<commit>/data` for a `{ repo, commit }` pin. Throws
// unless `commit` is a full 40-character lowercase SHA (branch names and short SHAs are refused).
export function showdownDataBaseUrl(pin) {
  if (!isValidShowdownPin(pin)) {
    throw new Error(
      `Invalid Showdown pin ${JSON.stringify(pin)}: expected { repo: "owner/name", commit: <40-hex SHA> }`,
    );
  }
  return `https://raw.githubusercontent.com/${pin.repo}/${pin.commit}/data`;
}

export function championsModBaseUrl(pin) {
  return `${showdownDataBaseUrl(pin)}/mods/champions`;
}

export function isChampionsLegalFormatsEntry(formatsEntry) {
  if (!formatsEntry) return false;
  if (formatsEntry.isNonstandard) return false;
  return formatsEntry.tier !== "Illegal";
}

export function applyChampionsData(data, mod) {
  const legalAbilityIds = new Set(
    data.pokemon
      .filter((entry) => isChampionsLegalFormatsEntry(mod.formatsData?.[entry.id] ?? mod.formatsData?.[normalizeId(entry.baseSpecies)]))
      .flatMap((entry) => entry.abilities ?? [])
      .map((ability) => normalizeId(ability)),
  );
  return {
    ...data,
    pokemon: applyChampionsPokemon(data.pokemon, mod),
    abilities: overlayCatalogEntries(data.abilities, mod.abilities, legalAbilityIds),
    moves: overlayCatalogEntries(data.moves, mod.moves),
    items: overlayCatalogEntries(data.items, mod.items),
  };
}

function applyChampionsPokemon(pokemon, { formatsData = {}, learnsets = {} }) {
  return pokemon.map((entry) => {
    const formatsEntry = formatsData[entry.id] ?? formatsData[normalizeId(entry.baseSpecies)];
    const legal = isChampionsLegalFormatsEntry(formatsEntry);
    const championsMoves = extractLearnsetMoves(learnsets, entry.id, entry.baseSpecies);
    const champions = { ...entry.champions, legal };

    if (legal && formatsEntry?.tier) champions.tier = formatsEntry.tier;
    else delete champions.tier;

    return {
      ...entry,
      moves: legal && championsMoves.length > 0 ? championsMoves : entry.moves,
      champions,
    };
  });
}

function overlayCatalogEntries(entries, modTable = {}, legalIds = new Set()) {
  return entries.map((entry) => {
    const overridden = overlayEntry(entry, modTable[entry.id]);
    return {
      ...overridden,
      champions: { ...entry.champions, legal: legalIds.has(entry.id) || !overridden.isNonstandard },
    };
  });
}

function overlayEntry(entry, modEntry) {
  if (!modEntry) return entry;

  const overridden = { ...entry };
  for (const [key, value] of Object.entries(modEntry)) {
    if (key === "inherit") continue;
    if (value === undefined) {
      delete overridden[key];
    } else if (typeof value !== "function") {
      overridden[key] = toSerializableValue(value);
    }
  }
  return overridden;
}

function toSerializableValue(value) {
  if (Array.isArray(value)) return value.map(toSerializableValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, childValue]) => typeof childValue !== "function")
      .map(([key, childValue]) => [key, toSerializableValue(childValue)]),
  );
}

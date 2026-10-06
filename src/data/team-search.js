import { localizedName } from "../i18n.js";
import { normalizeId } from "../identifiers.js";
import { normalizeSearch } from "./pokemon.js";

// Keep CJK aliases, punctuation folding, and the two Nidoran identities intact.
function searchKey(value) {
  return normalizeSearch(String(value ?? "").replaceAll("♀", "f").replaceAll("♂", "m"));
}

export function archiveRegulations(archive) {
  return [...new Set((archive?.tournaments ?? [])
    .map((tournament) => tournament.format ?? archive.format)
    .filter((format) => /^M-[A-Z]+$/.test(format ?? "")))].sort();
}

export function teamPokemonSuggestions(query, pokemon = []) {
  const key = searchKey(query);
  if (!key) return [];
  const unique = new Map();
  for (const entry of pokemon) {
    const id = normalizeId(entry.id ?? entry.name);
    if (id && !unique.has(id)) unique.set(id, entry);
  }
  return [...unique.values()]
    .map((entry) => {
      const names = [entry.id, entry.name, localizedName(entry, "zh-TW"), ...(entry.aliases ?? [])]
        .map(searchKey).filter(Boolean);
      const score = names.includes(key) ? 0
        : names.some((name) => name.startsWith(key)) ? 1
          : names.some((name) => name.includes(key)) ? 2 : Infinity;
      return { entry, score };
    })
    .filter(({ score }) => score < Infinity)
    .sort((a, b) => a.score - b.score || localizedName(a.entry).localeCompare(localizedName(b.entry)))
    .map(({ entry }) => entry);
}

export function completeTeamQuery(query, name) {
  const text = String(query ?? "");
  const prefix = text.slice(0, text.lastIndexOf("+") + 1);
  return prefix ? `${prefix} ${name}` : name;
}

export function resolveTeamQuery(query, pokemon = []) {
  const text = String(query ?? "").trim();
  const terms = text.split("+").map((term) => term.trim()).filter(Boolean);
  const ids = [];
  const unknown = [];
  const ambiguous = [];
  for (const term of terms) {
    const key = searchKey(term);
    const exact = key ? pokemon.filter((entry) => [entry.id, entry.name, localizedName(entry, "zh-TW")].some((value) => searchKey(value) === key)) : [];
    let matches = exact.length ? exact : key ? pokemon.filter((entry) =>
      (entry.aliases ?? []).some((alias) => searchKey(alias) === key)) : [];
    // Form catalogs share the species' Chinese alias. The bare alias names the base form.
    const base = matches.filter((entry) => !entry.baseSpecies || normalizeId(entry.baseSpecies) === normalizeId(entry.id));
    if (!exact.length && base.length) matches = base;
    const matchIds = [...new Set(matches.map((entry) => normalizeId(entry.id ?? entry.name)).filter(Boolean))];
    if (matchIds.length === 0) unknown.push(term);
    else if (matchIds.length > 1) ambiguous.push(term);
    else if (!ids.includes(matchIds[0])) ids.push(matchIds[0]);
  }
  const error = unknown.length ? { code: "unknown", terms: unknown }
    : ambiguous.length ? { code: "ambiguous", terms: ambiguous }
      : ids.length > 6 ? { code: "tooMany", terms: [] }
        : text && !terms.length ? { code: "empty", terms: [] } : null;
  return { ids, error, searching: Boolean(text) };
}

export function searchTeamArchive(archive, { format, query = "", pokemon = [] } = {}) {
  // Historical submitted forms remain searchable even if absent from today's browser catalog.
  const historical = (archive?.tournaments ?? []).flatMap((tournament) =>
    tournament.topCut.flatMap((team) => team.pokemon ?? []));
  const resolved = resolveTeamQuery(query, [...pokemon, ...historical]);
  if (resolved.error) return { ...resolved, tournaments: [], teamCount: 0 };
  const tournaments = (archive?.tournaments ?? [])
    .filter((tournament) => (tournament.format ?? archive.format) === format && /^M-[A-Z]+$/.test(format ?? ""))
    .map((tournament) => {
      if (!resolved.searching) return tournament;
      const topCut = tournament.topCut.filter((team) => {
        const submitted = new Set((team.pokemon ?? []).map((entry) => normalizeId(entry.id ?? entry.name)));
        return resolved.ids.every((id) => submitted.has(id));
      });
      return { ...tournament, topCut };
    })
    .filter((tournament) => !resolved.searching || tournament.topCut.length > 0);
  return { ...resolved, tournaments, teamCount: tournaments.reduce((sum, tournament) => sum + tournament.topCut.length, 0) };
}

// The working team (docs/DECISIONS.md "Shared team panel"): the shared active set is the set every
// page edits, and the selected My teams team is the saved list it can be loaded from and saved
// to. A member is matched to the active set by species (a team holds one of each), so whether the
// set is a free set, a saved member or an edited member is derived, never stored.
import { activeSetFromState } from "./active-set.js";
import { normalizeId } from "./catalog.js";
import { applyParsedMember, parseTeamMembers } from "./my-teams.js";
import { formatSetPaste, parseSetPaste } from "./set-paste.js";
import { championsDefaultsForPokemon } from "./usage-defaults.js";

function pasteCatalogs(catalogs) {
  return {
    pokemon: catalogs?.pokemon ?? [],
    abilities: catalogs?.abilities ?? [],
    items: catalogs?.items ?? [],
    moves: catalogs?.moves ?? [],
  };
}

// The active set a parsed paste stands for: the Pokémon's defaults with the paste's fields on
// top, as Battle and Matchups load a member.
export function setFromParsed(parsed, catalogs) {
  const pokemon = parsed?.pokemon;
  if (!pokemon) return null;
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs?.abilityLookup,
    moveLookup: catalogs?.moveLookup,
    items: catalogs?.items ?? [],
  });
  const state = applyParsedMember({
    pokemon,
    nature: defaults.nature,
    sp: { ...defaults.sp },
    ability: defaults.ability ?? null,
    item: defaults.item ?? null,
    selectedMoveIds: [0, 1, 2, 3].map((index) => normalizeId(defaults.moves?.[index]?.id)),
  }, parsed);
  return activeSetFromState(state);
}

export function setFromPaste(text, catalogs) {
  return setFromParsed(parseSetPaste(text, pasteCatalogs(catalogs)), catalogs);
}

// The paste text a team member or saved set stores for an active set.
export function pasteFromSet(set, catalogs) {
  const pokemon = catalogs?.pokemon?.find((entry) => normalizeId(entry.id) === set?.pokemonId);
  if (!pokemon) return "";
  return formatSetPaste({
    pokemon,
    nature: set.nature,
    sp: set.sp,
    ability: set.abilityId ? catalogs.abilityLookup?.get(set.abilityId) ?? null : null,
    item: set.itemId ? catalogs.itemLookup?.get(set.itemId) ?? null : null,
    selectedMoveIds: set.moveIds.filter(Boolean),
  }, pasteCatalogs(catalogs));
}

// The fields a team member keeps. Move conditions, status and stages belong to the page, and
// both sides go through the same paste round trip, so a field a paste can't express (no item,
// an empty move slot) never reads as an edit.
function buildKey(set, catalogs) {
  const stored = set ? setFromPaste(pasteFromSet(set, catalogs), catalogs) ?? set : null;
  if (!stored) return "";
  return JSON.stringify([
    stored.pokemonId, stored.nature, stored.sp, stored.abilityId, stored.itemId, stored.moveIds.filter(Boolean),
  ]);
}

export function sameBuild(a, b, catalogs) {
  return buildKey(a, catalogs) === buildKey(b, catalogs);
}

// Each member of `team` as `{ index, pokemon, text, set }` (set is null for a paste that names
// no known Pokémon).
export function teamMemberSets(team, catalogs) {
  return parseTeamMembers(team, pasteCatalogs(catalogs)).map(({ text, parsed }, index) => ({
    index,
    pokemon: parsed.pokemon,
    text,
    set: setFromParsed(parsed, catalogs),
  }));
}

// Where the active set stands against the working team:
// - "none":   no set yet;
// - "free":   its Pokémon is not on the team (or there is no team);
// - "saved":  it is that member's build exactly;
// - "edited": it is a member whose build changed since it was loaded or saved.
// `index` is the member's place in the team, or -1.
export function teamSetStatus(activeSet, team, catalogs, members = teamMemberSets(team, catalogs)) {
  const pokemonId = normalizeId(activeSet?.pokemonId);
  if (!pokemonId) return { kind: "none", index: -1 };
  const member = team ? members.find(({ set }) => set?.pokemonId === pokemonId) : null;
  if (!member) return { kind: "free", index: -1 };
  return { kind: sameBuild(activeSet, member.set, catalogs) ? "saved" : "edited", index: member.index };
}

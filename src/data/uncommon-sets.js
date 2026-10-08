import { TYPE_EFFECTIVENESS } from "../engine/type-chart.js";
import { normalizeId } from "../identifiers.js";
import {
  COMMON_SHARE_PERCENT,
  matchup,
  megaStoneFor,
  observedMatchupSet,
  racePlan,
} from "./matchups.js";

/*
 * "Common Pokémon, uncommon sets": for a popular opponent whose usual set does not beat yours,
 * find the plausible set that does with the fewest choices its Limitless players rarely make.
 *
 * Theory sets combine a max-investment spread (an attacker, or a wall against the stat your
 * moves hit) with each of the Pokémon's abilities, a short list of plausible items, and its
 * strongest viable moves. Each ability, item, nature or KO move used on fewer than
 * COMMON_SHARE_PERCENT of its Limitless sets counts as one change; spreads never count, since
 * Limitless has none. Only Pokémon with at least UNCOMMON_MIN_TEAMS teams are checked, because
 * smaller samples cannot tell a rare choice from a common one.
 */

export const UNCOMMON_MIN_TEAMS = 20;
export const MAX_SET_CHANGES = 2;
const CANDIDATES_PER_CATEGORY = 6;
const ATE_ABILITIES = { pixilate: "Fairy", aerilate: "Flying", refrigerate: "Ice", galvanize: "Electric" };

const typeMultiplier = (type, defenderTypes = []) =>
  defenderTypes.reduce((total, defenderType) => total * (TYPE_EFFECTIVENESS[type]?.[defenderType] ?? 1), 1);
const usageShare = (entries, key) =>
  (entries ?? []).find((entry) => normalizeId(entry.id ?? entry.name) === normalizeId(key))?.usagePercent ?? 0;

/** Items that boost one type ("Holder's Fire-type attacks…") and berries that halve one. */
export function itemRoles(items = []) {
  const typeBoost = {};
  const resistBerry = {};
  for (const item of items) {
    if (item?.champions && !item.champions.legal) continue;
    const description = item?.shortDesc ?? "";
    const boost = !item?.isBerry && /Holder's (\w+)-type attacks/.exec(description);
    if (boost) typeBoost[boost[1]] = item;
    const resist = item?.isBerry && /damage taken from a supereffective (\w+)-type/i.exec(description);
    if (resist) resistBerry[resist[1]] = item;
  }
  return { typeBoost, resistBerry };
}

/**
 * The opponent's strongest race-eligible damaging moves into your types (top six per category
 * by a quick power estimate), plus every move on at least COMMON_SHARE_PERCENT of its sets.
 */
export function candidateMoves(opponent, ours, moveLookup) {
  const legal = (id) => {
    const move = moveLookup?.get(normalizeId(id));
    return move && (!move.champions || move.champions.legal) ? move : null;
  };
  const ateType = (opponent.abilities ?? []).map((name) => ATE_ABILITIES[normalizeId(name)]).find(Boolean);
  const scored = (opponent.moves ?? [])
    .map(legal)
    .filter((move) => move && racePlan(move, { terrain: "any" }).kind !== "exclude")
    .map((move) => {
      const type = ateType && move.type === "Normal" ? ateType : move.type;
      let power = (move.basePower || 80) * (type !== move.type ? 1.2 : 1);
      if (Array.isArray(move.multihit)) power *= 3;
      else if (typeof move.multihit === "number") power *= move.multihit;
      const accuracy = move.accuracy === true ? 1 : (move.accuracy ?? 100) / 100;
      const stab = (opponent.types ?? []).includes(type) ? 1.5 : 1;
      return { move, score: power * stab * accuracy * typeMultiplier(type, ours.pokemon.types) };
    })
    .filter(({ score }) => score > 0);
  const top = (category) => scored
    .filter(({ move }) => move.category === category)
    .sort((a, b) => b.score - a.score || a.move.id.localeCompare(b.move.id))
    .slice(0, CANDIDATES_PER_CATEGORY)
    .map(({ move }) => move);
  const common = (opponent.champions?.usage?.moves ?? [])
    .filter((entry) => (entry.usagePercent ?? 0) >= COMMON_SHARE_PERCENT)
    .map((entry) => legal(entry.id ?? entry.name))
    .filter((move) => move && move.category !== "Status");
  return [...new Map([...top("Physical"), ...top("Special"), ...common].map((move) => [move.id, move])).values()];
}

/** Theory configurations: spread template × ability × item, with the template's moves. */
export function theoryConfigs(opponent, ours, { abilityLookup, itemLookup, moveLookup, items = [] } = {}) {
  const moves = candidateMoves(opponent, ours, moveLookup);
  const { typeBoost, resistBerry } = itemRoles(items);
  const item = (id) => itemLookup?.get(id) ?? null;
  const stone = megaStoneFor(opponent, items);
  const abilities = (opponent.abilities ?? [])
    .map((name) => abilityLookup?.get(normalizeId(name)) ?? { id: normalizeId(name), name });
  const ourTypes = [...new Set(ours.moves.map((move) => move.type))];
  const resists = ourTypes.filter((type) => typeMultiplier(type, opponent.types) > 1).map((type) => resistBerry[type]);
  const observedItems = (opponent.champions?.usage?.items ?? [])
    .filter((entry) => (entry.usagePercent ?? 0) >= COMMON_SHARE_PERCENT)
    .map((entry) => item(normalizeId(entry.id ?? entry.name)))
    .filter((entry) => entry && !entry.megaStone);
  const defenseStats = [...new Set(ours.moves.map((move) => (move.category === "Special" ? "spd" : "def")))];

  const templates = [
    { key: "physicalAttacker", nature: "Adamant", sp: { hp: 32, atk: 32, def: 2 }, category: "Physical" },
    { key: "specialAttacker", nature: "Modest", sp: { hp: 32, spa: 32, def: 2 }, category: "Special" },
  ];
  for (const stat of defenseStats) {
    const physical = stat === "def";
    templates.push(
      { key: physical ? "physicalWall" : "specialWall", nature: physical ? "Impish" : "Careful", sp: { hp: 32, [stat]: 32, atk: 2 }, category: "Physical", wall: true },
      { key: physical ? "physicalWall" : "specialWall", nature: physical ? "Bold" : "Calm", sp: { hp: 32, [stat]: 32, spa: 2 }, category: "Special", wall: true },
    );
  }

  const configs = [];
  for (const template of templates) {
    const templateMoves = moves.filter((move) => move.category === template.category);
    if (templateMoves.length === 0) continue;
    const pool = stone
      ? [stone]
      : template.wall
        ? [item("leftovers"), item("sitrusberry"), item("focussash"), ...resists, ...observedItems]
        : [item("lifeorb"), item("expertbelt"), ...templateMoves.map((move) => typeBoost[move.type]),
          item("sitrusberry"), item("focussash"), ...resists, ...observedItems];
    const itemsForTemplate = [...new Map(pool.filter(Boolean).map((entry) => [entry.id, entry])).values()];
    for (const ability of abilities) {
      for (const heldItem of itemsForTemplate) {
        configs.push({
          template: template.key,
          set: {
            pokemon: opponent,
            nature: template.nature,
            sp: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...template.sp },
            ability,
            item: heldItem,
            moves: templateMoves,
          },
        });
      }
    }
  }
  return configs;
}

/**
 * Choices in a set that fewer than COMMON_SHARE_PERCENT of the Pokémon's Limitless sets make.
 * The KO move counts only when given. Returns parts as { kind, id, name }.
 */
export function setChanges(opponent, set, koMove = null) {
  const usage = opponent?.champions?.usage ?? {};
  const parts = [];
  if ((opponent.abilities ?? []).length > 1 && usageShare(usage.abilities, set.ability?.id ?? set.ability?.name) < COMMON_SHARE_PERCENT) {
    parts.push({ kind: "ability", id: normalizeId(set.ability?.id ?? set.ability?.name), name: set.ability?.name ?? "" });
  }
  if (!set.item?.megaStone && usageShare(usage.items, set.item?.id ?? set.item?.name) < COMMON_SHARE_PERCENT) {
    parts.push({ kind: "item", id: normalizeId(set.item?.id ?? set.item?.name), name: set.item?.name ?? "" });
  }
  if (usageShare(usage.natures, set.nature) < COMMON_SHARE_PERCENT) {
    parts.push({ kind: "nature", id: normalizeId(set.nature), name: set.nature });
  }
  if (koMove && usageShare(usage.moves, koMove.id ?? koMove.name) < COMMON_SHARE_PERCENT) {
    parts.push({ kind: "move", id: normalizeId(koMove.id ?? koMove.name), name: koMove.name ?? "" });
  }
  return parts;
}

/**
 * The fewest-change theory set that beats `ours` (outcome "loss" for you), or null. Configs are
 * tried in order of their ability/item/nature changes, and the search stops once no remaining
 * config can need fewer changes than the best set found.
 */
export function findUncommonSet(opponent, ours, lookups = {}, { field = {}, maxChanges = MAX_SET_CHANGES } = {}) {
  const configs = theoryConfigs(opponent, ours, lookups)
    .map((config) => ({ ...config, baseChanges: setChanges(opponent, config.set) }))
    .filter(({ baseChanges }) => baseChanges.length <= maxChanges)
    .sort((a, b) => a.baseChanges.length - b.baseChanges.length);
  let best = null;
  for (const config of configs) {
    if (best && config.baseChanges.length >= best.changes.length) break;
    const result = matchup({ ours, theirs: config.set, field });
    if (result.outcome !== "loss") continue;
    const changes = setChanges(opponent, config.set, result.theirs.best?.move);
    if (changes.length > maxChanges) continue;
    if (!best || changes.length < best.changes.length ||
      (changes.length === best.changes.length && severity(result) > severity(best.result))) {
      best = { template: config.template, set: config.set, result, changes };
    }
  }
  return best;
}

function severity(result) {
  return (result.decisive ? 100 : 0) - result.margin;
}

/** Opponents worth checking: a usage sample of at least `minTeams` teams. */
export function uncommonCandidates(opponents = [], { minTeams = UNCOMMON_MIN_TEAMS } = {}) {
  return opponents.filter(({ pokemon }) => (pokemon.champions?.usageCount ?? 0) >= minTeams);
}

/**
 * The row for one popular opponent, or null when it has no usual set or nothing within
 * `maxChanges` rare choices beats you. When its usual set already beats you, the row is that
 * set (`usualBeats: true`, no changes), so a popular Pokémon outside the page's top N is not
 * missed; the page hides the ones its "Beat you" list already shows.
 */
export function uncommonSetRow({ pokemon, rank, usagePercent }, ours, lookups = {}, { field = {}, maxChanges = MAX_SET_CHANGES } = {}) {
  if (!ours?.pokemon || ours.moves.length === 0) return null;
  const usual = observedMatchupSet(pokemon, lookups);
  if (!usual) return null;
  const usualResult = matchup({ ours, theirs: usual, field });
  const base = {
    pokemon,
    rank,
    usagePercent,
    id: normalizeId(pokemon.id),
    usualOutcome: usualResult.outcome,
  };
  if (usualResult.outcome === "loss") {
    return { ...base, usualBeats: true, template: null, changes: [], set: usual, result: usualResult };
  }
  const found = findUncommonSet(pokemon, ours, lookups, { field, maxChanges });
  if (!found) return null;
  return {
    ...base,
    usualBeats: false,
    template: found.template,
    changes: found.changes,
    set: { ...found.set, source: { spread: "theory", spreadName: "", teams: pokemon.champions?.usageCount ?? 0 } },
    result: found.result,
  };
}

/** Usual sets that beat you first, then fewest changes, then usage. */
export function sortUncommonRows(rows = []) {
  return [...rows].sort((a, b) => Number(Boolean(b.usualBeats)) - Number(Boolean(a.usualBeats)) ||
    a.changes.length - b.changes.length || b.usagePercent - a.usagePercent || a.rank - b.rank);
}

/** Synchronous convenience over uncommonCandidates / uncommonSetRow / sortUncommonRows. */
export function uncommonSetThreats({ ours, opponents = [], lookups = {}, field = {}, maxChanges, minTeams } = {}) {
  const rows = uncommonCandidates(opponents, { minTeams })
    .map((opponent) => uncommonSetRow(opponent, ours, lookups, { field, maxChanges }))
    .filter(Boolean);
  return sortUncommonRows(rows);
}

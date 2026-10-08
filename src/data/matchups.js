import { compareMoveOrder, effectivePriority } from "../engine/battle-order.js";
import { calculateDamage } from "../engine/damage.js";
import { createField } from "../engine/field.js";
import { impliedField } from "../engine/modifiers.js";
import { NATURES } from "../engine/natures.js";
import { normalizeId } from "../identifiers.js";
import { parseUsageSpread, topUsageEntry } from "./usage-defaults.js";

/*
 * One-on-one "KO race" between your set and one opposing set. Each side uses the move that KOs
 * in the fewest likely hits; whoever needs fewer hits wins the race. Only when both need the
 * same number does move order (priority, then Speed, or reversed Speed in Trick Room) decide it.
 *
 * This is a 1v1 pressure measure, not a doubles win rate: partners, redirection, Protect,
 * switching, accuracy and secondary effects are outside the race. Damage itself follows the
 * doubles field (spread moves at ×0.75 by default).
 */

/** A hit count counts as "likely" once the cumulative KO chance reaches this value. */
export const LIKELY_KO_CHANCE = 0.5;
/** koChance stops at 5 hits; anything slower is reported as Infinity. */
export const MAX_RACE_HITS = 5;
/** Usage share (%) at or above which an observed move/item/ability counts as common. */
export const COMMON_SHARE_PERCENT = 5;

const FIRST_TURN_ONLY_MOVES = new Set(["fakeout", "firstimpression", "matblock"]);
const SUN_WEATHERS = new Set(["sunnyday", "desolateland"]);
const RAIN_WEATHERS = new Set(["raindance", "primordialsea"]);
const INTIMIDATE_BLOCKERS = new Set([
  "clearbody", "fullmetalbody", "hypercutter", "innerfocus", "oblivious", "owntempo", "scrappy", "whitesmoke",
]);
const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAGE_KEYS = ["atk", "def", "spa", "spd", "spe"];

/**
 * Why a move is left out of the KO race, or "" when it takes part. Fake Out–style moves only
 * work once, charge/recharge moves act every other turn, and self-KO moves end the race.
 */
export function raceExclusionReason(move, field = {}) {
  return raceExclusion(move, field).reason;
}

/** Like raceExclusionReason, plus a stable `code` ("missing", "status", "firstTurn", "charge",
 * "recharge", "selfKo"; "" when the move races) for localized labels. */
export function raceExclusion(move, field = {}) {
  if (!move) return { code: "missing", reason: "Missing move data." };
  if (move.category === "Status") return { code: "status", reason: "Status moves deal no direct damage." };
  const moveId = normalizeId(move.id ?? move.name);
  const name = move.name ?? moveId;
  if (FIRST_TURN_ONLY_MOVES.has(moveId)) return { code: "firstTurn", reason: `${name} only works on the user's first turn.` };
  if (move.flags?.charge && !chargeSkipped(moveId, field)) return { code: "charge", reason: `${name} needs a charge turn.` };
  if (move.flags?.recharge || move.self?.volatileStatus === "mustrecharge") {
    return { code: "recharge", reason: `${name} needs a recharge turn.` };
  }
  if (move.selfdestruct) return { code: "selfKo", reason: `${name} makes the user faint.` };
  return { code: "", reason: "" };
}

function chargeSkipped(moveId, field) {
  const weather = normalizeId(field?.weather);
  if (moveId === "solarbeam" || moveId === "solarblade") return SUN_WEATHERS.has(weather);
  if (moveId === "electroshot") return RAIN_WEATHERS.has(weather);
  return false;
}

/**
 * Smallest hit count whose cumulative KO chance reaches `threshold`, from a calculateDamage
 * `ko` summary. Infinity when no hit count within MAX_RACE_HITS gets there.
 */
export function likelyHitsToKo(ko, { threshold = LIKELY_KO_CHANCE } = {}) {
  if (!ko) return Infinity;
  if (Array.isArray(ko.chances) && ko.chances.length > 0) {
    const likely = ko.chances.find(({ chance }) => chance >= threshold);
    return likely ? likely.hits : Infinity;
  }
  if (!Number.isFinite(ko.hits)) return Infinity;
  if (ko.chance >= threshold) return ko.hits;
  return ko.hits + 1 <= MAX_RACE_HITS ? ko.hits + 1 : Infinity;
}

/**
 * Weather and terrain for the matchup. With `abilityField` (default), weather/terrain-setting
 * abilities apply: the opponent's first (it is treated as the later switch-in), then yours,
 * then the base field. Pass abilityField: false to keep the base field as given.
 */
export function matchupField({ field = {}, ours, theirs, abilityField = true } = {}) {
  const base = createField(field);
  if (!abilityField) return base;
  const theirImplied = impliedField(theirs?.ability);
  const ourImplied = impliedField(ours?.ability);
  return createField({
    ...base,
    weather: theirImplied.weather ?? ourImplied.weather ?? base.weather,
    terrain: theirImplied.terrain ?? ourImplied.terrain ?? base.terrain,
  });
}

/**
 * Stage changes the two abilities cause on entry: Intimidate (blocked by Clear Body and
 * similar; Guard Dog raises Attack instead; Defiant and Competitive react to the drop) and
 * Intrepid Sword. Returned as additions to each side's own stages.
 */
export function entryStageChanges(ownAbility, opposingAbility) {
  const own = normalizeId(ownAbility?.id ?? ownAbility?.name ?? ownAbility);
  const opposing = normalizeId(opposingAbility?.id ?? opposingAbility?.name ?? opposingAbility);
  const changes = {};
  const add = (stat, value) => { changes[stat] = (changes[stat] ?? 0) + value; };
  if (own === "intrepidsword") add("atk", 1);
  if (opposing === "intimidate") {
    if (own === "guarddog") add("atk", 1);
    else if (!INTIMIDATE_BLOCKERS.has(own)) {
      add("atk", -1);
      if (own === "defiant") add("atk", 2);
      if (own === "competitive") add("spa", 2);
    }
  }
  return changes;
}

/**
 * Runs the KO race between two sets.
 *
 * A set is `{ pokemon, nature, sp, ability, item, moves, status?, teraType?, stages?, side? }`
 * where `side` holds that side's field flags (reflect, lightScreen, auroraVeil, friendGuard,
 * tailwind, helpingHand, …). `field` holds the shared field (format, weather, terrain, gravity).
 *
 * Returns per-move results for both sides, each side's best race move, move order without and
 * with Trick Room, and the race outcome from your side: "win", "loss", "speed" (same hit count,
 * so move order decides) or "stalemate" (neither side KOs within MAX_RACE_HITS).
 */
export function matchup({ ours, theirs, field = {}, abilityField = true, entryStages = true } = {}) {
  if (!ours?.pokemon || !theirs?.pokemon) throw new TypeError("matchup needs both sets with a pokemon.");
  const sharedField = matchupField({ field, ours, theirs, abilityField });
  const ourState = engineState(ours, entryStages ? entryStageChanges(ours.ability, theirs.ability) : {});
  const theirState = engineState(theirs, entryStages ? entryStageChanges(theirs.ability, ours.ability) : {});
  const ourAttackField = directionalField(sharedField, ours.side, theirs.side);
  const theirAttackField = directionalField(sharedField, theirs.side, ours.side);

  const ourMoves = raceMoves(ourState, theirState, ours.moves, ourAttackField);
  const theirMoves = raceMoves(theirState, ourState, theirs.moves, theirAttackField);
  const ourBest = bestRaceMove(ourMoves);
  const theirBest = bestRaceMove(theirMoves);

  const orderInput = {
    attacker: ourState,
    defender: theirState,
    attackerMove: ourBest?.move ?? null,
    defenderMove: theirBest?.move ?? null,
    field: sharedField,
  };
  const order = {
    normal: sideOrder(compareMoveOrder({ ...orderInput, trickRoom: false })),
    trickRoom: sideOrder(compareMoveOrder({ ...orderInput, trickRoom: true })),
  };

  const ourHits = ourBest?.hits ?? Infinity;
  const theirHits = theirBest?.hits ?? Infinity;
  const outcome = raceOutcome(ourHits, theirHits);

  return {
    field: sharedField,
    ours: { state: ourState, moves: ourMoves, best: ourBest },
    theirs: { state: theirState, moves: theirMoves, best: theirBest },
    ourHits,
    theirHits,
    outcome,
    decisive: isDecisive(outcome, ourHits, theirHits),
    margin: cappedHits(theirHits) - cappedHits(ourHits),
    // "Walled": the side needs 4 or more likely hits (it cannot 3HKO).
    ourOffenseWalled: ourHits >= 4,
    theirOffenseWalled: theirHits >= 4,
    order,
  };
}

/**
 * Who wins a "speed" outcome under a Speed mode: "normal", "trickRoom", or "auto", which weights
 * the two orders by `trickRoomChance` (the share of the opponent's teams that run Trick Room).
 * Returns { first: "ours" | "theirs" | "tie" | "split", ourWinChance } where ourWinChance is
 * 1, 0 or a weighted value (speed ties count as 0.5). Other outcomes pass through unchanged.
 */
export function resolveSpeedOutcome(result, { mode = "normal", trickRoomChance = 0 } = {}) {
  if (!result) return null;
  if (result.outcome === "win") return { first: null, ourWinChance: 1 };
  if (result.outcome === "loss") return { first: null, ourWinChance: 0 };
  if (result.outcome === "stalemate") return { first: null, ourWinChance: null };
  const normal = orderWinChance(result.order.normal.first);
  const trickRoom = orderWinChance(result.order.trickRoom.first);
  if (mode === "normal") return { first: result.order.normal.first, ourWinChance: normal };
  if (mode === "trickRoom") return { first: result.order.trickRoom.first, ourWinChance: trickRoom };
  const p = clamp01(Number(trickRoomChance) || 0);
  const ourWinChance = (1 - p) * normal + p * trickRoom;
  const first = result.order.normal.first === result.order.trickRoom.first || p === 0
    ? result.order.normal.first
    : p === 1 ? result.order.trickRoom.first : "split";
  return { first, ourWinChance };
}

/**
 * Share of submitted teams containing each Pokémon that also run Trick Room (any member with
 * the move). Built from the Limitless team archive (`tournaments[].topCut[].pokemon[]`).
 */
export function trickRoomTeamShares(archive) {
  const byPokemon = new Map();
  let teams = 0;
  let trickRoomTeams = 0;
  for (const tournament of archive?.tournaments ?? []) {
    for (const standing of tournament?.topCut ?? []) {
      const members = Array.isArray(standing?.pokemon) ? standing.pokemon : [];
      if (members.length === 0) continue;
      const hasTrickRoom = members.some((member) =>
        (member?.moves ?? []).some((move) => normalizeId(move?.id ?? move?.name ?? move) === "trickroom"));
      teams += 1;
      if (hasTrickRoom) trickRoomTeams += 1;
      const seen = new Set();
      for (const member of members) {
        const id = normalizeId(member?.id ?? member?.name);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const entry = byPokemon.get(id) ?? { teams: 0, trickRoomTeams: 0 };
        byPokemon.set(id, {
          teams: entry.teams + 1,
          trickRoomTeams: entry.trickRoomTeams + (hasTrickRoom ? 1 : 0),
        });
      }
    }
  }
  return {
    overall: { teams, trickRoomTeams, share: teams ? trickRoomTeams / teams : 0 },
    byPokemon: new Map([...byPokemon].map(([id, entry]) => [id, { ...entry, share: entry.trickRoomTeams / entry.teams }])),
  };
}

/**
 * Trick Room share for one Pokémon: its own teams when it appears on at least `minTeams` of
 * them (Mega forms fall back to their base species), otherwise the overall share.
 */
export function trickRoomChanceFor(shares, pokemon, { minTeams = 10 } = {}) {
  const candidates = [pokemon?.id, pokemon?.name, pokemon?.baseSpecies].map(normalizeId).filter(Boolean);
  for (const id of candidates) {
    const entry = shares?.byPokemon?.get(id);
    if (entry && entry.teams >= minTeams) return { share: entry.share, teams: entry.teams, source: "pokemon" };
  }
  return { share: shares?.overall?.share ?? 0, teams: shares?.overall?.teams ?? 0, source: "overall" };
}

/**
 * The opposing set the matchup list uses for a usage-backed Pokémon: the top Smogon ladder
 * spread (or a max-offense preset), top ability, top item (a Mega form holds its stone; a base
 * form never holds one), and every damaging move used by at least `commonShare`% of its
 * Limitless sets. Returns null when the Pokémon has no usage moves.
 */
export function observedMatchupSet(pokemon, { abilityLookup, itemLookup, moveLookup, items = [], commonShare = COMMON_SHARE_PERCENT } = {}) {
  const usage = pokemon?.champions?.usage;
  if (!usage?.moves?.length) return null;
  const resolveMove = (entry) => moveLookup?.get(normalizeId(entry.id)) ?? moveLookup?.get(normalizeId(entry.name)) ?? null;
  const damaging = usage.moves
    .map((entry) => ({ entry, move: resolveMove(entry) }))
    .filter(({ move }) => move && move.category !== "Status");
  const common = damaging.filter(({ entry }) => (entry.usagePercent ?? 0) >= commonShare);
  const moves = (common.length > 0 ? common : damaging.slice(0, 4)).map(({ move }) => move);
  if (moves.length === 0) return null;

  const topSpreadName = topUsageEntry(usage.spreads)?.name ?? "";
  const spread = parseUsageSpread(topSpreadName);
  const topNature = topUsageEntry(usage.natures)?.name;
  const nature = spread?.nature ?? (topNature && topNature in NATURES ? topNature : "Hardy");
  const sp = spread?.sp ?? presetSpread(nature, damaging);

  const abilityEntry = topUsageEntry(usage.abilities);
  const ability = abilityEntry
    ? abilityLookup?.get(normalizeId(abilityEntry.id ?? abilityEntry.name)) ?? { id: normalizeId(abilityEntry.name), name: abilityEntry.name }
    : firstAbility(pokemon, abilityLookup);

  const stone = megaStoneFor(pokemon, items);
  const isMegaForm = Boolean(stone);
  const itemEntry = topUsageEntry((usage.items ?? []).filter((entry) => {
    const item = itemLookup?.get(normalizeId(entry.id ?? entry.name));
    return !item?.megaStone;
  }));
  const item = isMegaForm
    ? stone
    : itemEntry ? itemLookup?.get(normalizeId(itemEntry.id ?? itemEntry.name)) ?? null : null;

  return {
    pokemon,
    nature,
    sp,
    ability,
    item,
    moves,
    source: {
      spread: spread ? "smogon" : "preset",
      spreadName: spread ? topSpreadName : "",
      teams: pokemon?.champions?.usageCount ?? 0,
    },
  };
}

/** The legal Mega Stone whose `megaStone` mapping produces this form, or null. */
export function megaStoneFor(pokemon, items = []) {
  const formId = normalizeId(pokemon?.name ?? pokemon?.id);
  if (!formId) return null;
  return items.find((item) => item?.megaStone && typeof item.megaStone === "object" &&
    Object.values(item.megaStone).some((form) => normalizeId(form) === formId)) ?? null;
}

function presetSpread(nature, damaging) {
  const weights = { Physical: 0, Special: 0 };
  for (const { entry, move } of damaging) weights[move.category] += entry.usagePercent ?? 0;
  const offense = weights.Special > weights.Physical ? "spa" : "atk";
  const slowNature = NATURES[nature]?.down === "spe";
  return slowNature
    ? { hp: 32, atk: 0, def: 2, spa: 0, spd: 0, spe: 0, [offense]: 32 }
    : { hp: 2, atk: 0, def: 0, spa: 0, spd: 0, spe: 32, [offense]: 32 };
}

function firstAbility(pokemon, abilityLookup) {
  const name = pokemon?.abilities?.[0];
  if (!name) return null;
  return abilityLookup?.get(normalizeId(name)) ?? { id: normalizeId(name), name };
}

function engineState(set, stageChanges = {}) {
  const stages = {};
  for (const stat of STAGE_KEYS) {
    const value = Number(set.stages?.[stat] ?? 0) + (stageChanges[stat] ?? 0);
    stages[stat] = Math.max(-6, Math.min(6, value));
  }
  const sp = {};
  for (const stat of STAT_KEYS) sp[stat] = Number(set.sp?.[stat] ?? 0);
  return {
    pokemon: set.pokemon,
    nature: set.nature ?? "Hardy",
    sp,
    stages,
    ability: set.ability ?? null,
    item: set.item ?? null,
    status: set.status ?? "",
    currentHpFraction: 1,
    teraType: set.teraType ?? "",
    tailwind: Boolean(set.side?.tailwind),
    speedMultiplier: 1,
  };
}

function directionalField(sharedField, attackerSide = {}, defenderSide = {}) {
  return createField({
    ...sharedField,
    attackerSide: { ...sharedField.attackerSide, ...pickSide(attackerSide, ["helpingHand", "powerSpot", "battery", "steelySpirit", "flowerGift", "tailwind"]) },
    defenderSide: { ...sharedField.defenderSide, ...pickSide(defenderSide, ["reflect", "lightScreen", "auroraVeil", "friendGuard", "flowerGift", "tailwind"]) },
  });
}

function pickSide(side, keys) {
  const picked = {};
  for (const key of keys) if (side?.[key] !== undefined) picked[key] = Boolean(side[key]);
  return picked;
}

function raceMoves(attacker, defender, moves = [], field) {
  return moves.filter(Boolean).map((move) => {
    const excluded = raceExclusion(move, field);
    if (excluded.code) return { move, included: false, reasonCode: excluded.code, reason: excluded.reason, hits: Infinity };
    const result = calculateDamage({
      attacker: attacker.pokemon,
      defender: defender.pokemon,
      move,
      attackerState: attacker,
      defenderState: defender,
      field,
    });
    if (!result.supported) {
      return { move, included: false, reasonCode: "unsupported", reason: result.reason ?? "Unsupported move.", hits: Infinity };
    }
    return {
      move,
      included: true,
      reasonCode: "",
      reason: "",
      hits: result.maxDamage > 0 ? likelyHitsToKo(result.ko) : Infinity,
      minPercent: result.minPercent,
      maxPercent: result.maxPercent,
      koText: result.ko?.text ?? "",
      koChances: result.ko?.chances ?? [],
      accuracy: move.accuracy === true ? 100 : move.accuracy ?? 100,
      priority: effectivePriority(move, attacker, field),
      notes: result.notes ?? [],
    };
  });
}

/**
 * Fewest likely hits; among moves that KO in the same number of hits, higher priority (it moves
 * first), then more damage. When no move KOs within MAX_RACE_HITS, the most damaging one.
 */
export function bestRaceMove(entries = []) {
  const usable = entries.filter((entry) => entry.included);
  if (usable.length === 0) return null;
  return [...usable].sort((a, b) => {
    if (a.hits !== b.hits) return a.hits < b.hits ? -1 : 1;
    if (Number.isFinite(a.hits) && a.priority !== b.priority) return b.priority - a.priority;
    return b.maxPercent - a.maxPercent || String(a.move.name).localeCompare(String(b.move.name));
  })[0];
}

function sideOrder(order) {
  const first = order.firstSide === "attacker" ? "ours" : order.firstSide === "defender" ? "theirs" : "tie";
  return {
    first,
    ourPriority: order.attackerPriority,
    theirPriority: order.defenderPriority,
    ourSpeed: order.attackerSpeed,
    theirSpeed: order.defenderSpeed,
  };
}

function raceOutcome(ourHits, theirHits) {
  if (ourHits === Infinity && theirHits === Infinity) return "stalemate";
  if (ourHits < theirHits) return "win";
  if (theirHits < ourHits) return "loss";
  return "speed";
}

// Decisive: the winner KOs in one hit while the loser needs 3+, or in two while the loser can't
// KO within MAX_RACE_HITS. These are the hard counters (loss) and hard checks (win).
function isDecisive(outcome, ourHits, theirHits) {
  const decisive = (winner, loser) => (winner === 1 && loser >= 3) || (winner <= 2 && loser === Infinity);
  if (outcome === "win") return decisive(ourHits, theirHits);
  if (outcome === "loss") return decisive(theirHits, ourHits);
  return false;
}

function cappedHits(hits) {
  return Number.isFinite(hits) ? hits : MAX_RACE_HITS + 1;
}

function orderWinChance(first) {
  if (first === "ours") return 1;
  if (first === "theirs") return 0;
  return 0.5;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

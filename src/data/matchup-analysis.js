import { normalizeId } from "../identifiers.js";
import { matchup, observedMatchupSet, resolveSpeedOutcome, trickRoomChanceFor } from "./matchups.js";
import { createStorageStore } from "./saved-sets.js";

/*
 * Page-level analysis for the matchups page: run the KO race (matchups.js) against the most-used
 * Champions Pokémon, then summarize and group the results. Pure; no DOM.
 */

export const OPPONENT_COUNTS = [50, 100];
export const DEFAULT_OPPONENT_COUNT = 50;
export const SPEED_MODES = ["auto", "normal", "trickRoom"];
export const DEFAULT_SPEED_MODE = "auto";
/** Grid buckets for hits to KO; 4 stands for four or more (including no KO within five). */
export const HIT_BUCKETS = [1, 2, 3, 4];
export const RACE_OUTCOMES = ["loss", "speed", "win", "stalemate"];

export function normalizeOpponentCount(value) {
  const count = Number(value);
  return OPPONENT_COUNTS.includes(count) ? count : DEFAULT_OPPONENT_COUNT;
}

export function normalizeSpeedMode(value) {
  return SPEED_MODES.includes(value) ? value : DEFAULT_SPEED_MODE;
}

export const MATCHUP_PREFERENCES_STORAGE_KEY = "pokecal.matchup-preferences.v1";

/** Remembers the opponent count and speed mode between visits (memory-only without storage). */
export function createMatchupPreferencesStore(storage = null) {
  const store = createStorageStore(storage, {
    key: MATCHUP_PREFERENCES_STORAGE_KEY,
    createEmpty: () => ({ version: 1, opponentCount: DEFAULT_OPPONENT_COUNT, speedMode: DEFAULT_SPEED_MODE }),
    isValid: (value) => value?.version === 1,
  });
  const read = () => {
    const value = store.read();
    return { opponentCount: normalizeOpponentCount(value.opponentCount), speedMode: normalizeSpeedMode(value.speedMode) };
  };
  return {
    read,
    write(next = {}) {
      const value = { ...read(), ...next };
      const normalized = { opponentCount: normalizeOpponentCount(value.opponentCount), speedMode: normalizeSpeedMode(value.speedMode) };
      store.write({ version: 1, ...normalized });
      return normalized;
    },
  };
}

/** The `count` most-used Pokémon (Mega forms count separately), ranked by Limitless usage. */
export function rankedOpponents(pokemonCatalog = [], count = DEFAULT_OPPONENT_COUNT) {
  return pokemonCatalog
    .filter((pokemon) => !pokemon?.battleOnly && Number.isFinite(pokemon?.champions?.usagePercent))
    .sort((a, b) => b.champions.usagePercent - a.champions.usagePercent || String(a.name).localeCompare(String(b.name)))
    .slice(0, count)
    .map((pokemon, index) => ({ pokemon, rank: index + 1, usagePercent: pokemon.champions.usagePercent }));
}

/**
 * A matchup set from a page side state: nature, SP, stat stages, ability, item, status and the
 * selected moves. `moveSettings` lines up with `moves` and carries each slot's crit toggle and
 * move conditions; `moveOptions(slotIndex, move)` turns a slot's conditions into engine options
 * (the page passes move-conditions.js `moveOptionsForSlot`).
 */
export function matchupSetFromSide(side, moveLookup, { moveOptions = null } = {}) {
  if (!side?.pokemon) return null;
  const slots = (side.selectedMoveIds ?? [])
    .map((id, index) => ({ move: id ? moveLookup?.get(normalizeId(id)) : null, index }))
    .filter(({ move }) => move);
  return {
    pokemon: side.pokemon,
    nature: side.nature,
    sp: { ...side.sp },
    stages: { ...(side.stages ?? {}) },
    ability: side.ability ?? null,
    item: side.item ?? null,
    status: side.status ?? "",
    soaked: Boolean(side.soaked),
    moves: slots.map(({ move }) => move),
    moveSettings: slots.map(({ move, index }) => ({
      critical: Boolean(side.critMoves?.[index]),
      moveOptions: moveOptions ? moveOptions(index, move) : {},
    })),
  };
}

export function hitBucket(hits) {
  return Number.isFinite(hits) ? Math.max(1, Math.min(hits, 4)) : 4;
}

/** Race outcome a grid cell stands for; the 4+/4+ cell mixes slow outcomes, so it is "slow". */
export function cellOutcome(theirBucket, ourBucket) {
  if (theirBucket === 4 && ourBucket === 4) return "slow";
  if (theirBucket < ourBucket) return "loss";
  if (theirBucket > ourBucket) return "win";
  return "speed";
}

/**
 * Runs the KO race against each opponent's observed set. Opponents without usage moves are
 * returned in `skipped`. `trickRoomShares` (from trickRoomTeamShares) feeds the "auto" speed
 * mode; without it, auto falls back to normal move order.
 */
export function analyzeMatchups({
  ours,
  opponents = [],
  lookups = {},
  field = {},
  speedMode = DEFAULT_SPEED_MODE,
  trickRoomShares = null,
} = {}) {
  const rows = [];
  const skipped = [];
  if (!ours?.pokemon) return { rows, skipped };
  const mode = normalizeSpeedMode(speedMode);
  for (const opponent of opponents) {
    const set = observedMatchupSet(opponent.pokemon, lookups);
    if (!set) {
      skipped.push(opponent);
      continue;
    }
    const result = matchup({ ours, theirs: set, field });
    const trickRoom = trickRoomShares ? trickRoomChanceFor(trickRoomShares, opponent.pokemon) : null;
    const speed = resolveSpeedOutcome(result, {
      mode: mode === "auto" && !trickRoom ? "normal" : mode,
      trickRoomChance: trickRoom?.share ?? 0,
    });
    rows.push({
      ...opponent,
      id: normalizeId(opponent.pokemon.id),
      set,
      result,
      trickRoom,
      speed,
      cell: { theirs: hitBucket(result.theirHits), ours: hitBucket(result.ourHits) },
    });
  }
  return { rows, skipped };
}

/**
 * Usage-weighted shares of each race outcome, the share of usage your moves cannot 3HKO
 * (`walledShare`), your weighted chance to move first across speed races, and the 4×4 grid
 * of counts (rows: hits they need; columns: hits you need).
 */
export function summarizeMatchups(rows = []) {
  const counts = Object.fromEntries(RACE_OUTCOMES.map((outcome) => [outcome, 0]));
  const weights = Object.fromEntries(RACE_OUTCOMES.map((outcome) => [outcome, 0]));
  let total = 0;
  let walled = 0;
  let speedWins = 0;
  const grid = HIT_BUCKETS.map((theirs) => HIT_BUCKETS.map((ours) => ({
    theirs, ours, outcome: cellOutcome(theirs, ours), count: 0, usagePercent: 0,
  })));
  for (const row of rows) {
    const weight = Math.max(0, Number(row.usagePercent) || 0);
    const outcome = row.result.outcome;
    total += weight;
    counts[outcome] += 1;
    weights[outcome] += weight;
    if (row.result.ourOffenseWalled) walled += weight;
    if (outcome === "speed") speedWins += weight * (row.speed?.ourWinChance ?? 0.5);
    const cell = grid[row.cell.theirs - 1][row.cell.ours - 1];
    cell.count += 1;
    cell.usagePercent += weight;
  }
  const share = (value) => (total > 0 ? value / total : 0);
  return {
    count: rows.length,
    counts,
    shares: Object.fromEntries(RACE_OUTCOMES.map((outcome) => [outcome, share(weights[outcome])])),
    walledShare: share(walled),
    speedFirstShare: weights.speed > 0 ? speedWins / weights.speed : null,
    grid,
  };
}

export function rowInCell(row, cell) {
  return !cell || (row.cell.theirs === cell.theirs && row.cell.ours === cell.ours);
}

/**
 * Rows grouped for the page, optionally limited to one grid cell:
 * - threats: they win the race; hard counters first, then the widest margin, then usage.
 * - speed: equal hits; the ones you are least likely to win first, then usage.
 * - favorable ("does well against"): you win; hard checks first, then margin, then usage.
 * - stalemate: neither side KOs within five hits; by usage.
 */
export function matchupSections(rows = [], { cell = null } = {}) {
  const visible = rows.filter((row) => rowInCell(row, cell));
  const byUsage = (a, b) => b.usagePercent - a.usagePercent || a.rank - b.rank;
  const decisiveFirst = (a, b) => Number(b.result.decisive) - Number(a.result.decisive);
  return {
    threats: visible.filter((row) => row.result.outcome === "loss")
      .sort((a, b) => decisiveFirst(a, b) || a.result.margin - b.result.margin || byUsage(a, b)),
    speed: visible.filter((row) => row.result.outcome === "speed")
      .sort((a, b) => (a.speed?.ourWinChance ?? 0.5) - (b.speed?.ourWinChance ?? 0.5) || byUsage(a, b)),
    favorable: visible.filter((row) => row.result.outcome === "win")
      .sort((a, b) => decisiveFirst(a, b) || b.result.margin - a.result.margin || byUsage(a, b)),
    stalemate: visible.filter((row) => row.result.outcome === "stalemate").sort(byUsage),
  };
}

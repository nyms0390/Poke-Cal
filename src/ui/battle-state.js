// Pure battle-page state helpers — no DOM. battle-page.js does DOM reads, calls these, then
// writes the result back to the DOM. See ROADMAP.md "Side state (per Pokémon)" for the shape.
import { createField } from "../engine/field.js";
import { normalizeId } from "../identifiers.js";
import { parseUsageSpread } from "../data/usage-defaults.js";

export const TEAM_SIZE = 6;
const TYPE_CHANGE_ABILITIES = new Set(["libero", "protean"]);

export function createTeamState(size = TEAM_SIZE) {
  return { slots: Array.from({ length: size }, () => null), activeIndex: 0 };
}

export function createTeamsState() {
  return { attacker: createTeamState(), defender: createTeamState() };
}

export function swapTeamsState(teams) {
  if (!teams?.attacker || !teams?.defender) return teams;
  return { ...teams, attacker: teams.defender, defender: teams.attacker };
}

export function setTeamSlot(teams, side, index, state) {
  const team = teams?.[side];
  if (!team || !Number.isInteger(index) || index < 0 || index >= team.slots.length) return teams;
  return {
    ...teams,
    [side]: { ...team, slots: team.slots.map((slot, slotIndex) => slotIndex === index ? state : slot) },
  };
}

export function updateActiveTeamSlot(teams, side, state) {
  const team = teams?.[side];
  return team ? setTeamSlot(teams, side, team.activeIndex, state) : teams;
}

export function activateTeamSlot(teams, side, index) {
  const team = teams?.[side];
  if (!team || !Number.isInteger(index) || index < 0 || index >= team.slots.length) return teams;
  return { ...teams, [side]: { ...team, activeIndex: index } };
}

export function clearTeamSlot(teams, side, index) {
  const team = teams?.[side];
  if (!team || !Number.isInteger(index) || index < 0 || index >= team.slots.length) return teams;

  const slots = team.slots.map((slot, slotIndex) => slotIndex === index ? null : slot);
  const activeIndex = team.activeIndex === index
    ? Math.max(0, slots.findIndex(Boolean))
    : team.activeIndex;
  return { ...teams, [side]: { ...team, slots, activeIndex } };
}

// Decides where a Pokémon handed over from another page (the shared active set or a `?left=`
// link) goes in a team without ever destroying an existing member:
// - "kept":      the active slot already holds it — keep that slot and its edits untouched;
// - "activated": another slot holds it — switch to that slot (its edits are kept);
// - "placed":    seed it into the first empty slot (`index`) and make that slot active;
// - "full":      every slot holds a different Pokémon — change nothing (the page tells the
//                user; picking it in the Pokémon search replaces the active slot explicitly).
export function planIncomingTeamSlot(team, pokemonId) {
  const id = normalizeId(pokemonId);
  if (!team || !Array.isArray(team.slots) || !id) return { outcome: "ignored", index: -1 };
  const holds = (slot) => normalizeId(slot?.pokemon?.id) === id;
  if (holds(team.slots[team.activeIndex])) return { outcome: "kept", index: team.activeIndex };
  const existing = team.slots.findIndex(holds);
  if (existing >= 0) return { outcome: "activated", index: existing };
  const empty = team.slots.findIndex((slot) => !slot);
  if (empty >= 0) return { outcome: "placed", index: empty };
  return { outcome: "full", index: -1 };
}

// True when `spreadName` ("Nature:hp/atk/def/spa/spd/spe") is exactly the side's nature + SP.
export function spreadMatchesState(spreadName, state) {
  const spread = parseUsageSpread(spreadName);
  if (!spread || !state) return false;
  return spread.nature === state.nature &&
    Object.entries(spread.sp).every(([stat, value]) => Number(state.sp?.[stat] ?? 0) === value);
}

// The spread dropdown value for a side: the first preset that exactly matches its nature + SP,
// otherwise "" (the localized "Custom spread" option).
export function spreadSelectionForState(state, spreadNames = []) {
  return spreadNames.find((name) => spreadMatchesState(name, state)) ?? "";
}

// Query parameters the battle page consumes on load. They are removed afterwards (via
// history.replaceState) so a reload restores the saved team instead of re-seeding from the URL.
export const CONSUMED_QUERY_PARAMS = ["left"];

// Returns the URL (path + remaining query + hash) with the consumed parameters removed, or
// null when none of them are present (no history update needed).
export function urlWithoutConsumedParams(href, keys = CONSUMED_QUERY_PARAMS) {
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!keys.some((key) => url.searchParams.has(key))) return null;
  for (const key of keys) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function clampCurrentHpFraction(value, maxHp) {
  const fraction = Number(value);
  const maximumHp = Number(maxHp);
  if (!Number.isFinite(fraction)) return 1;
  const minimum = Number.isFinite(maximumHp) && maximumHp > 0 ? 1 / maximumHp : 0;
  return Math.max(minimum, Math.min(1, fraction));
}

// Builds the canonical per-side battle state for `pokemon` from its Champions usage defaults
// (or Limitless/ranked fallback — see usage-defaults.js). speedMultiplier/status default
// to their neutral values here; battle-page.js overrides them from the existing battle-condition
// controls when seeding a side, so switching Pokémon on one side doesn't reset the other side's
// battle conditions.
export function createSideState(pokemon, usageDefaults) {
  return {
    pokemon,
    nature: usageDefaults.nature,
    sp: { ...usageDefaults.sp },
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: usageDefaults.ability,
    item: usageDefaults.item,
    status: "",
    soaked: false,
    currentHpFraction: 1,
    selectedMoveIds: [0, 1, 2, 3].map((index) => normalizeId(usageDefaults.moves[index]?.id)),
    selectedHitCounts: [null, null, null, null],
    targetMovedOverrides: [null, null, null, null],
    critMoves: [false, false, false, false],
    conditionOverrides: [null, null, null, null],
    moveOptionsBySlot: [{}, {}, {}, {}],
    singleTargetMoves: [false, false, false, false],
    allyPlusMinus: false,
    rivalry: "off",
    switchedIn: false,
    faintedAllyCount: 0,
    boosterEnergy: false,
    iceFaceIntact: true,
    itemConsumed: false,
    speedMultiplier: 1,
    typeChangeUsed: false,
    typeChangeType: "",
  };
}

// Applies one battle-page control change to a side's state, returning a new state object
// (immutable). `kind` selects the field; `stat`/`index` are only used by "sp"/"stage"/"move".
// For "ability"/"item", `value` must already be the resolved catalog entry (or null) — resolving
// a <select>'s chosen option against the ability/item lookup requires the DOM element itself
// (to read its selected option's display text as a fallback name), so that resolution stays in
// battle-page.js and only the resolved value crosses into this pure function.
export function applyControl(state, { kind, stat, index, key, value, maxHp, effectiveTypes }) {
  switch (kind) {
    case "spread": {
      const spread = parseUsageSpread(value);
      return spread ? { ...state, nature: spread.nature, sp: { ...spread.sp } } : state;
    }
    case "nature":
      return { ...state, nature: value };
    case "ability": {
      const itemConsumed = isUnburdenAbility(value) && Boolean(state.itemConsumed);
      return isTypeChangeAbility(value)
        ? { ...state, ability: value, itemConsumed }
        : { ...state, ability: value, itemConsumed, typeChangeUsed: false, typeChangeType: "" };
    }
    case "item":
      return { ...state, item: value };
    case "speedMultiplier":
      return { ...state, speedMultiplier: Number(value) };
    case "status":
      return value === "soak"
        ? { ...state, status: "", soaked: true }
        : { ...state, status: value, soaked: false };
    case "currentHpFraction":
      return { ...state, currentHpFraction: clampCurrentHpFraction(value, maxHp) };
    case "allyPlusMinus":
      return { ...state, allyPlusMinus: Boolean(value) };
    case "rivalry":
      return { ...state, rivalry: ["same", "opposite"].includes(value) ? value : "off" };
    case "switchedIn":
      return { ...state, switchedIn: Boolean(value) };
    case "faintedAllyCount":
      return { ...state, faintedAllyCount: clampInteger(value, 0, 5) };
    case "boosterEnergy":
      return { ...state, boosterEnergy: Boolean(value) };
    case "iceFaceIntact":
      return { ...state, iceFaceIntact: Boolean(value) };
    case "itemConsumed":
      return { ...state, itemConsumed: isUnburdenAbility(state.ability) && Boolean(value) };
    case "typeChangeUsed":
      return value
        ? { ...state, typeChangeUsed: true }
        : { ...state, typeChangeUsed: false, typeChangeType: "" };
    case "typeChangeType":
      return state.typeChangeUsed ? { ...state, typeChangeType: String(value ?? "") } : state;
    case "normalizeTypeChange":
      return normalizeTypeChangeState(state, value?.effectiveTypes ?? effectiveTypes);
    case "sp":
      return { ...state, sp: { ...state.sp, [stat]: clampInteger(value, 0, 32) } };
    case "stage":
      return { ...state, stages: { ...state.stages, [stat]: clampInteger(value, -6, 6) } };
    case "move":
      return {
        ...state,
        selectedMoveIds: state.selectedMoveIds.map((id, i) => (i === index ? normalizeId(value) : id)),
        singleTargetMoves: (state.singleTargetMoves ?? [false, false, false, false])
          .map((singleTarget, i) => (i === index ? false : singleTarget)),
        targetMovedOverrides: (state.targetMovedOverrides ?? [null, null, null, null])
          .map((targetMoved, i) => (i === index ? null : targetMoved)),
        critMoves: (state.critMoves ?? [false, false, false, false])
          .map((critical, i) => (i === index ? false : critical)),
        conditionOverrides: (state.conditionOverrides ?? [null, null, null, null])
          .map((condition, i) => (i === index ? null : condition)),
        selectedHitCounts: (state.selectedHitCounts ?? [null, null, null, null])
          .map((hitCount, i) => (i === index ? null : hitCount)),
        moveOptionsBySlot: (state.moveOptionsBySlot ?? [{}, {}, {}, {}])
          .map((options, i) => (i === index ? {} : options)),
      };
    case "moveOption": {
      const legacyField = { hitCount: "selectedHitCounts", targetMoved: "targetMovedOverrides",
        conditionOverride: "conditionOverrides" }[key];
      return {
        ...state,
        ...(legacyField ? { [legacyField]: (state[legacyField] ?? [null, null, null, null])
          .map((old, i) => (i === index ? null : old)) } : {}),
        moveOptionsBySlot: (state.moveOptionsBySlot ?? [{}, {}, {}, {}]).map((options, i) => {
          if (i !== index) return options;
          const next = { ...options };
          if (value === "auto") delete next[key];
          else next[key] = String(value);
          return next;
        }),
      };
    }
    case "hitCount":
      return {
        ...state,
        selectedHitCounts: (state.selectedHitCounts ?? [null, null, null, null])
          .map((hitCount, i) => (i === index ? Number(value) : hitCount)),
      };
    case "targetMoved":
      return {
        ...state,
        targetMovedOverrides: (state.targetMovedOverrides ?? [null, null, null, null])
          .map((targetMoved, i) => (i === index
            ? value === null || value === "auto" ? null : value === "yes" || value === true
            : targetMoved)),
      };
    case "crit":
      return {
        ...state,
        critMoves: (state.critMoves ?? [false, false, false, false])
          .map((critical, i) => (i === index ? Boolean(value) : critical)),
      };
    case "moveCondition":
      return {
        ...state,
        conditionOverrides: (state.conditionOverrides ?? [null, null, null, null])
          .map((condition, i) => (i === index ? (value === null ? null : value === "yes" || value === true) : condition)),
      };
    case "singleTarget":
      return {
        ...state,
        singleTargetMoves: (state.singleTargetMoves ?? [false, false, false, false])
          .map((singleTarget, i) => (i === index ? Boolean(value) : singleTarget)),
      };
    default:
      return state;
  }
}

export function isUnburdenAbility(ability) {
  return normalizeId(ability?.id ?? ability?.name) === "unburden";
}

// Unburden's "item used up": the side no longer holds its item, so the item stops applying to
// damage (and Acrobatics, Knock Off and similar see no item) while the Speed engine doubles
// Speed from state.itemConsumed. Only meaningful while the ability is Unburden.
export function sideStateForCalc(state) {
  if (!state?.itemConsumed || !isUnburdenAbility(state.ability)) return state;
  return { ...state, item: null };
}

export function isTypeChangeAbility(ability) {
  return TYPE_CHANGE_ABILITIES.has(normalizeId(ability?.id ?? ability?.name));
}

export function normalizeTypeChangeState(state, effectiveTypes = []) {
  const types = [...new Set(effectiveTypes.filter(Boolean))];
  const current = String(state.typeChangeType ?? "");
  if (!state.typeChangeUsed) {
    return state.typeChangeUsed || current
      ? { ...state, typeChangeUsed: false, typeChangeType: "" }
      : state;
  }
  if (!types.length || (current && !types.includes(current))) {
    return { ...state, typeChangeUsed: false, typeChangeType: "" };
  }
  if (!current) return { ...state, typeChangeType: types[0] };
  return state;
}

// A field-card side panel tracks six side-condition checkboxes for one physical side of the
// field (see battle-page.js's "Attacker's side"/"Defender's side" panels), because whichever
// Pokémon stands there can either be the one attacking (its Helping Hand boosts its own move)
// or the one defending (its Reflect/Light Screen/Aurora Veil/
// Friend Guard reduce the incoming hit) depending on which row of the damage list is being
// calculated. `pickFields` slices that panel object down to the
// 4-key shape `field.attackerSide`/`field.defenderSide` (src/engine/field.js) actually expects.
const BOOST_FIELD_KEYS = ["helpingHand"];
const SCREEN_FIELD_KEYS = ["reflect", "lightScreen", "auroraVeil", "friendGuard"];

function pickFields(panel, keys) {
  if (!panel) return undefined;
  const picked = {};
  for (const key of keys) picked[key] = Boolean(panel[key]);
  return picked;
}

// Assembles the pieces shared by every damage calculation in one render pass: both sides'
// Pokémon/state and the Field object(s) built from the raw battle-condition control values
// (`fieldInputs = { format, weather, terrain, gravity, trickRoom, attackerSide,
// defenderSide }`). `attackerSide`/`defenderSide` are the two field-card panel objects, keyed by
// physical side rather than by calculation direction. `field` is for the attacker-as-source
// damage rows; `reverseField` swaps which panel supplies the boosts vs. the screens, for the
// defender-as-source rows. Callers add `move`, and for the defender-as-source cards, swap
// attacker/defender (and field/reverseField) before calling calculateDamage.
export function buildCalcInput(damageState, fieldInputs = {}) {
  // createField spreads its overrides object, so an explicit `key: undefined` would clobber
  // the default — only pass through keys the caller actually supplied.
  const fieldOverrides = {};
  if (fieldInputs.format !== undefined) fieldOverrides.format = fieldInputs.format;
  if (fieldInputs.weather !== undefined) fieldOverrides.weather = fieldInputs.weather;
  if (fieldInputs.terrain !== undefined) fieldOverrides.terrain = fieldInputs.terrain;
  if (fieldInputs.gravity !== undefined) fieldOverrides.gravity = fieldInputs.gravity;
  if (fieldInputs.trickRoom !== undefined) fieldOverrides.trickRoom = fieldInputs.trickRoom;

  const attackerPanel = fieldInputs.attackerSide;
  const defenderPanel = fieldInputs.defenderSide;
  const attackerBoosts = pickFields(attackerPanel, BOOST_FIELD_KEYS);
  const attackerScreens = pickFields(attackerPanel, SCREEN_FIELD_KEYS);
  const defenderBoosts = pickFields(defenderPanel, BOOST_FIELD_KEYS);
  const defenderScreens = pickFields(defenderPanel, SCREEN_FIELD_KEYS);
  const attackerState = {
    ...sideStateForCalc(damageState.attacker),
    tailwind: Boolean(attackerPanel?.tailwind),
  };
  const defenderState = {
    ...sideStateForCalc(damageState.defender),
    tailwind: Boolean(defenderPanel?.tailwind),
  };

  return {
    attacker: damageState.attacker.pokemon,
    defender: damageState.defender.pokemon,
    attackerState,
    defenderState,
    field: createField({
      ...fieldOverrides,
      ...(attackerBoosts ? { attackerSide: attackerBoosts } : {}),
      ...(defenderScreens ? { defenderSide: defenderScreens } : {}),
    }),
    reverseField: createField({
      ...fieldOverrides,
      ...(defenderBoosts ? { attackerSide: defenderBoosts } : {}),
      ...(attackerScreens ? { defenderSide: attackerScreens } : {}),
    }),
  };
}

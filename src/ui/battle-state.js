// Pure battle-page state helpers — no DOM. battle-page.js does DOM reads, calls these, then
// writes the result back to the DOM. See ROADMAP.md "Side state (per Pokémon)" for the shape.
import { createField } from "../engine/field.js";
import { parseUsageSpread } from "../data/usage-defaults.js";

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

// Builds the canonical per-side battle state for `pokemon` from its Champions usage defaults
// (or Limitless/ranked fallback — see usage-defaults.js). `status`/`teraType`/`currentHpFraction`
// are added now per ROADMAP.md's side-state shape but are otherwise unused until Phase 1.
// speedMultiplier/tailwind/paralyzed/burned default to their neutral values here; battle-page.js
// overrides them from the existing battle-condition controls when seeding a side, so switching
// Pokémon on one side doesn't reset the other side's battle conditions.
export function createSideState(pokemon, usageDefaults) {
  return {
    pokemon,
    nature: usageDefaults.nature,
    sp: { ...usageDefaults.sp },
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: usageDefaults.ability,
    item: usageDefaults.item,
    status: "",
    teraType: "",
    currentHpFraction: 1,
    selectedMoveIds: [0, 1, 2, 3].map((index) => normalizeId(usageDefaults.moves[index]?.id)),
    speedMultiplier: 1,
    tailwind: false,
    paralyzed: false,
    burned: false,
  };
}

// Applies one battle-page control change to a side's state, returning a new state object
// (immutable). `kind` selects the field; `stat`/`index` are only used by "sp"/"stage"/"move".
// For "ability"/"item", `value` must already be the resolved catalog entry (or null) — resolving
// a <select>'s chosen option against the ability/item lookup requires the DOM element itself
// (to read its selected option's display text as a fallback name), so that resolution stays in
// battle-page.js and only the resolved value crosses into this pure function.
export function applyControl(state, { kind, stat, index, value }) {
  switch (kind) {
    case "spread": {
      const spread = parseUsageSpread(value);
      return spread ? { ...state, nature: spread.nature, sp: { ...spread.sp } } : state;
    }
    case "nature":
      return { ...state, nature: value };
    case "ability":
      return { ...state, ability: value };
    case "item":
      return { ...state, item: value };
    case "speedMultiplier":
      return { ...state, speedMultiplier: Number(value) };
    case "tailwind":
      return { ...state, tailwind: Boolean(value) };
    case "paralyzed":
      return { ...state, paralyzed: Boolean(value) };
    case "burned":
      return { ...state, burned: Boolean(value) };
    case "sp":
      return { ...state, sp: { ...state.sp, [stat]: clampInteger(value, 0, 32) } };
    case "stage":
      return { ...state, stages: { ...state.stages, [stat]: clampInteger(value, -6, 6) } };
    case "move":
      return {
        ...state,
        selectedMoveIds: state.selectedMoveIds.map((id, i) => (i === index ? normalizeId(value) : id)),
      };
    default:
      return state;
  }
}

// Assembles the pieces shared by every damage calculation in one render pass: both sides'
// Pokémon/state and the Field object built from the raw battle-condition control values
// (`fieldInputs = { format, weather, terrain, gravity, trickRoom, critical }`). Callers add
// `move`, and for the defender-as-source cards, swap attacker/defender before calling
// calculateDamage.
export function buildCalcInput(damageState, fieldInputs = {}) {
  // createField spreads its overrides object, so an explicit `key: undefined` would clobber
  // the default — only pass through keys the caller actually supplied.
  const fieldOverrides = {};
  if (fieldInputs.format !== undefined) fieldOverrides.format = fieldInputs.format;
  if (fieldInputs.weather !== undefined) fieldOverrides.weather = fieldInputs.weather;
  if (fieldInputs.terrain !== undefined) fieldOverrides.terrain = fieldInputs.terrain;
  if (fieldInputs.gravity !== undefined) fieldOverrides.gravity = fieldInputs.gravity;
  if (fieldInputs.trickRoom !== undefined) fieldOverrides.trickRoom = fieldInputs.trickRoom;

  return {
    attacker: damageState.attacker.pokemon,
    defender: damageState.defender.pokemon,
    attackerState: damageState.attacker,
    defenderState: damageState.defender,
    field: createField(fieldOverrides),
    critical: Boolean(fieldInputs.critical),
  };
}

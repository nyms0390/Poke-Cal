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

function clampCurrentHpFraction(value, maxHp) {
  const fraction = Number(value);
  const maximumHp = Number(maxHp);
  if (!Number.isFinite(fraction)) return 1;
  const minimum = Number.isFinite(maximumHp) && maximumHp > 0 ? 1 / maximumHp : 0;
  return Math.max(minimum, Math.min(1, fraction));
}

// Builds the canonical per-side battle state for `pokemon` from its Champions usage defaults
// (or Limitless/ranked fallback — see usage-defaults.js). speedMultiplier/tailwind/status default
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
    teraType: "",
    currentHpFraction: 1,
    selectedMoveIds: [0, 1, 2, 3].map((index) => normalizeId(usageDefaults.moves[index]?.id)),
    selectedHitCounts: [null, null, null, null],
    targetMovedOverrides: [null, null, null, null],
    singleTargetMoves: [false, false, false, false],
    allyPlusMinus: false,
    rivalry: "off",
    switchedIn: false,
    faintedAllyCount: 0,
    boosterEnergy: false,
    iceFaceIntact: true,
    speedMultiplier: 1,
    tailwind: false,
  };
}

// Applies one battle-page control change to a side's state, returning a new state object
// (immutable). `kind` selects the field; `stat`/`index` are only used by "sp"/"stage"/"move".
// For "ability"/"item", `value` must already be the resolved catalog entry (or null) — resolving
// a <select>'s chosen option against the ability/item lookup requires the DOM element itself
// (to read its selected option's display text as a fallback name), so that resolution stays in
// battle-page.js and only the resolved value crosses into this pure function.
export function applyControl(state, { kind, stat, index, value, maxHp }) {
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
    case "status":
      return { ...state, status: value };
    case "tera":
      return { ...state, teraType: value?.enabled ? value.type : "" };
    case "teraType":
      return { ...state, teraType: state.teraType ? value : "" };
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
      };
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
          .map((targetMoved, i) => (i === index ? Boolean(value) : targetMoved)),
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

// A field-card side panel tracks all 8 side-condition checkboxes for one physical side of the
// field (see battle-page.js's "Attacker's side"/"Defender's side" panels), because whichever
// Pokémon stands there can either be the one attacking (its Helping Hand/Power Spot/Battery/
// Steely Spirit boost its own move) or the one defending (its Reflect/Light Screen/Aurora Veil/
// Friend Guard reduce the incoming hit) depending on which row of the damage list is being
// calculated. `pickBoostFields`/`pickScreenFields` slice that 8-key panel object down to the
// 4-key shape `field.attackerSide`/`field.defenderSide` (src/engine/field.js) actually expects.
const BOOST_FIELD_KEYS = ["helpingHand", "powerSpot", "battery", "steelySpirit", "flowerGift"];
const SCREEN_FIELD_KEYS = ["reflect", "lightScreen", "auroraVeil", "friendGuard", "flowerGift"];

function pickFields(panel, keys) {
  if (!panel) return undefined;
  const picked = {};
  for (const key of keys) picked[key] = Boolean(panel[key]);
  return picked;
}

// Assembles the pieces shared by every damage calculation in one render pass: both sides'
// Pokémon/state and the Field object(s) built from the raw battle-condition control values
// (`fieldInputs = { format, weather, terrain, gravity, trickRoom, critical, attackerSide,
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

  return {
    attacker: damageState.attacker.pokemon,
    defender: damageState.defender.pokemon,
    attackerState: damageState.attacker,
    defenderState: damageState.defender,
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
    critical: Boolean(fieldInputs.critical),
  };
}

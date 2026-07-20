import {
  formatMovePriority,
  filterMoves,
  resolvePokemonAbilities,
  resolveChampionsPokemonMoves,
} from "../data/catalog.js";
import { compareMoveOrder } from "../engine/battle-order.js";
import { STAT_KEYS } from "../engine/constants.js";
import {
  calculateDamage,
  calculateStat,
  formatDamageResult,
  hitCountRange,
  NATURES,
  natureOptionLabel,
} from "../engine/damage.js";
import { impliedField, impliedStageDefaults, resolveHitCountRange } from "../engine/modifiers.js";
import { isOrderConditionalMove, moveCondition, moveEffect } from "../engine/move-effects.js";
import { formatSetPaste, parseSetPaste } from "../data/set-paste.js";
import {
  activeSetFromState,
  applyActiveSet,
  createActiveSetStore,
} from "../data/active-set.js";
import { createSavedSetStore, createStorageStore } from "../data/saved-sets.js";
import { searchPokemon } from "../data/pokemon.js";
import { finalSpeed } from "../engine/speed.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import {
  applyDocumentTranslations,
  getLocale,
  initI18n,
  localizedName,
  localizedNatureOptionLabel,
  localizedSpreadName,
  localizedTerm,
  onLocaleChange,
  t,
} from "../i18n.js";
import {
  formatDamageNote,
  formatDamageReason,
  formatKoResult,
  formatMoveOrderResult,
  formatResultDescription,
  formatSetWarning,
} from "../i18n-formatters.js";
import {
  activateTeamSlot as activateTeamSlotState,
  applyControl,
  buildCalcInput,
  clearTeamSlot as clearTeamSlotState,
  createSideState,
  createTeamsState,
  swapTeamsState,
  TEAM_SIZE,
  updateActiveTeamSlot,
} from "./battle-state.js";
import { catalogLoadedStatus, loadCatalogs, rankByUsage } from "./bootstrap.js";
import {
  damagePercentColor,
  ensureRenderedRows,
  optionElement,
  attachCombobox,
  searchResultButton,
  statEditorRow,
  STAT_LABELS,
  typeBadge,
} from "./components.js";

const elements = {
  damageSource: document.querySelector("#damage-source"),
  attackerSummary: document.querySelector("#attacker-summary"),
  defenderSummary: document.querySelector("#defender-summary"),
  attackerPokemon: document.querySelector("#attacker-pokemon"),
  defenderPokemon: document.querySelector("#defender-pokemon"),
  attackerPokemonSearch: document.querySelector("#attacker-pokemon-search"),
  defenderPokemonSearch: document.querySelector("#defender-pokemon-search"),
  attackerPokemonResults: document.querySelector("#attacker-pokemon-results"),
  defenderPokemonResults: document.querySelector("#defender-pokemon-results"),
  attackerTeamSlots: document.querySelector("#attacker-team-slots"),
  defenderTeamSlots: document.querySelector("#defender-team-slots"),
  attackerSavedSet: document.querySelector("#attacker-saved-set"),
  defenderSavedSet: document.querySelector("#defender-saved-set"),
  attackerSaveSet: document.querySelector("#attacker-save-set"),
  defenderSaveSet: document.querySelector("#defender-save-set"),
  attackerDeleteSet: document.querySelector("#attacker-delete-set"),
  defenderDeleteSet: document.querySelector("#defender-delete-set"),
  attackerSpread: document.querySelector("#attacker-spread"),
  defenderSpread: document.querySelector("#defender-spread"),
  attackerNature: document.querySelector("#attacker-nature"),
  defenderNature: document.querySelector("#defender-nature"),
  attackerAbility: document.querySelector("#attacker-ability"),
  defenderAbility: document.querySelector("#defender-ability"),
  attackerItem: document.querySelector("#attacker-item"),
  defenderItem: document.querySelector("#defender-item"),
  attackerMovePicks: document.querySelector("#attacker-move-picks"),
  defenderMovePicks: document.querySelector("#defender-move-picks"),
  attackerStatEditor: document.querySelector("#attacker-stat-editor"),
  defenderStatEditor: document.querySelector("#defender-stat-editor"),
  attackerSpeedMultiplier: document.querySelector("#attacker-speed-multiplier"),
  defenderSpeedMultiplier: document.querySelector("#defender-speed-multiplier"),
  attackerStatus: document.querySelector("#attacker-status"),
  defenderStatus: document.querySelector("#defender-status"),
  attackerCurrentHp: document.querySelector("#attacker-current-hp"),
  defenderCurrentHp: document.querySelector("#defender-current-hp"),
  attackerMaxHp: document.querySelector("#attacker-max-hp"),
  defenderMaxHp: document.querySelector("#defender-max-hp"),
  attackerHpPercent: document.querySelector("#attacker-hp-percent"),
  defenderHpPercent: document.querySelector("#defender-hp-percent"),
  attackerSpeedReadout: document.querySelector("#attacker-speed-readout"),
  defenderSpeedReadout: document.querySelector("#defender-speed-readout"),
  trickRoom: document.querySelector("#trick-room"),
  swapSides: document.querySelector("#swap-sides"),
  fieldGravity: document.querySelector("#field-gravity"),
  fieldFormatInputs: document.querySelectorAll('input[name="field-format"]'),
  fieldWeatherInputs: document.querySelectorAll('input[name="field-weather"]'),
  fieldTerrainInputs: document.querySelectorAll('input[name="field-terrain"]'),
  fieldSideInputs: document.querySelectorAll('input[data-kind="field-side"]'),
  assumptionInputs: document.querySelectorAll(
    'input[data-kind="ally-plus-minus"], input[data-kind="switched-in"], input[data-kind="fainted-allies"], input[data-kind="booster-energy"], input[data-kind="ice-face-intact"], select[data-kind="rivalry"]',
  ),
  setPaste: document.querySelector("#set-paste"),
  setPasteStatus: document.querySelector("#set-paste-status"),
  setPasteWarnings: document.querySelector("#set-paste-warnings"),
  importAttackerSet: document.querySelector("#import-attacker-set"),
  importDefenderSet: document.querySelector("#import-defender-set"),
  exportAttackerSet: document.querySelector("#export-attacker-set"),
  exportDefenderSet: document.querySelector("#export-defender-set"),
  moveOrder: document.querySelector("#move-order"),
  speedSummary: document.querySelector("#speed-summary"),
  damageCount: document.querySelector("#damage-count"),
  damageList: document.querySelector("#damage-list"),
  status: document.querySelector("#status"),
};

const SP_STATS = STAT_KEYS;
const savedSetStore = createSavedSetStore(browserStorage());
const activeSetStore = createActiveSetStore(browserStorage());
const TEAM_STORAGE_KEY = "pokecal.teams.v1";
const teamStore = createStorageStore(browserStorage(), {
  key: TEAM_STORAGE_KEY,
  createEmpty: () => ({ version: 1, teams: {} }),
  isValid: (value) => value?.version === 1 && value.teams,
});

// Maps a control element's id suffix (after "attacker-"/"defender-") to the `kind` passed to
// applyControl. Kept in sync with battle.html's control ids.
const ID_CONTROL_KINDS = {
  spread: "spread",
  nature: "nature",
  ability: "ability",
  item: "item",
  "speed-multiplier": "speedMultiplier",
  status: "status",
};

let pokemon = [];
let abilities = [];
let abilityLookup = new Map();
let itemLookup = new Map();
let moveLookup = new Map();
let items = [];
let moves = [];
let teams = createTeamsState();
let damageState = {
  attacker: null,
  defender: null,
};
const moveComboboxCleanups = { attacker: [], defender: [] };

// One field-card panel's worth of side conditions — see battle-state.js's buildCalcInput doc
// comment for why this combines boost- and screen-type keys.
function neutralFieldSidePanel() {
  return {
    helpingHand: false,
    tailwind: false,
    lightScreen: false,
    reflect: false,
    auroraVeil: false,
    friendGuard: false,
  };
}

// Module-level field selections (ROADMAP.md P1-01 step 2) — kept separate from damageState so
// switching either side's Pokémon never resets weather/terrain/format/gravity/Trick Room.
// attackerSide/defenderSide (P1-02) are keyed by physical field side ("Attacker's side"/
// "Defender's side" panels), not by calculation direction — buildCalcInput derives both
// directions' Field objects from these two panels.
let fieldState = {
  format: "doubles",
  weather: "",
  terrain: "",
  gravity: false,
  trickRoom: false,
  attackerSide: neutralFieldSidePanel(),
  defenderSide: neutralFieldSidePanel(),
};

initI18n();
initialize();

onLocaleChange(() => {
  if (pokemon.length === 0) return;
  elements.status.textContent = catalogLoadedStatus({ pokemon, abilities, moves });
  renderDamageShell();
});

async function initialize() {
  const data = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!data) return;
  pokemon = data.pokemon;
  abilities = data.abilities;
  abilityLookup = data.abilityLookup;
  itemLookup = data.itemLookup;
  moveLookup = data.moveLookup;
  items = data.items;
  moves = data.moves;
  const storedTeams = loadStoredTeams();
  teams = storedTeams ? restoreTeams(storedTeams) : createTeamsState();
  const requestedLeftId = new URLSearchParams(globalThis.location?.search ?? "").get("left");
  const requestedLeft = pokemon.find(
    ({ id }) => normalizeDamageId(id) === normalizeDamageId(requestedLeftId),
  );
  const activeSet = activeSetStore.readSet();
  const activePokemon = pokemon.find(
    ({ id }) => normalizeDamageId(id) === normalizeDamageId(activeSet?.pokemonId),
  );
  renderDamageShell({ requestedLeft, activeSet: requestedLeft ? null : activeSet, activePokemon });
}

for (const control of [
  elements.attackerSpread,
  elements.defenderSpread,
  elements.attackerNature,
  elements.defenderNature,
  elements.attackerAbility,
  elements.defenderAbility,
  elements.attackerItem,
  elements.defenderItem,
  elements.attackerSpeedMultiplier,
  elements.defenderSpeedMultiplier,
  elements.attackerStatus,
  elements.defenderStatus,
  elements.attackerCurrentHp,
  elements.defenderCurrentHp,
  elements.attackerHpPercent,
  elements.defenderHpPercent,
]) {
  control.addEventListener("input", handleDamageControl);
}

for (const control of [
  ...elements.fieldFormatInputs,
  ...elements.fieldWeatherInputs,
  ...elements.fieldTerrainInputs,
  ...elements.fieldSideInputs,
  elements.fieldGravity,
  elements.trickRoom,
]) {
  control.addEventListener("input", handleFieldControl);
}

for (const control of elements.assumptionInputs) {
  control.addEventListener("input", handleDamageControl);
}

elements.swapSides.addEventListener("click", swapSides);
document.addEventListener("keydown", handleKeyboardControl);

elements.importAttackerSet.addEventListener("click", () => importSetPaste("attacker"));
elements.importDefenderSet.addEventListener("click", () => importSetPaste("defender"));
elements.exportAttackerSet.addEventListener("click", () => exportSetPaste("attacker"));
elements.exportDefenderSet.addEventListener("click", () => exportSetPaste("defender"));

for (const side of ["attacker", "defender"]) {
  const input = elements[`${side}PokemonSearch`];
  elements[`${side}SavedSet`].addEventListener("input", () => applySavedSet(side));
  elements[`${side}SaveSet`].addEventListener("click", () => saveCurrentSet(side));
  elements[`${side}DeleteSet`].addEventListener("click", () => deleteCurrentSet(side));
  attachCombobox({
    input,
    resultsEl: elements[`${side}PokemonResults`],
    getMatches: (query) => searchPokemon(pokemon, query, {
      abilityLookup,
      moveLookup,
      itemLookup,
      limit: 8,
    }),
    onSelect: (picked) => seedDamageSide(side, picked),
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });
}

function renderDamageShell({ requestedLeft, activeSet, activePokemon } = {}) {
  const natureOptions = Object.keys(NATURES).map((nature) =>
    optionElement(nature, getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature)),
  );
  elements.attackerNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));
  elements.defenderNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));

  renderSideInputs("attacker");
  renderSideInputs("defender");

  for (const side of ["attacker", "defender"]) {
    if (side === "attacker" && requestedLeft) seedDamageSide(side, requestedLeft);
    else if (side === "attacker" && activePokemon) seedDamageSide(side, activePokemon, { activeSet });
    else if (teams[side].slots.some(Boolean)) renderActiveTeamSlot(side);
    else seedDamageSide(side, defaultPokemonForSide(side));
  }
  renderDamage();
}

function swapSides() {
  teams = swapTeamsState(teams);
  fieldState = {
    ...fieldState,
    attackerSide: fieldState.defenderSide,
    defenderSide: fieldState.attackerSide,
  };
  persistTeams();
  renderActiveTeamSlot("attacker");
  renderActiveTeamSlot("defender");
  syncFieldInputs();
  applyAbilityImpliedStages();
  syncSideInputs("attacker");
  syncSideInputs("defender");
  renderDamage();
}

function defaultPokemonForSide(side) {
  if (side === "attacker") return pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0];
  return pokemon.find(({ id }) => id === "blastoise") ?? pokemon.find(({ id }) => id !== "pikachu") ?? pokemon[0];
}

function handleKeyboardControl(event) {
  const input = event.target;
  if (input?.tagName !== "INPUT" || input.type !== "number") return;
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;

  const step = Number(input.step);
  const minimum = Number(input.min);
  const maximum = Number(input.max);
  const amount = Number.isFinite(step) && step > 0 ? step : 1;
  const current = Number(input.value);
  const base = Number.isFinite(current) ? current : Number.isFinite(minimum) ? minimum : 0;
  const next = base + (event.key === "ArrowUp" ? amount : -amount);
  const bounded = Number.isFinite(minimum) ? Math.max(minimum, next) : next;
  input.value = String(Number.isFinite(maximum) ? Math.min(maximum, bounded) : bounded);
  event.preventDefault();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function hidePokemonSearchResults(side) {
  elements[`${side}PokemonResults`].hidden = true;
  elements[`${side}PokemonSearch`].setAttribute("aria-expanded", "false");
}

function renderSideInputs(side) {
  elements[`${side}StatEditor`].replaceChildren();
}

function seedDamageSide(side, entry, { activeSet = null } = {}) {
  if (!entry) return;
  const existingState = damageState[side];
  const defaults = championsDefaultsForPokemon(entry, {
    abilityLookup,
    moveLookup,
    items,
  });

  // createSideState gives the pure/default shape; the existing battle-condition controls for
  // this side are preserved rather than reset, same as before the battle-state.js extraction.
  const defaultActiveSet = activeSetFromState(defaults);
  let state = createSideState(entry, defaults);
  if (activeSet) state = applyActiveSet(state, activeSet, { abilityLookup, itemLookup });
  state.speedMultiplier = existingState ? Number(elements[`${side}SpeedMultiplier`]?.value ?? 1) : 1;
  state.status = existingState ? elements[`${side}Status`]?.value ?? "" : "";
  writeActiveTeamState(side, state, { activeFallback: activeSet ?? defaultActiveSet });
  renderActiveTeamSlot(side);
  applyAbilityImpliedField(damageState[side].ability);
  applyAbilityImpliedStages();
  syncSideInputs("attacker");
  syncSideInputs("defender");
  renderDamage();
}

function renderActiveTeamSlot(side) {
  const state = teams[side].slots[teams[side].activeIndex];
  damageState[side] = state;
  renderTeamSlots(side);
  if (!state) {
    renderEmptySide(side);
    renderDamage();
    return;
  }

  const defaults = championsDefaultsForPokemon(state.pokemon, {
    abilityLookup,
    moveLookup,
    items,
  });
  setSideControlsDisabled(side, false);
  elements[`${side}Pokemon`].value = state.pokemon.id;
  elements[`${side}PokemonSearch`].value = localizedName(state.pokemon);
  hidePokemonSearchResults(side);
  renderSideSelects(side, defaults);
  syncSideInputs(side);
  if (side === "attacker") persistActiveAttacker(state);
}

function renderTeamSlots(side) {
  const container = elements[`${side}TeamSlots`];
  if (!container) return;
  const team = teams[side];
  container.replaceChildren(
    ...team.slots.map((state, index) => {
      const slot = document.createElement("div");
      slot.className = "team-slot";
      if (index === team.activeIndex) slot.classList.add("active");

      const activate = document.createElement("button");
      activate.type = "button";
      activate.className = "team-slot-button";
      activate.textContent = state ? localizedName(state.pokemon) : "+";
      activate.setAttribute("aria-label", state ? `${localizedName(state.pokemon)}, ${index + 1}` : t("battle.addSlot", { number: index + 1 }));
      activate.addEventListener("click", () => activateTeamSlot(side, index));

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "team-slot-clear";
      clear.textContent = "×";
      clear.disabled = !state;
      clear.setAttribute("aria-label", t("battle.clearSlot", { number: index + 1 }));
      clear.addEventListener("click", () => clearTeamSlot(side, index));

      slot.append(activate, clear);
      return slot;
    }),
  );
}

function activateTeamSlot(side, index) {
  teams = activateTeamSlotState(teams, side, index);
  persistTeams();
  renderActiveTeamSlot(side);
  applyAbilityImpliedStages();
  syncSideInputs("attacker");
  syncSideInputs("defender");
  renderDamage();
}

function clearTeamSlot(side, index) {
  teams = clearTeamSlotState(teams, side, index);
  persistTeams();
  renderActiveTeamSlot(side);
  applyAbilityImpliedStages();
  syncSideInputs("attacker");
  syncSideInputs("defender");
  renderDamage();
}

function writeActiveTeamState(side, state, { persist = true, activeFallback } = {}) {
  damageState[side] = state;
  teams = updateActiveTeamSlot(teams, side, state);
  if (persist) persistTeams();
  if (side === "attacker") persistActiveAttacker(state, activeFallback);
}

function setSideControlsDisabled(side, disabled) {
  for (const key of [
    "SavedSet", "SaveSet", "DeleteSet", "Spread", "Nature", "Ability", "Item", "SpeedMultiplier",
    "Status", "CurrentHp", "HpPercent",
  ]) {
    elements[`${side}${key}`].disabled = disabled;
  }
  for (const input of document.querySelectorAll(`[data-side="${side}"]`)) input.disabled = disabled;
}

function renderEmptySide(side) {
  clearMoveComboboxes(side);
  setSideControlsDisabled(side, true);
  elements[`${side}Pokemon`].value = "";
  elements[`${side}PokemonSearch`].value = "";
  elements[`${side}SavedSet`].replaceChildren(optionElement("", t("battle.choosePokemonFirst")));
  elements[`${side}Spread`].replaceChildren(optionElement("", t("battle.choosePokemonFirst")));
  elements[`${side}Nature`].replaceChildren(optionElement("", t("battle.choosePokemonFirst")));
  elements[`${side}Ability`].replaceChildren(optionElement("", t("battle.choosePokemonFirst")));
  elements[`${side}Item`].replaceChildren(optionElement("", t("battle.choosePokemonFirst")));
  elements[`${side}StatEditor`].replaceChildren();
  elements[`${side}MovePicks`].replaceChildren();
  hidePokemonSearchResults(side);
  if (side === "attacker") activeSetStore.clearSet();
}

function persistActiveAttacker(state, fallback = activeSetStore.readSet()) {
  if (!state?.pokemon) {
    activeSetStore.clearSet();
    return;
  }
  activeSetStore.writeSet(activeSetFromState(state, fallback));
}

function renderSideSelects(side, defaults) {
  const spreadSelect = elements[`${side}Spread`];
  const natureSelect = elements[`${side}Nature`];
  const abilitySelect = elements[`${side}Ability`];
  const itemSelect = elements[`${side}Item`];
  const usage = damageState[side].pokemon?.champions?.usage;
  const abilities = rankByUsage(resolvePokemonAbilities(damageState[side].pokemon, abilityLookup), usage?.abilities);
  const rankedItems = rankByUsage(items, usage?.items);

  const usageSpreads = usage?.spreads ?? [];
  const ncpSets = damageState[side].pokemon?.champions?.ncp?.sets ?? [];
  spreadSelect.replaceChildren(
    optionElement(
      "",
      usageSpreads.length > 0 || ncpSets.length > 0
        ? t("battle.customSpread")
        : t("battle.noSpreadSource"),
    ),
    ...spreadOptionGroups(usageSpreads, ncpSets),
  );
  spreadSelect.value = defaults.spreadName;
  natureSelect.value = damageState[side].nature;
  abilitySelect.replaceChildren(
    optionElement("", t("battle.noAbility")),
    ...abilities.map((ability) =>
      optionElement(ability.id, localizedName(ability)),
    ),
  );
  itemSelect.replaceChildren(
    optionElement("", t("battle.noItem")),
    ...rankedItems.map((item) =>
      optionElement(item.id, localizedName(item)),
    ),
  );
  abilitySelect.value = damageState[side].ability?.id ?? "";
  itemSelect.value = damageState[side].item?.id ?? "";
  renderDamageMovePickers(side);
  renderSavedSetSelect(side);
}

function spreadOptionGroups(usageSpreads, ncpSets) {
  const groups = [];
  if (usageSpreads.length > 0) {
    groups.push(
      optionGroup(
        t("battle.smogonSpreadGroup"),
        usageSpreads.map((spread) =>
          optionElement(
            spread.name,
            Number.isFinite(spread.usagePercent)
              ? `${localizedSpreadName(spread.name)} (${spread.usagePercent}%)`
              : localizedSpreadName(spread.name),
          ),
        ),
      ),
    );
  }
  if (ncpSets.length > 0) {
    groups.push(
      optionGroup(
        t("battle.ncpSpreadGroup"),
        ncpSets.map((set) => optionElement(set.spreadName, `${set.name} — ${localizedSpreadName(set.spreadName)}`)),
      ),
    );
  }
  return groups;
}

function optionGroup(label, options) {
  const group = document.createElement("optgroup");
  group.label = label;
  group.append(...options);
  return group;
}

function renderSavedSetSelect(side, selectedName = "") {
  const state = damageState[side];
  const sets = savedSetStore.listSets(state?.pokemon?.id);
  elements[`${side}SavedSet`].replaceChildren(
    optionElement("", t("battle.championsDefault")),
    ...sets.map((set) => optionElement(set.name, set.name)),
  );
  elements[`${side}SavedSet`].value = sets.some((set) => set.name === selectedName) ? selectedName : "";
  elements[`${side}DeleteSet`].disabled = !elements[`${side}SavedSet`].value;
}

function syncSideInputs(side) {
  const state = damageState[side];
  if (!state) return;
  elements[`${side}Nature`].value = state.nature;
  elements[`${side}SpeedMultiplier`].value = String(state.speedMultiplier);
  elements[`${side}Status`].value = state.status;
  syncCurrentHpInputs(side);
  for (const input of elements[`${side}StatEditor`].querySelectorAll('input[data-kind="sp"]')) {
    input.value = state.sp[input.dataset.stat] ?? 0;
  }
  for (const input of elements[`${side}StatEditor`].querySelectorAll('select[data-kind="stage"]')) {
    input.value = state.stages[input.dataset.stat] ?? 0;
  }
  syncAssumptionInputs(side);
}

// Updates the module-level fieldState from a Field-card control (format/weather/terrain radio
// groups, gravity/Trick Room checkboxes). Kept separate from damageState/applyControl since the
// field applies to both sides at once and must survive either side's Pokémon changing.
function handleFieldControl(event) {
  const { name, id, checked, value, dataset } = event.target;
  if (dataset.kind === "field-side") {
    const { side, key } = dataset;
    fieldState = { ...fieldState, [side]: { ...fieldState[side], [key]: checked } };
  } else if (name === "field-format") {
    fieldState = { ...fieldState, format: value };
    renderDamageMovePickers("attacker");
    renderDamageMovePickers("defender");
  } else if (name === "field-weather") fieldState = { ...fieldState, weather: value };
  else if (name === "field-terrain") fieldState = { ...fieldState, terrain: value };
  else if (id === "field-gravity") fieldState = { ...fieldState, gravity: checked };
  else if (id === "trick-room") fieldState = { ...fieldState, trickRoom: checked };
  renderDamage();
}

// Translates a raw DOM event into battle-state.js's `applyControl` call, then writes any
// DOM-visible side effects (SP/stage clamping echoed back into the input, spread selection
// re-syncing the nature/SP/stage inputs) before re-rendering.
function handleDamageControl(event) {
  const control = controlFromTarget(event.target);
  if (control) {
    const state = damageState[control.side];
    if (state) {
      writeActiveTeamState(control.side, applyControl(state, control));
      if (control.kind === "spread") syncSideInputs(control.side);
      if (control.kind === "ability") {
        applyAbilityImpliedField(damageState[control.side].ability);
        applyAbilityImpliedStages();
        syncSideInputs("attacker");
        syncSideInputs("defender");
      }
      if (["move", "hitCount", "targetMoved", "crit", "moveCondition", "ability", "item"].includes(control.kind)) {
        renderDamageMovePickers(control.side);
      }
      if (control.kind === "sp" || control.kind === "stage") {
        const key = control.kind === "stage" ? "stages" : "sp";
        event.target.value = damageState[control.side][key][control.stat];
      }
    }
  }
  renderDamage();
}

function applyAbilityImpliedField(ability) {
  const implied = impliedField(ability);
  let nextFieldState = fieldState;
  if (implied.weather !== undefined && fieldState.weather !== implied.weather) {
    nextFieldState = { ...nextFieldState, weather: implied.weather };
    syncRadioGroup(elements.fieldWeatherInputs, implied.weather);
  }
  if (implied.terrain !== undefined && fieldState.terrain !== implied.terrain) {
    nextFieldState = { ...nextFieldState, terrain: implied.terrain };
    syncRadioGroup(elements.fieldTerrainInputs, implied.terrain);
  }
  fieldState = nextFieldState;
}

function applyAbilityImpliedStages() {
  let changed = false;
  for (const side of ["attacker", "defender"]) {
    const opposingSide = side === "attacker" ? "defender" : "attacker";
    const state = damageState[side];
    const opposingState = damageState[opposingSide];
    if (!state || !opposingState) continue;
    const implied = impliedStageDefaults({
      ownAbility: state.ability,
      opposingAbility: opposingState.ability,
      stages: state.stages,
    });
    if (Object.keys(implied).length > 0) {
      writeActiveTeamState(
        side,
        { ...state, stages: { ...state.stages, ...implied } },
        { persist: false },
      );
      changed = true;
    }
  }
  if (changed) persistTeams();
}

function syncRadioGroup(inputs, value) {
  for (const input of inputs) {
    input.checked = input.value === value;
  }
}

function syncFieldInputs() {
  syncRadioGroup(elements.fieldFormatInputs, fieldState.format);
  syncRadioGroup(elements.fieldWeatherInputs, fieldState.weather);
  syncRadioGroup(elements.fieldTerrainInputs, fieldState.terrain);
  elements.fieldGravity.checked = fieldState.gravity;
  elements.trickRoom.checked = fieldState.trickRoom;
  for (const input of elements.fieldSideInputs) {
    input.checked = Boolean(fieldState[input.dataset.side]?.[input.dataset.key]);
  }
}

function importSetPaste(side) {
  const parsed = parseSetPaste(elements.setPaste.value, setPasteCatalogs());
  applyParsedSet(side, parsed);
  setSetPasteStatus(parsed.warnings);
}

function applySavedSet(side) {
  const selectedName = elements[`${side}SavedSet`].value;
  if (!selectedName) {
    seedDamageSide(side, damageState[side]?.pokemon);
    setSetPasteStatus([]);
    return;
  }

  const saved = savedSetStore
    .listSets(damageState[side]?.pokemon?.id)
    .find((set) => set.name === selectedName);
  if (!saved) {
    renderSavedSetSelect(side);
    return;
  }

  elements.setPaste.value = saved.text;
  const parsed = parseSetPaste(saved.text, setPasteCatalogs());
  applyParsedSet(side, parsed);
  renderSavedSetSelect(side, selectedName);
  setSetPasteStatus(parsed.warnings);
}

function saveCurrentSet(side) {
  const state = damageState[side];
  if (!state?.pokemon) return;
  const name = window.prompt(t("battle.saveName"), localizedName(state.pokemon));
  if (!name?.trim()) return;

  const stateForPaste = {
    ...state,
    moves: selectedDamageMoves(side).map(({ move }) => move),
  };
  const saved = savedSetStore.saveSet(state.pokemon.id, name, stateForPaste);
  if (!saved) return;
  elements.setPaste.value = saved.text;
  renderSavedSetSelect(side, saved.name);
  setSetPasteStatus([]);
}

function deleteCurrentSet(side) {
  const selectedName = elements[`${side}SavedSet`].value;
  const pokemonId = damageState[side]?.pokemon?.id;
  if (!pokemonId || !selectedName) return;
  if (!window.confirm(t("battle.deleteConfirm", { name: selectedName }))) return;

  savedSetStore.deleteSet(pokemonId, selectedName);
  renderSavedSetSelect(side);
  setSetPasteStatus([]);
}

function applyParsedSet(side, parsed) {
  if (parsed.pokemon) seedDamageSide(side, parsed.pokemon);
  const state = damageState[side];
  if (state) {
    writeActiveTeamState(side, {
      ...state,
      ability: parsed.ability ?? state.ability,
      item: parsed.item ?? state.item,
      nature: parsed.nature || state.nature,
      sp: parsed.hasSpread ? parsed.sp : state.sp,
      selectedMoveIds: parsed.selectedMoveIds.length
        ? [0, 1, 2, 3].map((index) => parsed.selectedMoveIds[index] ?? "")
        : state.selectedMoveIds,
    });
    renderSideSelects(side, { spreadName: "" });
    syncSideInputs(side);
    applyAbilityImpliedField(damageState[side].ability);
    applyAbilityImpliedStages();
    syncSideInputs("attacker");
    syncSideInputs("defender");
    renderDamage();
  }
}

function exportSetPaste(side) {
  const state = damageState[side];
  if (!state) return;
  const text = formatSetPaste(state, { moves: damageMovesForSide(side) });
  elements.setPaste.value = text;
  navigator.clipboard?.writeText(text);
  setSetPasteStatus([]);
}

function setPasteCatalogs() {
  return { pokemon, abilities, items, moves };
}

function setSetPasteStatus(warnings) {
  elements.setPasteStatus.textContent = warnings.length
    ? t("count.warnings", { count: warnings.length })
    : t("battle.ready");
  elements.setPasteWarnings.hidden = warnings.length === 0;
  elements.setPasteWarnings.textContent = warnings.map((warning) => formatSetWarning(warning, getLocale())).join(" · ");
}

function controlFromTarget(target) {
  const idMatch = /^(attacker|defender)-(spread|nature|ability|item|speed-multiplier|status|current-hp|hp-percent)$/.exec(
    target.id ?? "",
  );
  if (idMatch) {
    const [, side, key] = idMatch;
    const kind = ID_CONTROL_KINDS[key];
    if (key === "current-hp" || key === "hp-percent") {
      const maxHp = finalStat(damageState[side], "hp");
      const value = key === "current-hp" ? Number(target.value) / maxHp : Number(target.value) / 100;
      return { kind: "currentHpFraction", side, value, maxHp };
    }
    return { kind, side, value: controlValue(kind, target) };
  }
  if (target.dataset.kind === "sp" || target.dataset.kind === "stage") {
    const { side, kind, stat } = target.dataset;
    return { kind, side, stat, value: target.value };
  }
  if (target.dataset.kind === "damage-move") {
    const { side, index } = target.dataset;
    return { kind: "move", side, index: Number(index), value: target.value };
  }
  if (target.dataset.kind === "single-target") {
    const { side, index } = target.dataset;
    return { kind: "singleTarget", side, index: Number(index), value: target.checked };
  }
  if (target.dataset.kind === "hit-count") {
    const { side, index } = target.dataset;
    return { kind: "hitCount", side, index: Number(index), value: target.value };
  }
  if (target.dataset.kind === "target-moved") {
    const { side, index } = target.dataset;
    return { kind: "targetMoved", side, index: Number(index), value: target.value === "auto" ? null : target.value };
  }
  if (target.dataset.kind === "crit") {
    const { side, index } = target.dataset;
    return { kind: "crit", side, index: Number(index), value: target.getAttribute("aria-pressed") === "true" };
  }
  if (target.dataset.kind === "move-condition") {
    const { side, index } = target.dataset;
    return { kind: "moveCondition", side, index: Number(index), value: target.value === "auto" ? null : target.value };
  }
  if (target.dataset.kind === "ally-plus-minus") {
    return { kind: "allyPlusMinus", side: target.dataset.side, value: target.checked };
  }
  if (target.dataset.kind === "rivalry") {
    return { kind: "rivalry", side: target.dataset.side, value: target.value };
  }
  if (target.dataset.kind === "switched-in") {
    return { kind: "switchedIn", side: target.dataset.side, value: target.checked };
  }
  if (target.dataset.kind === "fainted-allies") {
    return { kind: "faintedAllyCount", side: target.dataset.side, value: target.value };
  }
  if (target.dataset.kind === "booster-energy") {
    return { kind: "boosterEnergy", side: target.dataset.side, value: target.checked };
  }
  if (target.dataset.kind === "ice-face-intact") {
    return { kind: "iceFaceIntact", side: target.dataset.side, value: target.checked };
  }
  return null;
}

function controlValue(kind, target) {
  if (kind === "ability") return selectedOptionEntry(target, abilityLookup);
  if (kind === "item") return selectedOptionEntry(target, itemLookup);
  return target.value;
}

function selectedOptionEntry(select, lookup) {
  if (!select.value) return null;
  return lookup.get(normalizeDamageId(select.value)) ?? {
    id: select.value,
    name: select.selectedOptions[0]?.textContent?.split(" · ")[0] ?? select.value,
  };
}

function renderDamageMovePickers(side) {
  const state = damageState[side];
  if (!state?.pokemon) {
    clearMoveComboboxes(side);
    return;
  }
  const sideMoves = damageMovesForSide(side);
  clearMoveComboboxes(side);

  elements[`${side}MovePicks`].replaceChildren(
    ...[0, 1, 2, 3].map((index) => {
      const row = document.createElement("div");
      row.className = "damage-move-row";
      const moveLabel = document.createElement("span");
      moveLabel.className = "damage-move-number";
      moveLabel.textContent = t("battle.moveNumber", { number: index + 1 });

      const combobox = document.createElement("div");
      combobox.className = "move-combobox";
      const selectedId = state.selectedMoveIds[index] ?? sideMoves[index]?.id ?? "";
      const selectedMove = sideMoves.find((move) => normalizeDamageId(move.id) === normalizeDamageId(selectedId));
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.value = selectedMove?.id ?? selectedId;
      hidden.dataset.kind = "damage-move";
      hidden.dataset.side = side;
      hidden.dataset.index = String(index);
      const search = document.createElement("input");
      search.type = "search";
      search.autocomplete = "off";
      search.role = "combobox";
      search.placeholder = selectedMove ? localizedName(selectedMove) : t("label.chooseMove");
      search.setAttribute("aria-label", t("battle.moveNumber", { number: index + 1 }));
      const results = document.createElement("div");
      results.className = "search-results move-search-results";
      results.hidden = true;
      combobox.append(hidden, search, results);
      const moveCombobox = attachCombobox({
        input: search,
        resultsEl: results,
        getMatches: (query) => filterMoves(sideMoves, { query }),
        onSelect: (picked) => {
          hidden.value = picked.id;
          search.value = localizedName(picked);
          search.placeholder = localizedName(picked);
          handleDamageControl({ target: hidden });
        },
        renderRow: (move, onSelect) => searchResultButton(move, onSelect, {
          preventBlur: true,
          small: `${move.type ?? "—"} · ${move.category ?? "—"}`,
          strong: move.basePower ?? "—",
        }),
      });
      moveComboboxCleanups[side].push(moveCombobox.destroy);
      row.append(moveLabel, combobox);

      const crit = document.createElement("button");
      crit.type = "button";
      crit.className = "move-toggle";
      crit.textContent = t("battle.crit");
      crit.dataset.kind = "crit";
      crit.dataset.side = side;
      crit.dataset.index = String(index);
      const alwaysCrit = selectedMove && moveEffect(normalizeDamageId(selectedMove.id)).alwaysCrit === true;
      crit.disabled = Boolean(alwaysCrit);
      crit.setAttribute("aria-pressed", String(alwaysCrit || Boolean(state.critMoves?.[index])));
      crit.addEventListener("click", () => {
        crit.setAttribute("aria-pressed", String(crit.getAttribute("aria-pressed") !== "true"));
        handleDamageControl({ target: crit });
      });
      row.append(crit);

      const hitRange = selectedMove ? moveHitCountRange(selectedMove, state) : null;
      if (hitRange && hitRange.min !== hitRange.max) {
        const hitCountLabel = document.createElement("label");
        hitCountLabel.className = "move-inline-control";
        hitCountLabel.textContent = t("battle.hits");
        const hitCount = document.createElement("select");
        hitCount.dataset.kind = "hit-count";
        hitCount.dataset.side = side;
        hitCount.dataset.index = String(index);
        hitCount.replaceChildren(
          ...Array.from({ length: hitRange.max - hitRange.min + 1 }, (_, offset) => {
            const count = hitRange.min + offset;
            return optionElement(count, String(count));
          }),
        );
        hitCount.value = String(selectedHitCountFor(side, index, hitRange));
        hitCount.addEventListener("input", handleDamageControl);
        hitCountLabel.append(hitCount);
        row.append(hitCountLabel);
      }
      if (selectedMove && isOrderConditionalMove(selectedMove)) {
        const assumptionLabel = document.createElement("label");
        assumptionLabel.className = "move-inline-control";
        assumptionLabel.textContent = t("battle.targetMoved");
        const assumption = document.createElement("select");
        assumption.dataset.kind = "target-moved";
        assumption.dataset.side = side;
        assumption.dataset.index = String(index);
        assumption.replaceChildren(optionElement("auto", t("battle.auto")), optionElement("yes", t("battle.yes")), optionElement("no", t("battle.no")));
        const movedOverride = state.targetMovedOverrides?.[index];
        assumption.value = movedOverride === null || movedOverride === undefined ? "auto" : movedOverride ? "yes" : "no";
        assumption.addEventListener("input", handleDamageControl);
        assumptionLabel.append(assumption);
        row.append(assumptionLabel);
      }
      const condition = selectedMove ? moveCondition(selectedMove) : null;
      if (condition) {
        const conditionLabel = document.createElement("label");
        conditionLabel.className = "move-inline-control";
        conditionLabel.textContent = localizedTerm("condition", condition.label);
        const select = document.createElement("select");
        select.dataset.kind = "move-condition";
        select.dataset.side = side;
        select.dataset.index = String(index);
        select.replaceChildren(optionElement("auto", t("battle.auto")), optionElement("yes", t("battle.yes")), optionElement("no", t("battle.no")));
        const override = state.conditionOverrides?.[index];
        select.value = override === null || override === undefined ? "auto" : override ? "yes" : "no";
        select.addEventListener("input", handleDamageControl);
        conditionLabel.append(select);
        row.append(conditionLabel);
      }
      return row;
    }),
  );
}

function clearMoveComboboxes(side) {
  for (const cleanup of moveComboboxCleanups[side]) cleanup();
  moveComboboxCleanups[side] = [];
}

function moveHitCountRange(move, state) {
  return resolveHitCountRange(
    hitCountRange({ move, attackerState: state }),
    { move, attackerState: state },
  );
}

function selectedHitCountFor(side, index, range) {
  const storedValue = damageState[side].selectedHitCounts?.[index];
  const stored = Number(storedValue);
  const requested = storedValue !== null && storedValue !== undefined && Number.isFinite(stored) ? stored : 3;
  return Math.max(range.min, Math.min(range.max, Math.trunc(requested)));
}

function renderDamage() {
  const attacker = damageState.attacker;
  const defender = damageState.defender;
  if (!attacker?.pokemon || !defender?.pokemon) {
    elements.damageSource.textContent = t("battle.selectSides");
    elements.attackerSummary.textContent = attacker ? sideSummary(attacker) : "—";
    elements.defenderSummary.textContent = defender ? sideSummary(defender) : "—";
    elements.attackerStatEditor.replaceChildren();
    elements.defenderStatEditor.replaceChildren();
    elements.moveOrder.textContent = t("battle.selectSidesOrder");
    elements.speedSummary.textContent = "";
    elements.damageCount.textContent = "—";
    elements.damageList.replaceChildren();
    applyDocumentTranslations();
    return;
  }

  elements.damageSource.textContent = t("battle.defaults");

  elements.attackerSummary.textContent = sideSummary(attacker);
  elements.defenderSummary.textContent = sideSummary(defender);
  const speedContext = finalSpeedContext();
  renderStatEditor("attacker", speedContext.field, speedContext.options);
  renderStatEditor("defender", speedContext.field, speedContext.options);
  syncCurrentHpInputs("attacker");
  syncCurrentHpInputs("defender");

  const calcInput = buildCalcInput(damageState, fieldState);

  renderMoveOrder(calcInput.field, calcInput);
  const attackerRows = selectedDamageMoves("attacker").map(({ move, index }, rowIndex) =>
    renderDamageCard(move, "attacker", rowIndex === 0, calcInput, moveOptionsForDamage("attacker", index, move)),
  );
  const defenderRows = selectedDamageMoves("defender").map(({ move, index }, rowIndex) =>
    renderDamageCard(move, "defender", rowIndex === 0, calcInput, moveOptionsForDamage("defender", index, move)),
  );
  const rows = [...attackerRows, ...defenderRows];
  elements.damageCount.textContent = t("count.moves", { count: rows.length });
  elements.damageList.replaceChildren(
    damageColumn(t("battle.attackerMoves"), attackerRows),
    damageColumn(t("battle.defenderMoves"), defenderRows),
  );
  applyDocumentTranslations();
}

function selectedHitCountForMove(side, index, move) {
  const range = moveHitCountRange(move, damageState[side]);
  return range.min === range.max ? undefined : selectedHitCountFor(side, index, range);
}

function targetMovedForMove(side, index, move) {
  const stored = damageState[side].targetMovedOverrides?.[index];
  if (stored !== null && stored !== undefined) return Boolean(stored);
  const otherSide = side === "attacker" ? "defender" : "attacker";
  if (!damageState[otherSide]?.pokemon) return false;
  const opponentMove = selectedDamageMoves(otherSide)[0]?.move;
  if (!opponentMove) return false;
  const sideState = {
    ...damageState[side],
    tailwind: Boolean(fieldState[`${side}Side`]?.tailwind),
  };
  const otherState = {
    ...damageState[otherSide],
    tailwind: Boolean(fieldState[`${otherSide}Side`]?.tailwind),
  };
  const order = compareMoveOrder({
    attacker: sideState,
    defender: otherState,
    attackerMove: move,
    defenderMove: opponentMove,
    trickRoom: fieldState.trickRoom,
    field: fieldState,
  });
  return order.firstSide === "defender";
}

function moveOptionsForDamage(side, index, move) {
  const otherSide = side === "attacker" ? "defender" : "attacker";
  return {
    singleTarget: damageState[side].singleTargetMoves?.[index],
    hitCount: selectedHitCountForMove(side, index, move),
    critical: Boolean(damageState[side].critMoves?.[index]),
    conditionOverride: damageState[side].conditionOverrides?.[index] ?? null,
    opponentMove: selectedDamageMoves(otherSide)[0]?.move,
    targetMoved: targetMovedForMove(side, index, move),
  };
}

function renderStatEditor(side, field = {}, speedOptions = {}) {
  const state = damageState[side];
  const container = elements[`${side}StatEditor`];
  if (!state?.pokemon) {
    container.replaceChildren();
    return;
  }
  const nature = NATURES[state.nature] ?? {};
  const fieldStateForSide = {
    ...state,
    tailwind: Boolean(fieldState[`${side}Side`]?.tailwind),
  };
  elements[`${side}SpeedReadout`].textContent = t("battle.speed", { value: finalSpeed(fieldStateForSide, field, speedOptions) });
  const rows = ensureRenderedRows(
    container,
    ".battle-stat-editor-row",
    () => [statEditorHeader(), ...SP_STATS.map((stat) => statEditorRow(stat, {
      side,
      base: state.pokemon.baseStats[stat],
      sp: state.sp[stat] ?? 0,
      final: finalStat(fieldStateForSide, stat, field, speedOptions),
      stage: state.stages[stat] ?? 0,
      onChange: handleDamageControl,
    }))],
  );
  for (const [index, stat] of SP_STATS.entries()) {
    const row = rows[index];
    row.querySelector(".stat-cell-base").textContent = String(state.pokemon.baseStats[stat]);
    row.querySelector('input[data-kind="sp"]').value = String(state.sp[stat] ?? 0);
    const final = row.querySelector(".stat-cell-final");
    final.textContent = String(finalStat(fieldStateForSide, stat, field, speedOptions));
    final.classList.toggle("increase", nature.up === stat);
    final.classList.toggle("decrease", nature.down === stat);
    const stage = row.querySelector('select[data-kind="stage"]');
    if (stage) stage.value = String(state.stages[stat] ?? 0);
  }
}

function statEditorHeader() {
  const header = document.createElement("div");
  header.className = "battle-stat-editor-header";
  for (const label of [t("battle.statHeader"), t("battle.baseHeader"), "SP", t("battle.finalHeader"), t("battle.stageHeader")]) {
    const cell = document.createElement("span");
    cell.textContent = label;
    header.append(cell);
  }
  return header;
}

function syncCurrentHpInputs(side) {
  const state = damageState[side];
  if (!state?.pokemon) return;
  const maxHp = finalStat(state, "hp");
  const currentHp = Math.min(maxHp, Math.max(1, Math.round(maxHp * state.currentHpFraction)));
  elements[`${side}CurrentHp`].min = "1";
  elements[`${side}CurrentHp`].max = String(maxHp);
  elements[`${side}CurrentHp`].value = String(currentHp);
  elements[`${side}MaxHp`].textContent = `/ ${maxHp}`;
  elements[`${side}HpPercent`].value = String(Number(((currentHp / maxHp) * 100).toFixed(1)));
}

function syncAssumptionInputs(side) {
  const state = damageState[side];
  for (const input of elements.assumptionInputs) {
    if (input.dataset.side !== side) continue;
    if (input.dataset.kind === "ally-plus-minus") input.checked = Boolean(state.allyPlusMinus);
    if (input.dataset.kind === "switched-in") input.checked = Boolean(state.switchedIn);
    if (input.dataset.kind === "rivalry") input.value = state.rivalry ?? "off";
    if (input.dataset.kind === "fainted-allies") input.value = String(state.faintedAllyCount ?? 0);
    if (input.dataset.kind === "booster-energy") input.checked = Boolean(state.boosterEnergy);
    if (input.dataset.kind === "ice-face-intact") input.checked = state.iceFaceIntact !== false;
  }
}

function finalStat(state, stat, field = {}, speedOptions = {}) {
  if (stat === "spe") return finalSpeed(state, field, speedOptions);
  return calculateStat({
    base: state.pokemon.baseStats[stat],
    stat,
    sp: state.sp[stat] ?? 0,
    nature: state.nature,
    stage: stat === "hp" ? 0 : state.stages[stat] ?? 0,
  });
}

function damageColumn(title, cards) {
  const column = document.createElement("section");
  column.className = "damage-result-column";
  column.setAttribute("aria-label", title);

  const heading = document.createElement("h3");
  heading.textContent = title;
  column.append(heading, ...cards);
  return column;
}

function renderDamageCard(move, sourceSide, selected, calcInput, moveOptions = {}) {
  const isDefenderSource = sourceSide === "defender";
  const result = calculateDamage({
    attacker: isDefenderSource ? calcInput.defender : calcInput.attacker,
    defender: isDefenderSource ? calcInput.attacker : calcInput.defender,
    move,
    attackerState: isDefenderSource ? calcInput.defenderState : calcInput.attackerState,
    defenderState: isDefenderSource ? calcInput.attackerState : calcInput.defenderState,
    // The Defender's side conditions boost the defender's own moves when it's the source of
    // this row (and the Attacker's side conditions become the incoming screens) — see
    // battle-state.js's buildCalcInput doc comment.
    field: isDefenderSource ? calcInput.reverseField : calcInput.field,
    critical: moveOptions.critical,
    moveOptions,
  });
  const description = formatResultDescription({
    attackerState: isDefenderSource ? calcInput.defenderState : calcInput.attackerState,
    defenderState: isDefenderSource ? calcInput.attackerState : calcInput.defenderState,
    move,
    field: isDefenderSource ? calcInput.reverseField : calcInput.field,
    result,
  }, getLocale());

  const card = document.createElement("article");
  card.className = `damage-result-card${selected ? " selected" : ""}`;

  const heading = document.createElement("div");
  heading.className = "damage-result-heading";

  const name = document.createElement("strong");
  name.textContent = localizedName(move);

  const percent = document.createElement("span");
  percent.className = "damage-percent";
  percent.textContent = result.supported ? formatDamageResult(result) : t("battle.unsupported");
  const percentColor = result.supported
    ? damagePercentColor(result.minPercent, result.maxPercent)
    : damagePercentColor(0);
  percent.style.setProperty("--damage-percent-color", percentColor);
  heading.append(name, percent);

  const meta = document.createElement("div");
  meta.className = "damage-result-meta";
  if (move.type) meta.append(typeBadge(move.type));

  const priority = Number(move.priority ?? 0);
  if (priority !== 0) {
    const priorityBadge = document.createElement("span");
    priorityBadge.className = `move-priority-badge inline ${priority > 0 ? "positive" : "negative"}`;
    priorityBadge.textContent = formatMovePriority(priority);
    meta.append(priorityBadge);
  }

  const ko = document.createElement("span");
  ko.className = "damage-ko";
  ko.textContent = result.supported
    ? formatKoResult(result.ko, getLocale())
    : formatDamageReason(formatDamageResult(result), getLocale());
  card.append(heading, meta);
  if (selected) card.append(ko);

  if (selected && result.supported) {
    const line = document.createElement("p");
    line.className = "damage-result-line";
    line.textContent = description;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "damage-copy-button";
    copy.textContent = t("battle.copy");
    copy.addEventListener("click", () => {
      navigator.clipboard?.writeText(description);
    });

    card.append(line, copy);
  }

  if (selected && result.supported && result.notes?.length) {
    const notes = document.createElement("p");
    notes.className = "damage-notes";
    notes.textContent = result.notes.map((note) => formatDamageNote(note, getLocale(), {
      move,
      entities: [
        calcInput.attackerState.ability,
        calcInput.attackerState.item,
        calcInput.defenderState.ability,
        calcInput.defenderState.item,
      ],
    })).join(" · ");
    card.append(notes);
  }

  return card;
}

function renderMoveOrder(field, calcInput) {
  const [attackerEntry] = selectedDamageMoves("attacker");
  const [defenderEntry] = selectedDamageMoves("defender");
  const attackerMove = attackerEntry?.move;
  const defenderMove = defenderEntry?.move;
  if (!attackerMove || !defenderMove) {
    elements.moveOrder.textContent = t("battle.selectMovesOrder");
    return;
  }

  const result = compareMoveOrder({
    attacker: calcInput.attackerState,
    defender: calcInput.defenderState,
    attackerMove,
    defenderMove,
    trickRoom: field.trickRoom,
    field,
  });
  elements.moveOrder.textContent = formatMoveOrderResult(result, field, getLocale());
  elements.speedSummary.textContent = t("battle.speedComparison", {
    attacker: localizedName(damageState.attacker.pokemon),
    attackerSpeed: result.attackerSpeed,
    defender: localizedName(damageState.defender.pokemon),
    defenderSpeed: result.defenderSpeed,
  });
}

function neutralizingGasActive() {
  return [damageState.attacker, damageState.defender]
    .some((state) => normalizeDamageId(state?.ability?.id ?? state?.ability?.name) === "neutralizinggas");
}

function finalSpeedContext() {
  const neutralizingGas = neutralizingGasActive();
  const weatherSuppressed = !neutralizingGas && [damageState.attacker, damageState.defender]
    .some((state) => ["cloudnine", "airlock"].includes(
      normalizeDamageId(state?.ability?.id ?? state?.ability?.name),
    ));
  return {
    field: weatherSuppressed ? { ...fieldState, weather: "" } : fieldState,
    options: { suppressAbility: neutralizingGas },
  };
}

function selectedDamageMoves(side) {
  const movesById = new Map(damageMovesForSide(side).map((move) => [normalizeDamageId(move.id), move]));
  return damageState[side].selectedMoveIds
    .map((id, index) => {
      const move = movesById.get(normalizeDamageId(id));
      return move ? { move, index } : null;
    })
    .filter(Boolean);
}

function damageMovesForSide(side) {
  const state = damageState[side];
  if (!state?.pokemon) return [];
  return rankByUsage(
    resolveChampionsPokemonMoves(state.pokemon, moveLookup),
    state.pokemon.champions?.usage?.moves,
  );
}

function sideSummary(state) {
  const hp = calculateStat({
    base: state.pokemon.baseStats.hp,
    stat: "hp",
    sp: state.sp.hp,
    nature: state.nature,
  });
  return `${localizedName(state.pokemon)} · ${localizedTerm("nature", state.nature)} · HP ${hp}`;
}

function normalizeDamageId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function loadStoredTeams() {
  return teamStore.read().teams;
}

function persistTeams() {
  teamStore.write({ version: 1, teams });
}

function restoreTeams(storedTeams) {
  const restored = createTeamsState();
  for (const side of ["attacker", "defender"]) {
    const source = storedTeams?.[side];
    if (!source) continue;
    const slots = Array.from({ length: TEAM_SIZE }, (_, index) => restoreSideState(source.slots?.[index]));
    const activeIndex = Number.isInteger(source.activeIndex) && source.activeIndex >= 0 && source.activeIndex < TEAM_SIZE
      ? source.activeIndex
      : 0;
    restored[side] = { slots, activeIndex };
  }
  return restored;
}

function restoreSideState(storedState) {
  if (!storedState?.pokemon?.id) return null;
  const entry = pokemon.find(({ id }) => normalizeDamageId(id) === normalizeDamageId(storedState.pokemon.id));
  if (!entry) return null;

  const defaults = championsDefaultsForPokemon(entry, { abilityLookup, moveLookup, items });
  const base = createSideState(entry, defaults);
  const { teraType: _ignoredTeraType, tailwind: _ignoredTailwind, ...stored } = storedState;
  const selectedMoveIds = Array.isArray(storedState.selectedMoveIds)
    ? Array.from({ length: 4 }, (_, index) => normalizeDamageId(storedState.selectedMoveIds[index]))
    : base.selectedMoveIds;
  return {
    ...base,
    ...stored,
    pokemon: entry,
    ability: storedState.ability ? resolveStoredEntry(storedState.ability, abilityLookup) : null,
    item: storedState.item ? resolveStoredEntry(storedState.item, itemLookup) : null,
    sp: { ...base.sp, ...(storedState.sp ?? {}) },
    stages: { ...base.stages, ...(storedState.stages ?? {}) },
    selectedMoveIds,
    selectedHitCounts: Array.from({ length: 4 }, (_, index) => storedState.selectedHitCounts?.[index] ?? null),
    targetMovedOverrides: Array.from({ length: 4 }, (_, index) => storedState.targetMovedOverrides?.[index] ?? null),
    critMoves: Array.from({ length: 4 }, (_, index) => Boolean(storedState.critMoves?.[index])),
    conditionOverrides: Array.from({ length: 4 }, (_, index) => storedState.conditionOverrides?.[index] ?? null),
    singleTargetMoves: Array.from({ length: 4 }, (_, index) => Boolean(storedState.singleTargetMoves?.[index])),
  };
}

function resolveStoredEntry(storedEntry, lookup) {
  return lookup.get(normalizeDamageId(storedEntry.id ?? storedEntry.name)) ?? storedEntry;
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

import {
  formatMovePriority,
  formatChampionsUsage,
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
import { isOrderConditionalMove } from "../engine/move-effects.js";
import { resultDescription } from "../engine/result-text.js";
import { formatSetPaste, parseSetPaste } from "../data/set-paste.js";
import { createSavedSetStore } from "../data/saved-sets.js";
import { searchPokemon } from "../data/pokemon.js";
import { finalSpeed } from "../engine/speed.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
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
import { loadCatalogs, rankByUsage } from "./bootstrap.js";
import {
  damagePercentColor,
  optionElement,
  searchResultButton,
  spInput,
  stageInput,
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
  attackerSpInputs: document.querySelector("#attacker-sp-inputs"),
  defenderSpInputs: document.querySelector("#defender-sp-inputs"),
  attackerStageInputs: document.querySelector("#attacker-stage-inputs"),
  defenderStageInputs: document.querySelector("#defender-stage-inputs"),
  attackerSpeedMultiplier: document.querySelector("#attacker-speed-multiplier"),
  defenderSpeedMultiplier: document.querySelector("#defender-speed-multiplier"),
  attackerTailwind: document.querySelector("#attacker-tailwind"),
  defenderTailwind: document.querySelector("#defender-tailwind"),
  attackerStatus: document.querySelector("#attacker-status"),
  defenderStatus: document.querySelector("#defender-status"),
  attackerTera: document.querySelector("#attacker-tera"),
  defenderTera: document.querySelector("#defender-tera"),
  attackerTeraType: document.querySelector("#attacker-tera-type"),
  defenderTeraType: document.querySelector("#defender-tera-type"),
  attackerCurrentHp: document.querySelector("#attacker-current-hp"),
  defenderCurrentHp: document.querySelector("#defender-current-hp"),
  attackerMaxHp: document.querySelector("#attacker-max-hp"),
  defenderMaxHp: document.querySelector("#defender-max-hp"),
  attackerHpPercent: document.querySelector("#attacker-hp-percent"),
  defenderHpPercent: document.querySelector("#defender-hp-percent"),
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
  damageCritical: document.querySelector("#damage-critical"),
  setPaste: document.querySelector("#set-paste"),
  setPasteStatus: document.querySelector("#set-paste-status"),
  setPasteWarnings: document.querySelector("#set-paste-warnings"),
  importAttackerSet: document.querySelector("#import-attacker-set"),
  importDefenderSet: document.querySelector("#import-defender-set"),
  exportAttackerSet: document.querySelector("#export-attacker-set"),
  exportDefenderSet: document.querySelector("#export-defender-set"),
  moveOrder: document.querySelector("#move-order"),
  speedSummary: document.querySelector("#speed-summary"),
  attackerFinalStats: document.querySelector("#attacker-final-stats"),
  defenderFinalStats: document.querySelector("#defender-final-stats"),
  damageCount: document.querySelector("#damage-count"),
  damageList: document.querySelector("#damage-list"),
  status: document.querySelector("#status"),
};

const SP_STATS = STAT_KEYS;
const STAGE_STATS = STAT_KEYS.filter((stat) => stat !== "hp");
const TYPE_OPTIONS = ["Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison", "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy"];
const SPREAD_MOVE_TARGETS = new Set(["allAdjacent", "allAdjacentFoes"]);
const savedSetStore = createSavedSetStore(browserStorage());
const TEAM_STORAGE_KEY = "pokecal.teams.v1";
let teamStorage = browserStorage();
let teamMemoryBlob = null;

// Maps a control element's id suffix (after "attacker-"/"defender-") to the `kind` passed to
// applyControl. Kept in sync with battle.html's control ids.
const ID_CONTROL_KINDS = {
  spread: "spread",
  nature: "nature",
  ability: "ability",
  item: "item",
  "speed-multiplier": "speedMultiplier",
  tailwind: "tailwind",
  status: "status",
  tera: "tera",
  "tera-type": "teraType",
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

// One field-card panel's worth of side conditions — see battle-state.js's buildCalcInput doc
// comment for why this is 8 keys (both boost- and screen-type) rather than the engine's two
// separate 4-key attackerSide/defenderSide shapes.
function neutralFieldSidePanel() {
  return {
    helpingHand: false,
    powerSpot: false,
    battery: false,
    steelySpirit: false,
    reflect: false,
    lightScreen: false,
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

initialize();

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
  renderDamageShell();
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
  elements.attackerTailwind,
  elements.defenderTailwind,
  elements.attackerStatus,
  elements.defenderStatus,
  elements.attackerTera,
  elements.defenderTera,
  elements.attackerTeraType,
  elements.defenderTeraType,
  elements.attackerCurrentHp,
  elements.defenderCurrentHp,
  elements.attackerHpPercent,
  elements.defenderHpPercent,
  elements.damageCritical,
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
  input.addEventListener("input", () => renderPokemonSearchResults(side));
  input.addEventListener("focus", () => renderPokemonSearchResults(side));
  input.addEventListener("keydown", (event) => handlePokemonSearchKeydown(event, side));
}

document.addEventListener("click", (event) => {
  for (const side of ["attacker", "defender"]) {
    const input = elements[`${side}PokemonSearch`];
    const results = elements[`${side}PokemonResults`];
    if (!input.contains(event.target) && !results.contains(event.target)) {
      hidePokemonSearchResults(side);
    }
  }
});

function renderDamageShell() {
  const natureOptions = Object.keys(NATURES).map((nature) =>
    optionElement(nature, natureOptionLabel(nature)),
  );
  elements.attackerNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));
  elements.defenderNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));

  renderSideInputs("attacker");
  renderSideInputs("defender");

  for (const side of ["attacker", "defender"]) {
    if (teams[side].slots.some(Boolean)) renderActiveTeamSlot(side);
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

function renderPokemonSearchResults(side) {
  const input = elements[`${side}PokemonSearch`];
  const results = elements[`${side}PokemonResults`];
  const matches = searchPokemon(pokemon, input.value, {
    abilityLookup,
    moveLookup,
    itemLookup,
    limit: 8,
  });

  results.replaceChildren(
    ...matches.map((entry) =>
      searchResultButton(entry, (picked) => seedDamageSide(side, picked), { preventBlur: true }),
    ),
  );
  const isOpen = matches.length > 0;
  results.hidden = !isOpen;
  input.setAttribute("aria-expanded", String(isOpen));
}

function handlePokemonSearchKeydown(event, side) {
  const results = elements[`${side}PokemonResults`];
  if (event.key === "Escape") {
    hidePokemonSearchResults(side);
    return;
  }
  if (event.key === "ArrowDown") {
    const firstResult = results.querySelector(".search-result");
    if (firstResult) {
      event.preventDefault();
      firstResult.focus();
    }
    return;
  }
  if (event.key !== "Enter") return;

  const [firstResult] = searchPokemon(pokemon, elements[`${side}PokemonSearch`].value, {
    abilityLookup,
    moveLookup,
    itemLookup,
    limit: 1,
  });
  if (!firstResult) return;
  event.preventDefault();
  results.hidden = true;
  seedDamageSide(side, firstResult);
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
  const spContainer = elements[`${side}SpInputs`];
  const stageContainer = elements[`${side}StageInputs`];

  spContainer.replaceChildren(
    ...SP_STATS.map((stat) => spInput({ stat, side, onChange: handleDamageControl })),
  );

  stageContainer.replaceChildren(
    ...STAGE_STATS.map((stat) => stageInput({ stat, side, onChange: handleDamageControl })),
  );
}

function seedDamageSide(side, entry) {
  if (!entry) return;
  const existingState = damageState[side];
  const defaults = championsDefaultsForPokemon(entry, {
    abilityLookup,
    moveLookup,
    items,
  });

  // createSideState gives the pure/default shape; the existing battle-condition controls for
  // this side are preserved rather than reset, same as before the battle-state.js extraction.
  const state = createSideState(entry, defaults);
  state.speedMultiplier = existingState ? Number(elements[`${side}SpeedMultiplier`]?.value ?? 1) : 1;
  state.tailwind = existingState ? elements[`${side}Tailwind`]?.checked ?? false : false;
  state.status = existingState ? elements[`${side}Status`]?.value ?? "" : "";
  writeActiveTeamState(side, state);
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
  elements[`${side}PokemonSearch`].value = state.pokemon.name;
  hidePokemonSearchResults(side);
  renderSideSelects(side, defaults);
  syncSideInputs(side);
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
      activate.textContent = state?.pokemon?.name ?? "+";
      activate.setAttribute("aria-label", state ? `Use ${state.pokemon.name}, slot ${index + 1}` : `Add Pokémon to slot ${index + 1}`);
      activate.addEventListener("click", () => activateTeamSlot(side, index));

      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "team-slot-clear";
      clear.textContent = "×";
      clear.disabled = !state;
      clear.setAttribute("aria-label", `Clear slot ${index + 1}`);
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

function writeActiveTeamState(side, state, { persist = true } = {}) {
  damageState[side] = state;
  teams = updateActiveTeamSlot(teams, side, state);
  if (persist) persistTeams();
}

function setSideControlsDisabled(side, disabled) {
  for (const key of [
    "SavedSet", "SaveSet", "DeleteSet", "Spread", "Nature", "Ability", "Item", "SpeedMultiplier",
    "Tailwind", "Status", "Tera", "TeraType", "CurrentHp", "HpPercent",
  ]) {
    elements[`${side}${key}`].disabled = disabled;
  }
  for (const input of document.querySelectorAll(`[data-side="${side}"]`)) input.disabled = disabled;
}

function renderEmptySide(side) {
  setSideControlsDisabled(side, true);
  elements[`${side}Pokemon`].value = "";
  elements[`${side}PokemonSearch`].value = "";
  elements[`${side}SavedSet`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}Spread`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}Nature`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}Ability`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}Item`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}TeraType`].replaceChildren(optionElement("", "Choose a Pokémon first"));
  elements[`${side}MovePicks`].replaceChildren();
  hidePokemonSearchResults(side);
}

function renderSideSelects(side, defaults) {
  const spreadSelect = elements[`${side}Spread`];
  const natureSelect = elements[`${side}Nature`];
  const abilitySelect = elements[`${side}Ability`];
  const itemSelect = elements[`${side}Item`];
  const teraTypeSelect = elements[`${side}TeraType`];
  const usage = damageState[side].pokemon?.champions?.usage;
  const abilities = rankByUsage(resolvePokemonAbilities(damageState[side].pokemon, abilityLookup), usage?.abilities);
  const rankedItems = rankByUsage(items, usage?.items);

  spreadSelect.replaceChildren(
    optionElement("", "No Champions spread source"),
  );
  spreadSelect.value = defaults.spreadName;
  natureSelect.value = damageState[side].nature;
  abilitySelect.replaceChildren(
    optionElement("", "No ability modifier"),
    ...abilities.map((ability) =>
      optionElement(ability.id, `${ability.name} · ${formatChampionsUsage(ability)}`),
    ),
  );
  itemSelect.replaceChildren(
    optionElement("", "No item modifier"),
    ...rankedItems.map((item) =>
      optionElement(item.id, `${item.name} · ${formatChampionsUsage(item)}`),
    ),
  );
  abilitySelect.value = damageState[side].ability?.id ?? "";
  itemSelect.value = damageState[side].item?.id ?? "";
  teraTypeSelect.replaceChildren(...TYPE_OPTIONS.map((type) => optionElement(type, type)));
  const defaultTeraType = TYPE_OPTIONS.includes(defaults.teraType)
    ? defaults.teraType
    : damageState[side].pokemon.types?.find((type) => TYPE_OPTIONS.includes(type)) ?? TYPE_OPTIONS[0];
  teraTypeSelect.value = defaultTeraType;
  renderDamageMovePickers(side);
  renderSavedSetSelect(side);
}

function renderSavedSetSelect(side, selectedName = "") {
  const state = damageState[side];
  const sets = savedSetStore.listSets(state?.pokemon?.id);
  elements[`${side}SavedSet`].replaceChildren(
    optionElement("", "Champions default"),
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
  elements[`${side}Tailwind`].checked = state.tailwind;
  elements[`${side}Status`].value = state.status;
  elements[`${side}Tera`].checked = Boolean(state.teraType);
  if (state.teraType) elements[`${side}TeraType`].value = state.teraType;
  syncCurrentHpInputs(side);
  for (const input of elements[`${side}SpInputs`].querySelectorAll("input")) {
    input.value = state.sp[input.dataset.stat] ?? 0;
  }
  for (const input of elements[`${side}StageInputs`].querySelectorAll("input")) {
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
      if (["move", "hitCount", "targetMoved", "ability", "item"].includes(control.kind)) {
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
  const name = window.prompt("Save set name", state.pokemon.name);
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
  if (!window.confirm(`Delete saved set "${selectedName}"?`)) return;

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
      teraType: parsed.teraType || state.teraType,
      nature: parsed.nature || state.nature,
      sp: parsed.hasSpread ? parsed.sp : state.sp,
      selectedMoveIds: parsed.selectedMoveIds.length
        ? [0, 1, 2, 3].map((index) => parsed.selectedMoveIds[index] ?? "")
        : state.selectedMoveIds,
    });
    renderSideSelects(side, { spreadName: "", teraType: damageState[side].teraType });
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
    ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
    : "Ready";
  elements.setPasteWarnings.hidden = warnings.length === 0;
  elements.setPasteWarnings.textContent = warnings.join(" · ");
}

function controlFromTarget(target) {
  const idMatch = /^(attacker|defender)-(spread|nature|ability|item|speed-multiplier|tailwind|status|tera|tera-type|current-hp|hp-percent)$/.exec(
    target.id ?? "",
  );
  if (idMatch) {
    const [, side, key] = idMatch;
    const kind = ID_CONTROL_KINDS[key];
    if (key === "tera") {
      return { kind, side, value: { enabled: target.checked, type: elements[`${side}TeraType`].value } };
    }
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
    return { kind: "targetMoved", side, index: Number(index), value: target.checked };
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
  if (kind === "tailwind") return target.checked;
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
  if (!state?.pokemon) return;
  const moves = damageMovesForSide(side);

  elements[`${side}MovePicks`].replaceChildren(
    ...[0, 1, 2, 3].map((index) => {
      const label = document.createElement("label");
      label.textContent = `Move ${index + 1}`;
      const select = document.createElement("select");
      select.dataset.kind = "damage-move";
      select.dataset.side = side;
      select.dataset.index = String(index);
      select.replaceChildren(
        ...moves.map((move) =>
          optionElement(
            move.id,
            `${move.name} · ${formatChampionsUsage(move)} · ${move.type ?? "—"}`,
          ),
        ),
      );
      select.value = state.selectedMoveIds[index] ?? moves[index]?.id ?? "";
      select.addEventListener("input", handleDamageControl);
      label.append(select);

      const selectedMove = moves.find((move) => normalizeDamageId(move.id) === normalizeDamageId(select.value));
      const hitRange = selectedMove ? moveHitCountRange(selectedMove, state) : null;
      if (hitRange && hitRange.min !== hitRange.max) {
        const hitCountLabel = document.createElement("label");
        hitCountLabel.textContent = "Hits";
        const hitCount = document.createElement("select");
        hitCount.dataset.kind = "hit-count";
        hitCount.dataset.side = side;
        hitCount.dataset.index = String(index);
        hitCount.replaceChildren(
          ...Array.from({ length: hitRange.max - hitRange.min + 1 }, (_, offset) => {
            const count = hitRange.min + offset;
            return optionElement(count, `${count} hits`);
          }),
        );
        hitCount.value = String(selectedHitCountFor(side, index, hitRange));
        hitCount.addEventListener("input", handleDamageControl);
        hitCountLabel.append(hitCount);
        label.append(hitCountLabel);
      }
      if (selectedMove && isOrderConditionalMove(selectedMove)) {
        const assumptionLabel = document.createElement("label");
        assumptionLabel.className = "inline-toggle";
        const assumption = document.createElement("input");
        assumption.type = "checkbox";
        assumption.dataset.kind = "target-moved";
        assumption.dataset.side = side;
        assumption.dataset.index = String(index);
        assumption.checked = targetMovedForMove(side, index, selectedMove);
        assumption.addEventListener("input", handleDamageControl);
        assumptionLabel.append(assumption, " Target already moved");
        label.append(assumptionLabel);
      }
      const singleTargetLabel = document.createElement("label");
      singleTargetLabel.className = "inline-toggle";
      singleTargetLabel.hidden = fieldState.format !== "doubles" || !SPREAD_MOVE_TARGETS.has(selectedMove?.target);
      const singleTarget = document.createElement("input");
      singleTarget.type = "checkbox";
      singleTarget.dataset.kind = "single-target";
      singleTarget.dataset.side = side;
      singleTarget.dataset.index = String(index);
      singleTarget.checked = Boolean(state.singleTargetMoves?.[index]);
      singleTarget.addEventListener("input", handleDamageControl);
      singleTargetLabel.append(singleTarget, " 1 target");
      label.append(singleTargetLabel);
      return label;
    }),
  );
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
    elements.damageSource.textContent = "Select one Pokémon on each side to calculate damage.";
    elements.attackerSummary.textContent = attacker ? sideSummary(attacker) : "—";
    elements.defenderSummary.textContent = defender ? sideSummary(defender) : "—";
    elements.attackerFinalStats.replaceChildren();
    elements.defenderFinalStats.replaceChildren();
    elements.moveOrder.textContent = "Select one Pokémon on each side to compare move order.";
    elements.speedSummary.textContent = "";
    elements.damageCount.textContent = "—";
    elements.damageList.replaceChildren();
    return;
  }

  elements.damageSource.textContent =
    "Limitless Champions defaults · ranked ability, item, moves, and nature · neutral 0 SP";

  elements.attackerSummary.textContent = sideSummary(attacker);
  elements.defenderSummary.textContent = sideSummary(defender);
  const speedContext = finalSpeedContext();
  renderFinalStats(elements.attackerFinalStats, attacker, speedContext.field, speedContext.options);
  renderFinalStats(elements.defenderFinalStats, defender, speedContext.field, speedContext.options);
  syncCurrentHpInputs("attacker");
  syncCurrentHpInputs("defender");

  const calcInput = buildCalcInput(damageState, {
    ...fieldState,
    critical: elements.damageCritical.checked,
  });

  renderMoveOrder(calcInput.field);
  const attackerRows = selectedDamageMoves("attacker").map(({ move, index }, rowIndex) =>
    renderDamageCard(move, "attacker", rowIndex === 0, calcInput, moveOptionsForDamage("attacker", index, move)),
  );
  const defenderRows = selectedDamageMoves("defender").map(({ move, index }, rowIndex) =>
    renderDamageCard(move, "defender", rowIndex === 0, calcInput, moveOptionsForDamage("defender", index, move)),
  );
  const rows = [...attackerRows, ...defenderRows];
  elements.damageCount.textContent = `${rows.length} moves`;
  elements.damageList.replaceChildren(
    damageColumn("Attacker moves", attackerRows),
    damageColumn("Defender moves", defenderRows),
  );
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
  const order = compareMoveOrder({
    attacker: damageState[side],
    defender: damageState[otherSide],
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
    opponentMove: selectedDamageMoves(otherSide)[0]?.move,
    targetMoved: targetMovedForMove(side, index, move),
  };
}

function renderFinalStats(container, state, field = {}, speedOptions = {}) {
  const nature = NATURES[state.nature] ?? {};
  container.replaceChildren(
    ...SP_STATS.map((stat) => {
      const entry = document.createElement("span");
      entry.className = "final-stat";

      const label = document.createElement("span");
      label.textContent = STAT_LABELS[stat];

      const value = document.createElement("strong");
      value.textContent = String(finalStat(state, stat, field, speedOptions));
      if (nature.up === stat) value.classList.add("increase");
      if (nature.down === stat) value.classList.add("decrease");

      entry.append(label, value);
      return entry;
    }),
  );
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
    critical: calcInput.critical,
    moveOptions,
  });
  const description = resultDescription({
    attackerState: isDefenderSource ? calcInput.defenderState : calcInput.attackerState,
    defenderState: isDefenderSource ? calcInput.attackerState : calcInput.defenderState,
    move,
    field: isDefenderSource ? calcInput.reverseField : calcInput.field,
    result,
  });

  const card = document.createElement("article");
  card.className = `damage-result-card${selected ? " selected" : ""}`;

  const heading = document.createElement("div");
  heading.className = "damage-result-heading";

  const name = document.createElement("strong");
  name.textContent = move.name;

  const percent = document.createElement("span");
  percent.className = "damage-percent";
  percent.textContent = result.supported ? formatDamageResult(result) : "Unsupported";
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
  ko.textContent = result.supported ? result.ko.text : formatDamageResult(result);
  card.append(heading, meta);
  if (selected) card.append(ko);

  if (selected && result.supported) {
    const line = document.createElement("p");
    line.className = "damage-result-line";
    line.textContent = description;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "damage-copy-button";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      navigator.clipboard?.writeText(description);
    });

    card.append(line, copy);
  }

  if (selected && result.supported && result.notes?.length) {
    const notes = document.createElement("p");
    notes.className = "damage-notes";
    notes.textContent = result.notes.join(" · ");
    card.append(notes);
  }

  return card;
}

function renderMoveOrder(field) {
  const [attackerEntry] = selectedDamageMoves("attacker");
  const [defenderEntry] = selectedDamageMoves("defender");
  const attackerMove = attackerEntry?.move;
  const defenderMove = defenderEntry?.move;
  if (!attackerMove || !defenderMove) {
    elements.moveOrder.textContent = "Select one move on each side to compare move order.";
    return;
  }

  const result = compareMoveOrder({
    attacker: damageState.attacker,
    defender: damageState.defender,
    attackerMove,
    defenderMove,
    trickRoom: field.trickRoom,
    field,
  });
  elements.moveOrder.textContent = result.reason;
  elements.speedSummary.textContent =
    `${damageState.attacker.pokemon.name} Speed ${result.attackerSpeed} vs ` +
    `${damageState.defender.pokemon.name} Speed ${result.defenderSpeed}`;
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
  return `${state.pokemon.name} · ${state.nature} · HP ${hp}`;
}

function normalizeDamageId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function loadStoredTeams() {
  if (!teamStorage) return teamMemoryBlob?.teams ?? null;
  try {
    const parsed = JSON.parse(teamStorage.getItem(TEAM_STORAGE_KEY) || "null");
    if (parsed?.version === 1 && parsed.teams) {
      teamMemoryBlob = parsed;
      return parsed.teams;
    }
    return null;
  } catch {
    teamStorage = null;
    return teamMemoryBlob?.teams ?? null;
  }
}

function persistTeams() {
  const blob = { version: 1, teams };
  teamMemoryBlob = blob;
  if (!teamStorage) return;
  try {
    teamStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(blob));
  } catch {
    teamStorage = null;
  }
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
  const selectedMoveIds = Array.isArray(storedState.selectedMoveIds)
    ? Array.from({ length: 4 }, (_, index) => normalizeDamageId(storedState.selectedMoveIds[index]))
    : base.selectedMoveIds;
  return {
    ...base,
    ...storedState,
    pokemon: entry,
    ability: storedState.ability ? resolveStoredEntry(storedState.ability, abilityLookup) : null,
    item: storedState.item ? resolveStoredEntry(storedState.item, itemLookup) : null,
    sp: { ...base.sp, ...(storedState.sp ?? {}) },
    stages: { ...base.stages, ...(storedState.stages ?? {}) },
    selectedMoveIds,
    selectedHitCounts: Array.from({ length: 4 }, (_, index) => storedState.selectedHitCounts?.[index] ?? null),
    targetMovedOverrides: Array.from({ length: 4 }, (_, index) => storedState.targetMovedOverrides?.[index] ?? null),
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

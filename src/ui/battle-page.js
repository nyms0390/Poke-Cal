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
  koSummary,
  NATURES,
  natureOptionLabel,
} from "../engine/damage.js";
import { searchPokemon } from "../data/pokemon.js";
import { finalSpeed } from "../engine/speed.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { applyControl, buildCalcInput, createSideState } from "./battle-state.js";
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
  attackerCurrentHp: document.querySelector("#attacker-current-hp"),
  defenderCurrentHp: document.querySelector("#defender-current-hp"),
  attackerMaxHp: document.querySelector("#attacker-max-hp"),
  defenderMaxHp: document.querySelector("#defender-max-hp"),
  attackerHpPercent: document.querySelector("#attacker-hp-percent"),
  defenderHpPercent: document.querySelector("#defender-hp-percent"),
  trickRoom: document.querySelector("#trick-room"),
  fieldGravity: document.querySelector("#field-gravity"),
  fieldFormatInputs: document.querySelectorAll('input[name="field-format"]'),
  fieldWeatherInputs: document.querySelectorAll('input[name="field-weather"]'),
  fieldTerrainInputs: document.querySelectorAll('input[name="field-terrain"]'),
  fieldSideInputs: document.querySelectorAll('input[data-kind="field-side"]'),
  damageCritical: document.querySelector("#damage-critical"),
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
};

let pokemon = [];
let abilityLookup = new Map();
let itemLookup = new Map();
let moveLookup = new Map();
let items = [];
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
  abilityLookup = data.abilityLookup;
  itemLookup = data.itemLookup;
  moveLookup = data.moveLookup;
  items = data.items;
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

for (const side of ["attacker", "defender"]) {
  const input = elements[`${side}PokemonSearch`];
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

  seedDamageSide("attacker", pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0]);
  seedDamageSide(
    "defender",
    pokemon.find(({ id }) => id === "blastoise") ??
      pokemon.find(({ id }) => id !== "pikachu") ??
      pokemon[0],
  );
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
  const defaults = championsDefaultsForPokemon(entry, {
    abilityLookup,
    moveLookup,
    items,
  });

  // createSideState gives the pure/default shape; the existing battle-condition controls for
  // this side are preserved rather than reset, same as before the battle-state.js extraction.
  const state = createSideState(entry, defaults);
  state.speedMultiplier = Number(elements[`${side}SpeedMultiplier`]?.value ?? 1);
  state.tailwind = elements[`${side}Tailwind`]?.checked ?? false;
  state.status = elements[`${side}Status`]?.value ?? "";
  damageState[side] = state;

  elements[`${side}Pokemon`].value = entry.id;
  elements[`${side}PokemonSearch`].value = entry.name;
  hidePokemonSearchResults(side);
  renderSideSelects(side, defaults);
  syncSideInputs(side);
  renderDamage();
}

function renderSideSelects(side, defaults) {
  const spreadSelect = elements[`${side}Spread`];
  const natureSelect = elements[`${side}Nature`];
  const abilitySelect = elements[`${side}Ability`];
  const itemSelect = elements[`${side}Item`];
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
  renderDamageMovePickers(side);
}

function syncSideInputs(side) {
  const state = damageState[side];
  if (!state) return;
  elements[`${side}Nature`].value = state.nature;
  elements[`${side}Status`].value = state.status;
  syncCurrentHpInputs(side);
  for (const input of elements[`${side}SpInputs`].querySelectorAll("input")) {
    input.value = state.sp[input.dataset.stat] ?? 0;
  }
  for (const input of elements[`${side}StageInputs`].querySelectorAll("input")) {
    input.value = state.stages[input.dataset.stat] ?? 0;
  }
}

// Updates the module-level fieldState from a Field-card control (format/weather/terrain radio
// groups, gravity/Trick Room checkboxes). Kept separate from damageState/applyControl since the
// field applies to both sides at once and must survive either side's Pokémon changing.
function handleFieldControl(event) {
  const { name, id, checked, value, dataset } = event.target;
  if (dataset.kind === "field-side") {
    const { side, key } = dataset;
    fieldState = { ...fieldState, [side]: { ...fieldState[side], [key]: checked } };
  } else if (name === "field-format") fieldState = { ...fieldState, format: value };
  else if (name === "field-weather") fieldState = { ...fieldState, weather: value };
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
      damageState[control.side] = applyControl(state, control);
      if (control.kind === "spread") syncSideInputs(control.side);
      if (control.kind === "sp" || control.kind === "stage") {
        const key = control.kind === "stage" ? "stages" : "sp";
        event.target.value = damageState[control.side][key][control.stat];
      }
    }
  }
  renderDamage();
}

function controlFromTarget(target) {
  const idMatch = /^(attacker|defender)-(spread|nature|ability|item|speed-multiplier|tailwind|status|current-hp|hp-percent)$/.exec(
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
      return label;
    }),
  );
}

function renderDamage() {
  const attacker = damageState.attacker;
  const defender = damageState.defender;
  if (!attacker?.pokemon || !defender?.pokemon) return;

  elements.damageSource.textContent =
    "Limitless Champions defaults · ranked ability, item, moves, and nature · neutral 0 SP";

  elements.attackerSummary.textContent = sideSummary(attacker);
  elements.defenderSummary.textContent = sideSummary(defender);
  renderFinalStats(elements.attackerFinalStats, attacker);
  renderFinalStats(elements.defenderFinalStats, defender);
  syncCurrentHpInputs("attacker");
  syncCurrentHpInputs("defender");

  const calcInput = buildCalcInput(damageState, {
    ...fieldState,
    critical: elements.damageCritical.checked,
  });

  renderMoveOrder(calcInput.field);
  elements.speedSummary.textContent =
    `${attacker.pokemon.name} Speed ${finalSpeed(attacker)} vs ` +
    `${defender.pokemon.name} Speed ${finalSpeed(defender)}`;

  const attackerRows = selectedDamageMoves("attacker").map((move, index) =>
    renderDamageCard(move, "attacker", index === 0, calcInput),
  );
  const defenderRows = selectedDamageMoves("defender").map((move, index) =>
    renderDamageCard(move, "defender", index === 0, calcInput),
  );
  const rows = [...attackerRows, ...defenderRows];
  elements.damageCount.textContent = `${rows.length} moves`;
  elements.damageList.replaceChildren(
    damageColumn("Attacker moves", attackerRows),
    damageColumn("Defender moves", defenderRows),
  );
}

function renderFinalStats(container, state) {
  const nature = NATURES[state.nature] ?? {};
  container.replaceChildren(
    ...SP_STATS.map((stat) => {
      const entry = document.createElement("span");
      entry.className = "final-stat";

      const label = document.createElement("span");
      label.textContent = STAT_LABELS[stat];

      const value = document.createElement("strong");
      value.textContent = String(finalStat(state, stat));
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

function finalStat(state, stat) {
  if (stat === "spe") return finalSpeed(state);
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

function renderDamageCard(move, sourceSide, selected, calcInput) {
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
  ko.textContent = result.supported ? koSummary(result) : formatDamageResult(result);
  card.append(heading, meta, ko);

  if (result.supported && result.notes?.length) {
    const notes = document.createElement("p");
    notes.className = "damage-notes";
    notes.textContent = result.notes.join(" · ");
    card.append(notes);
  }

  return card;
}

function renderMoveOrder(field) {
  const [attackerMove] = selectedDamageMoves("attacker");
  const [defenderMove] = selectedDamageMoves("defender");
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
  });
  elements.moveOrder.textContent = result.reason;
}

function selectedDamageMoves(side) {
  const movesById = new Map(damageMovesForSide(side).map((move) => [normalizeDamageId(move.id), move]));
  return damageState[side].selectedMoveIds
    .map((id) => movesById.get(normalizeDamageId(id)))
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

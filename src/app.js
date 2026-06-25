import {
  buildAbilityLookup,
  buildItemLookup,
  buildMoveLookup,
  filterMoves,
  formatMoveAccuracy,
  formatMovePower,
  formatMovePriority,
  formatUsagePercent,
  mergeUsage,
  moveEffect,
  resolvePokemonItems,
  resolvePokemonAbilities,
  resolvePokemonMoves,
  sortByUsage,
  usageForPokemon,
} from "./catalog.js";
import { calculateDamage, calculateStat, koSummary, NATURES } from "./damage.js";
import { megaFamily, searchPokemon } from "./pokemon.js";
import { calculateSpeed } from "./speed.js";
import { totalBaseStats } from "./stats.js";
import { parseUsageSpread, usageDefaultsForPokemon } from "./usage-defaults.js";

const elements = {
  search: document.querySelector("#pokemon-search"),
  results: document.querySelector("#search-results"),
  selectedName: document.querySelector("#selected-name"),
  selectedAlias: document.querySelector("#selected-alias"),
  baseStats: document.querySelector("#base-stats"),
  baseStatTotal: document.querySelector("#base-stat-total"),
  movesTab: document.querySelector("#moves-tab"),
  speedTab: document.querySelector("#speed-tab"),
  damageTab: document.querySelector("#damage-tab"),
  movesPage: document.querySelector("#moves-page"),
  speedPage: document.querySelector("#speed-page"),
  damagePage: document.querySelector("#damage-page"),
  formField: document.querySelector("#form-field"),
  form: document.querySelector("#form"),
  usageSource: document.querySelector("#usage-source"),
  abilityCount: document.querySelector("#ability-count"),
  abilityList: document.querySelector("#ability-list"),
  itemCount: document.querySelector("#item-count"),
  itemList: document.querySelector("#item-list"),
  moveCount: document.querySelector("#move-count"),
  moveSearch: document.querySelector("#move-search"),
  moveType: document.querySelector("#move-type"),
  moveCategory: document.querySelector("#move-category"),
  moveList: document.querySelector("#move-list"),
  sp: document.querySelector("#sp"),
  spOutput: document.querySelector("#sp-output"),
  nature: document.querySelector("#nature"),
  stage: document.querySelector("#stage"),
  tailwind: document.querySelector("#tailwind"),
  paralyzed: document.querySelector("#paralyzed"),
  speedMultiplier: document.querySelector("#speed-multiplier"),
  trickRoom: document.querySelector("#trick-room"),
  trainedSpeed: document.querySelector("#trained-speed"),
  finalSpeed: document.querySelector("#final-speed"),
  orderNote: document.querySelector("#order-note"),
  damageSource: document.querySelector("#damage-source"),
  attackerSummary: document.querySelector("#attacker-summary"),
  defenderSummary: document.querySelector("#defender-summary"),
  attackerPokemon: document.querySelector("#attacker-pokemon"),
  defenderPokemon: document.querySelector("#defender-pokemon"),
  attackerSpread: document.querySelector("#attacker-spread"),
  defenderSpread: document.querySelector("#defender-spread"),
  attackerNature: document.querySelector("#attacker-nature"),
  defenderNature: document.querySelector("#defender-nature"),
  attackerAbility: document.querySelector("#attacker-ability"),
  defenderAbility: document.querySelector("#defender-ability"),
  attackerItem: document.querySelector("#attacker-item"),
  defenderItem: document.querySelector("#defender-item"),
  attackerSpInputs: document.querySelector("#attacker-sp-inputs"),
  defenderSpInputs: document.querySelector("#defender-sp-inputs"),
  attackerStageInputs: document.querySelector("#attacker-stage-inputs"),
  defenderStageInputs: document.querySelector("#defender-stage-inputs"),
  attackerBurned: document.querySelector("#attacker-burned"),
  damageCritical: document.querySelector("#damage-critical"),
  damageCount: document.querySelector("#damage-count"),
  damageList: document.querySelector("#damage-list"),
  status: document.querySelector("#status"),
};

const STAT_LABELS = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};
const SP_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAGE_STATS = ["atk", "def", "spa", "spd"];

let pokemon = [];
let abilityLookup = new Map();
let itemLookup = new Map();
let moveLookup = new Map();
let usageStats = null;
let selectedPokemon = null;
let selectedFamily = [];
let selectedMoves = [];
let damageState = {
  attacker: null,
  defender: null,
};

initialize();

async function initialize() {
  try {
    const [pokemonResponse, abilitiesResponse, movesResponse, itemsResponse, usageData] =
      await Promise.all([
      fetch("./public/pokemon.json"),
      fetch("./public/abilities.json"),
      fetch("./public/moves.json"),
      fetch("./public/items.json"),
      loadOptionalJson("./public/usage-stats.json"),
    ]);
    for (const response of [pokemonResponse, abilitiesResponse, movesResponse, itemsResponse]) {
      if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    }

    const [pokemonData, abilityData, moveData, itemData] = await Promise.all([
      pokemonResponse.json(),
      abilitiesResponse.json(),
      movesResponse.json(),
      itemsResponse.json(),
    ]);
    pokemon = pokemonData;
    abilityLookup = buildAbilityLookup(abilityData);
    itemLookup = buildItemLookup(itemData);
    moveLookup = buildMoveLookup(moveData);
    usageStats = usageData;
    elements.status.textContent =
      `${pokemon.length} Pokémon/forms, ${abilityData.length} abilities, ` +
      `${moveData.length} moves loaded` +
      (usageStats ? "" : " · No Showdown usage data loaded");
    renderDamageShell();
    selectPokemon(pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0]);
  } catch (error) {
    elements.status.textContent = "Run npm run sync-data to generate Pokémon data.";
    console.error(error);
  }
}

async function loadOptionalJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

elements.movesTab.addEventListener("click", () => selectTab("moves"));
elements.speedTab.addEventListener("click", () => selectTab("speed"));
elements.damageTab.addEventListener("click", () => selectTab("damage"));

elements.search.addEventListener("input", () => {
  renderSearchResults(searchPokemon(pokemon, elements.search.value));
});

elements.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const [firstResult] = searchPokemon(pokemon, elements.search.value, 1);
  if (firstResult) selectPokemon(firstResult);
});

for (const control of [
  elements.sp,
  elements.nature,
  elements.stage,
  elements.tailwind,
  elements.paralyzed,
  elements.speedMultiplier,
  elements.trickRoom,
]) {
  control.addEventListener("input", updateCalculation);
}

elements.form.addEventListener("input", () => {
  const form = selectedFamily.find(({ id }) => id === elements.form.value);
  if (form) selectForm(form);
});

for (const control of [elements.moveSearch, elements.moveType, elements.moveCategory]) {
  control.addEventListener("input", renderMoveList);
}

for (const control of [
  elements.attackerPokemon,
  elements.defenderPokemon,
  elements.attackerSpread,
  elements.defenderSpread,
  elements.attackerNature,
  elements.defenderNature,
  elements.attackerAbility,
  elements.defenderAbility,
  elements.attackerItem,
  elements.defenderItem,
  elements.attackerBurned,
  elements.damageCritical,
]) {
  control.addEventListener("input", handleDamageControl);
}

function selectTab(tab) {
  const showingMoves = tab === "moves";
  const showingSpeed = tab === "speed";
  const showingDamage = tab === "damage";
  elements.movesTab.classList.toggle("active", showingMoves);
  elements.speedTab.classList.toggle("active", showingSpeed);
  elements.damageTab.classList.toggle("active", showingDamage);
  elements.movesTab.setAttribute("aria-selected", String(showingMoves));
  elements.speedTab.setAttribute("aria-selected", String(showingSpeed));
  elements.damageTab.setAttribute("aria-selected", String(showingDamage));
  elements.movesPage.hidden = !showingMoves;
  elements.speedPage.hidden = !showingSpeed;
  elements.damagePage.hidden = !showingDamage;
}

function renderSearchResults(results) {
  elements.results.replaceChildren(
    ...results.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.innerHTML = `
        <span>${entry.name}</span>
        <small>${entry.aliases.join(" · ") || entry.baseSpecies}</small>
        <strong>${entry.baseSpeed}</strong>
      `;
      button.addEventListener("click", () => selectPokemon(entry));
      return button;
    }),
  );
  elements.results.hidden = results.length === 0;
}

function selectPokemon(entry) {
  if (!entry) return;
  selectedFamily = megaFamily(pokemon, entry);
  renderFormOptions();
  renderFamilyStats();
  selectForm(entry);
  elements.results.hidden = true;
}

function renderFormOptions() {
  elements.form.replaceChildren(
    ...selectedFamily.map((entry) => {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      return option;
    }),
  );
  elements.formField.hidden = selectedFamily.length === 1;
}

function renderFamilyStats() {
  const labels = {
    hp: "HP",
    atk: "Attack",
    def: "Defense",
    spa: "Sp. Atk",
    spd: "Sp. Def",
    spe: "Speed",
  };

  elements.baseStats.replaceChildren(
    ...selectedFamily.map((entry) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "form-card";
      card.dataset.formId = entry.id;
      card.innerHTML = `
        <span class="form-card-heading">
          <strong>${entry.name}</strong>
          <small>BST ${totalBaseStats(entry.baseStats)}</small>
        </span>
        <span class="form-card-stats">
          ${Object.entries(labels)
            .map(
              ([key, label]) => `
                <span class="${key === "spe" ? "speed-stat" : ""}">
                  <small>${label}</small>
                  <strong>${entry.baseStats[key]}</strong>
                </span>
              `,
            )
            .join("")}
        </span>
      `;
      card.addEventListener("click", () => selectForm(entry));
      return card;
    }),
  );
}

function selectForm(entry) {
  selectedPokemon = entry;
  elements.search.value = entry.baseSpecies;
  elements.selectedName.textContent = entry.name;
  elements.selectedAlias.textContent = entry.aliases.join(" · ") || entry.baseSpecies;
  elements.baseStatTotal.textContent = totalBaseStats(entry.baseStats);
  elements.form.value = entry.id;

  for (const card of elements.baseStats.querySelectorAll(".form-card")) {
    card.classList.toggle("active", card.dataset.formId === entry.id);
  }
  renderCatalog();
  updateCalculation();
  seedDamageSide("attacker", entry);
}

function renderCatalog() {
  const usage = usageForPokemon(usageStats, selectedPokemon);
  renderUsageSource(usage);

  const abilities = mergeUsage(
    resolvePokemonAbilities(selectedPokemon, abilityLookup),
    usage?.abilities,
  );
  selectedMoves = sortByUsage(
    mergeUsage(resolvePokemonMoves(selectedPokemon, moveLookup), usage?.moves),
  );
  renderAbilities(abilities);
  renderItems(resolvePokemonItems(usage, itemLookup));
  renderMoveFilterOptions();
  renderMoveList();
}

function renderUsageSource(usage) {
  if (!usageStats) {
    elements.usageSource.textContent = "No Showdown usage data loaded.";
  } else if (!usage) {
    elements.usageSource.textContent =
      `Showdown usage · ${usageStats.format} · ${usageStats.month} · no data for this Pokémon`;
  } else {
    elements.usageSource.textContent = `Showdown usage · ${usageStats.format} · ${usageStats.month}`;
  }
}

function renderAbilities(abilities) {
  elements.abilityCount.textContent = String(abilities.length);
  elements.abilityList.replaceChildren(
    ...abilities.map((ability) => {
      const card = document.createElement("article");
      card.className = "ability-card";

      const heading = document.createElement("div");
      heading.className = "ability-heading";

      const name = document.createElement("strong");
      name.textContent = ability.name;
      heading.append(name);

      if (ability.rating !== undefined) {
        const rating = document.createElement("span");
        rating.textContent = `Rating ${ability.rating}`;
        heading.append(rating);
      }

      const usage = document.createElement("span");
      usage.textContent = formatUsagePercent(ability.usagePercent);
      heading.append(usage);

      const description = document.createElement("p");
      description.textContent = ability.shortDesc || ability.desc || "—";

      card.append(heading, description);
      return card;
    }),
  );
}

function renderItems(items) {
  elements.itemCount.textContent = String(items.length);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-catalog";
    empty.textContent = "No item usage is available for this Pokémon.";
    elements.itemList.replaceChildren(empty);
    return;
  }

  elements.itemList.replaceChildren(
    ...items.map((item) => {
      const card = document.createElement("article");
      card.className = "item-card";

      const heading = document.createElement("div");
      heading.className = "item-heading";

      const name = document.createElement("strong");
      name.textContent = item.name;
      const usage = document.createElement("span");
      usage.textContent = formatUsagePercent(item.usagePercent);
      heading.append(name, usage);

      const description = document.createElement("p");
      description.textContent = item.shortDesc || item.desc || "—";

      card.append(heading, description);
      return card;
    }),
  );
}

function renderMoveFilterOptions() {
  updateSelectOptions(elements.moveType, "All types", [
    ...new Set(selectedMoves.map(({ type }) => type).filter(Boolean)),
  ]);
  updateSelectOptions(elements.moveCategory, "All categories", [
    ...new Set(selectedMoves.map(({ category }) => category).filter(Boolean)),
  ]);
}

function updateSelectOptions(select, emptyLabel, values) {
  const selected = select.value;
  const sortedValues = values.sort((a, b) => a.localeCompare(b));
  select.replaceChildren(
    optionElement("", emptyLabel),
    ...sortedValues.map((value) => optionElement(value, value)),
  );
  select.value = sortedValues.includes(selected) ? selected : "";
}

function optionElement(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function renderMoveList() {
  const moves = filterMoves(selectedMoves, {
    query: elements.moveSearch.value,
    type: elements.moveType.value,
    category: elements.moveCategory.value,
  });
  elements.moveCount.textContent = `${moves.length} / ${selectedMoves.length}`;

  if (moves.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "empty-moves";
    cell.textContent = "No moves match the current filters.";
    row.append(cell);
    elements.moveList.replaceChildren(row);
    return;
  }

  elements.moveList.replaceChildren(...moves.map(renderMoveRow));
}

function renderMoveRow(move) {
  const row = document.createElement("tr");
  row.append(
    moveNameCell(move),
    textCell(formatUsagePercent(move.usagePercent), "numeric-cell", "Usage"),
    textCell(move.type || "—", "", "Type"),
    textCell(move.category || "—", "", "Category"),
    textCell(formatMovePower(move.basePower), "numeric-cell", "Power"),
    textCell(formatMoveAccuracy(move.accuracy), "numeric-cell", "Acc."),
    textCell(String(move.pp ?? "—"), "numeric-cell", "PP"),
    textCell(formatMovePriority(move.priority), "numeric-cell", "Pri."),
    textCell(moveEffect(move), "effect-cell", "Effect"),
  );
  return row;
}

function moveNameCell(move) {
  const cell = document.createElement("td");
  cell.dataset.label = "Move";
  const name = document.createElement("strong");
  name.textContent = move.name;
  const id = document.createElement("small");
  id.textContent = move.id;
  cell.append(name, id);
  return cell;
}

function textCell(text, className = "", label = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text;
  return cell;
}

function renderDamageShell() {
  const options = pokemon.map((entry) => optionElement(entry.id, entry.name));
  elements.attackerPokemon.replaceChildren(...options.map((option) => option.cloneNode(true)));
  elements.defenderPokemon.replaceChildren(...options.map((option) => option.cloneNode(true)));

  const natureOptions = Object.keys(NATURES).map((nature) => optionElement(nature, nature));
  elements.attackerNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));
  elements.defenderNature.replaceChildren(...natureOptions.map((option) => option.cloneNode(true)));

  renderSideInputs("attacker");
  renderSideInputs("defender");

  const defaultDefender =
    pokemon.find(({ id }) => id === "blastoise") ??
    pokemon.find(({ id }) => id !== "pikachu") ??
    pokemon[0];
  seedDamageSide("defender", defaultDefender);
}

function renderSideInputs(side) {
  const spContainer = elements[`${side}SpInputs`];
  const stageContainer = elements[`${side}StageInputs`];

  spContainer.replaceChildren(
    ...SP_STATS.map((stat) => {
      const label = document.createElement("label");
      label.textContent = `${STAT_LABELS[stat]} SP`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.max = "32";
      input.value = "0";
      input.dataset.side = side;
      input.dataset.kind = "sp";
      input.dataset.stat = stat;
      label.append(input);
      return label;
    }),
  );

  stageContainer.replaceChildren(
    ...STAGE_STATS.map((stat) => {
      const label = document.createElement("label");
      label.textContent = `${STAT_LABELS[stat]} stage`;
      const input = document.createElement("input");
      input.type = "number";
      input.min = "-6";
      input.max = "6";
      input.value = "0";
      input.dataset.side = side;
      input.dataset.kind = "stage";
      input.dataset.stat = stat;
      label.append(input);
      return label;
    }),
  );

  for (const input of [...spContainer.querySelectorAll("input"), ...stageContainer.querySelectorAll("input")]) {
    input.addEventListener("input", handleDamageControl);
  }
}

function seedDamageSide(side, entry) {
  if (!entry) return;
  const usage = usageForPokemon(usageStats, entry);
  const defaults = usageDefaultsForPokemon(entry, usage, {
    abilityLookup,
    itemLookup,
    moveLookup,
  });

  damageState[side] = {
    pokemon: entry,
    nature: defaults.nature,
    sp: { ...defaults.sp },
    stages: { atk: 0, def: 0, spa: 0, spd: 0 },
    ability: defaults.ability,
    item: defaults.item,
    topMoveIds: new Set(defaults.moves.map(({ id }) => normalizeDamageId(id))),
    burned: side === "attacker" ? elements.attackerBurned.checked : false,
  };

  elements[`${side}Pokemon`].value = entry.id;
  renderSideSelects(side, usage, defaults);
  syncSideInputs(side);
  renderDamage();
}

function renderSideSelects(side, usage, defaults) {
  const spreadSelect = elements[`${side}Spread`];
  const natureSelect = elements[`${side}Nature`];
  const abilitySelect = elements[`${side}Ability`];
  const itemSelect = elements[`${side}Item`];
  const spreads = usage?.spreads ?? [];
  const abilities = mergeUsage(
    resolvePokemonAbilities(damageState[side].pokemon, abilityLookup),
    usage?.abilities,
  );
  const items = resolvePokemonItems(usage, itemLookup);

  spreadSelect.replaceChildren(
    optionElement("", "No usage spread"),
    ...spreads.map((spread) =>
      optionElement(spread.name, `${spread.name} · ${formatUsagePercent(spread.usagePercent)}`),
    ),
  );
  spreadSelect.value = defaults.spreadName;
  natureSelect.value = damageState[side].nature;
  abilitySelect.replaceChildren(
    optionElement("", "No ability modifier"),
    ...abilities.map((ability) =>
      optionElement(ability.id, `${ability.name} · ${formatUsagePercent(ability.usagePercent)}`),
    ),
  );
  itemSelect.replaceChildren(
    optionElement("", "No item modifier"),
    ...items.map((item) =>
      optionElement(item.id, `${item.name} · ${formatUsagePercent(item.usagePercent)}`),
    ),
  );
  abilitySelect.value = damageState[side].ability?.id ?? "";
  itemSelect.value = damageState[side].item?.id ?? "";
}

function syncSideInputs(side) {
  const state = damageState[side];
  if (!state) return;
  elements[`${side}Nature`].value = state.nature;
  for (const input of elements[`${side}SpInputs`].querySelectorAll("input")) {
    input.value = state.sp[input.dataset.stat] ?? 0;
  }
  for (const input of elements[`${side}StageInputs`].querySelectorAll("input")) {
    input.value = state.stages[input.dataset.stat] ?? 0;
  }
}

function handleDamageControl(event) {
  const id = event.target.id;
  if (id === "attacker-pokemon" || id === "defender-pokemon") {
    const side = id.startsWith("attacker") ? "attacker" : "defender";
    seedDamageSide(side, pokemon.find((entry) => entry.id === event.target.value));
    return;
  }

  for (const side of ["attacker", "defender"]) {
    const state = damageState[side];
    if (!state) continue;
    if (id === `${side}-spread`) {
      const spread = parseUsageSpread(event.target.value);
      if (spread) {
        state.nature = spread.nature;
        state.sp = { ...spread.sp };
        syncSideInputs(side);
      }
    }
    if (id === `${side}-nature`) state.nature = event.target.value;
    if (id === `${side}-ability`) state.ability = selectedOptionEntry(event.target, abilityLookup);
    if (id === `${side}-item`) state.item = selectedOptionEntry(event.target, itemLookup);
  }

  if (event.target.dataset.kind === "sp" || event.target.dataset.kind === "stage") {
    const { side, kind, stat } = event.target.dataset;
    const minimum = kind === "stage" ? -6 : 0;
    const maximum = kind === "stage" ? 6 : 32;
    damageState[side][kind === "stage" ? "stages" : "sp"][stat] = clampInteger(
      event.target.value,
      minimum,
      maximum,
    );
    event.target.value = damageState[side][kind === "stage" ? "stages" : "sp"][stat];
  }

  if (id === "attacker-burned" && damageState.attacker) {
    damageState.attacker.burned = elements.attackerBurned.checked;
  }

  renderDamage();
}

function selectedOptionEntry(select, lookup) {
  if (!select.value) return null;
  return lookup.get(normalizeDamageId(select.value)) ?? {
    id: select.value,
    name: select.selectedOptions[0]?.textContent?.split(" · ")[0] ?? select.value,
  };
}

function renderDamage() {
  const attacker = damageState.attacker;
  const defender = damageState.defender;
  if (!attacker?.pokemon || !defender?.pokemon) return;

  elements.damageSource.textContent =
    usageStats
      ? `Showdown usage defaults · ${usageStats.format} · ${usageStats.month} · top marginal spread, ability, item, and moves`
      : "No Showdown usage data loaded. Damage defaults use neutral 0 SP.";

  elements.attackerSummary.textContent = sideSummary(attacker);
  elements.defenderSummary.textContent = sideSummary(defender);

  const usage = usageForPokemon(usageStats, attacker.pokemon);
  const attackerMoves = sortByUsage(
    mergeUsage(resolvePokemonMoves(attacker.pokemon, moveLookup), usage?.moves),
  );
  elements.damageCount.textContent = String(attackerMoves.length);
  elements.damageList.replaceChildren(...attackerMoves.map((move) => renderDamageRow(move)));
}

function renderDamageRow(move) {
  const result = calculateDamage({
    attacker: damageState.attacker.pokemon,
    defender: damageState.defender.pokemon,
    move,
    attackerState: damageState.attacker,
    defenderState: damageState.defender,
    critical: elements.damageCritical.checked,
    burned: damageState.attacker.burned,
  });
  const row = document.createElement("tr");
  const topMarker = damageState.attacker.topMoveIds.has(normalizeDamageId(move.id)) ? "Top" : "—";

  if (!result.supported) {
    row.append(
      moveNameCell(move),
      textCell(formatUsagePercent(move.usagePercent), "numeric-cell", "Usage"),
      textCell(topMarker, "numeric-cell", "Top"),
      textCell(move.type || "—", "", "Type"),
      textCell(move.category || "—", "", "Category"),
      textCell(formatMovePower(move.basePower), "numeric-cell", "Power"),
      textCell("—", "numeric-cell", "Damage"),
      textCell("—", "numeric-cell", "Percent"),
      textCell("—", "numeric-cell", "KO"),
      textCell(result.reason, "effect-cell", "Notes"),
    );
    return row;
  }

  row.append(
    moveNameCell(move),
    textCell(formatUsagePercent(move.usagePercent), "numeric-cell", "Usage"),
    textCell(topMarker, "numeric-cell", "Top"),
    textCell(move.type || "—", "", "Type"),
    textCell(move.category || "—", "", "Category"),
    textCell(formatMovePower(move.basePower), "numeric-cell", "Power"),
    textCell(`${result.minDamage}-${result.maxDamage}`, "numeric-cell", "Damage"),
    textCell(`${result.minPercent}-${result.maxPercent}%`, "numeric-cell", "Percent"),
    textCell(koSummary(result), "numeric-cell", "KO"),
    textCell(damageNotes(result), "effect-cell", "Notes"),
  );
  return row;
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

function damageNotes(result) {
  const notes = [...result.notes];
  if (result.typeMultiplier !== 1) notes.unshift(`Type ×${result.typeMultiplier}`);
  return notes.length > 0 ? notes.join(" · ") : "Core modifiers only";
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function normalizeDamageId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function updateCalculation() {
  if (!selectedPokemon) return;

  elements.spOutput.textContent = elements.sp.value;
  const result = calculateSpeed({
    baseSpeed: selectedPokemon.baseSpeed,
    sp: Number(elements.sp.value),
    nature: elements.nature.value,
    stage: Number(elements.stage.value),
    tailwind: elements.tailwind.checked,
    paralyzed: elements.paralyzed.checked,
    speedMultiplier: Number(elements.speedMultiplier.value),
    trickRoom: elements.trickRoom.checked,
  });

  elements.trainedSpeed.textContent = result.natureSpeed;
  elements.finalSpeed.textContent = result.modifiedSpeed;
  elements.orderNote.textContent = elements.trickRoom.checked
    ? "Trick Room is active: lower final Speed moves first within the same priority bracket."
    : "Higher final Speed moves first within the same priority bracket.";
}

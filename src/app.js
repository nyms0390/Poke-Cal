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
import { megaFamily, searchPokemon } from "./pokemon.js";
import { calculateSpeed } from "./speed.js";
import { totalBaseStats } from "./stats.js";

const elements = {
  search: document.querySelector("#pokemon-search"),
  results: document.querySelector("#search-results"),
  selectedName: document.querySelector("#selected-name"),
  selectedAlias: document.querySelector("#selected-alias"),
  baseStats: document.querySelector("#base-stats"),
  baseStatTotal: document.querySelector("#base-stat-total"),
  movesTab: document.querySelector("#moves-tab"),
  speedTab: document.querySelector("#speed-tab"),
  movesPage: document.querySelector("#moves-page"),
  speedPage: document.querySelector("#speed-page"),
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
  status: document.querySelector("#status"),
};

let pokemon = [];
let abilityLookup = new Map();
let itemLookup = new Map();
let moveLookup = new Map();
let usageStats = null;
let selectedPokemon = null;
let selectedFamily = [];
let selectedMoves = [];

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

function selectTab(tab) {
  const showingMoves = tab === "moves";
  elements.movesTab.classList.toggle("active", showingMoves);
  elements.speedTab.classList.toggle("active", !showingMoves);
  elements.movesTab.setAttribute("aria-selected", String(showingMoves));
  elements.speedTab.setAttribute("aria-selected", String(!showingMoves));
  elements.movesPage.hidden = !showingMoves;
  elements.speedPage.hidden = showingMoves;
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

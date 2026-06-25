import {
  filterMoves,
  formatMoveAccuracy,
  formatMovePower,
  formatUsagePercent,
  mergeUsage,
  moveEffect,
  resolvePokemonItems,
  resolvePokemonAbilities,
  resolvePokemonMoves,
  sortByUsage,
  usageForPokemon,
} from "./catalog.js";
import { loadPokemonData } from "./data.js";
import { megaFamily, searchPokemon } from "./pokemon.js";
import { totalBaseStats } from "./stats.js";
import { moveNameCell, optionElement, textCell, updateSelectOptions } from "./ui.js";

const elements = {
  search: document.querySelector("#pokemon-search"),
  results: document.querySelector("#search-results"),
  selectedName: document.querySelector("#selected-name"),
  selectedAlias: document.querySelector("#selected-alias"),
  baseStats: document.querySelector("#base-stats"),
  baseStatTotal: document.querySelector("#base-stat-total"),
  formField: document.querySelector("#form-field"),
  form: document.querySelector("#form"),
  usageSource: document.querySelector("#usage-source"),
  playstyleSummary: document.querySelector("#playstyle-summary"),
  spreadCount: document.querySelector("#spread-count"),
  spreadList: document.querySelector("#spread-list"),
  abilityCount: document.querySelector("#ability-count"),
  abilityList: document.querySelector("#ability-list"),
  itemCount: document.querySelector("#item-count"),
  itemList: document.querySelector("#item-list"),
  moveCount: document.querySelector("#move-count"),
  moveSearch: document.querySelector("#move-search"),
  moveType: document.querySelector("#move-type"),
  moveCategory: document.querySelector("#move-category"),
  moveList: document.querySelector("#move-list"),
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
    const data = await loadPokemonData();
    pokemon = data.pokemon;
    abilityLookup = data.abilityLookup;
    itemLookup = data.itemLookup;
    moveLookup = data.moveLookup;
    usageStats = data.usageStats;
    elements.status.textContent =
      `${pokemon.length} Pokémon/forms, ${data.abilities.length} abilities, ` +
      `${data.moves.length} moves loaded` +
      (usageStats ? "" : " · No Showdown usage data loaded");
    selectPokemon(pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0]);
  } catch (error) {
    elements.status.textContent = "Run npm run sync-data to generate Pokémon data.";
    console.error(error);
  }
}

elements.search.addEventListener("input", () => {
  renderSearchResults(searchPokemon(pokemon, elements.search.value));
});

elements.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const [firstResult] = searchPokemon(pokemon, elements.search.value, 1);
  if (firstResult) selectPokemon(firstResult);
});

elements.form.addEventListener("input", () => {
  const form = selectedFamily.find(({ id }) => id === elements.form.value);
  if (form) selectForm(form);
});

for (const control of [elements.moveSearch, elements.moveType, elements.moveCategory]) {
  control.addEventListener("input", renderMoveList);
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
    ...selectedFamily.map((entry) => optionElement(entry.id, entry.name)),
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
}

function renderCatalog() {
  const usage = usageForPokemon(usageStats, selectedPokemon);
  renderUsageSource(usage);

  const abilities = mergeUsage(
    resolvePokemonAbilities(selectedPokemon, abilityLookup),
    usage?.abilities,
  );
  const items = resolvePokemonItems(usage, itemLookup);
  selectedMoves = sortByUsage(
    mergeUsage(resolvePokemonMoves(selectedPokemon, moveLookup), usage?.moves),
  );

  renderPlaystyle(usage, abilities, items);
  renderSpreads(usage?.spreads ?? []);
  renderAbilities(abilities);
  renderItems(items);
  renderMoveFilterOptions();
  renderMoveList();
}

function renderUsageSource(usage) {
  if (!usageStats) {
    elements.usageSource.textContent = "No Showdown usage data loaded.";
  } else if (!usage) {
    elements.usageSource.textContent =
      `Showdown usage data · ${usageStats.format} · ${usageStats.month} · no data for this Pokémon`;
  } else {
    elements.usageSource.textContent = `Showdown usage data · ${usageStats.format} · ${usageStats.month}`;
  }
}

function renderPlaystyle(usage, abilities, items) {
  if (!usage) {
    elements.playstyleSummary.textContent =
      "No Showdown usage profile is available for this Pokémon yet.";
    return;
  }

  const ability = topName(abilities, "ability");
  const item = topName(items, "item");
  const spread = usage.spreads?.[0]?.name ?? "custom";
  const moves = selectedMoves
    .filter((move) => Number.isFinite(move.usagePercent))
    .slice(0, 4)
    .map((move) => move.name)
    .join(", ");

  elements.playstyleSummary.textContent =
    `${selectedPokemon.name} is most commonly seen with ${ability}, ${item}, and a ${spread} spread. ` +
    `Frequent Showdown moves include ${moves || "no strongly represented moves"}.`;
}

function topName(entries, fallback) {
  const [entry] = sortByUsage(entries);
  return entry?.name ?? `no common ${fallback}`;
}

function renderSpreads(spreads) {
  elements.spreadCount.textContent = String(spreads.length);

  if (spreads.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-catalog";
    empty.textContent = "No Showdown spread usage is available for this Pokémon.";
    elements.spreadList.replaceChildren(empty);
    return;
  }

  elements.spreadList.replaceChildren(
    ...spreads.slice(0, 6).map((spread) => {
      const row = document.createElement("div");
      row.className = "spread-row";

      const name = document.createElement("strong");
      name.textContent = spread.name;
      const usage = document.createElement("span");
      usage.textContent = formatUsagePercent(spread.usagePercent);

      row.append(name, usage);
      return row;
    }),
  );
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
    cell.colSpan = 8;
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
    textCell(moveEffect(move), "effect-cell", "Effect"),
  );
  return row;
}


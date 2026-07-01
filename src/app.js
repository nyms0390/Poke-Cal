import {
  applyScopedUsage,
  filterMoves,
  formatChampionsUsage,
  formatMoveAccuracy,
  formatMovePower,
  moveEffect,
  resolvePokemonAbilities,
  resolveChampionsPokemonMoves,
  sortByChampionsUsage,
} from "./catalog.js";
import { loadPokemonData } from "./data.js";
import { megaFamily, searchPokemon } from "./pokemon.js";
import { totalBaseStats } from "./stats.js";
import { moveNameCell, optionElement, textCell, typeBadge, updateSelectOptions } from "./ui.js";

const elements = {
  search: document.querySelector("#pokemon-search"),
  results: document.querySelector("#search-results"),
  selectedName: document.querySelector("#selected-name"),
  selectedTypes: document.querySelector("#selected-types"),
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
let moveLookup = new Map();
let items = [];
let selectedPokemon = null;
let selectedFamily = [];
let selectedMoves = [];

initialize();

async function initialize() {
  try {
    const data = await loadPokemonData();
    pokemon = data.pokemon;
    abilityLookup = data.abilityLookup;
    moveLookup = data.moveLookup;
    items = data.items;
    elements.status.textContent =
      `${pokemon.length} Pokémon/forms, ${data.abilities.length} abilities, ` +
      `${data.moves.length} moves loaded`;
    selectPokemon(pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0], {
      syncSearch: false,
    });
  } catch (error) {
    elements.status.textContent = "Run npm run sync-data to generate Pokémon data.";
    console.error(error);
  }
}

elements.search.addEventListener("input", () => {
  renderSearchResults(searchPokemon(pokemon, elements.search.value, searchOptions()));
});

elements.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const [firstResult] = searchPokemon(pokemon, elements.search.value, {
    ...searchOptions(),
    limit: 1,
  });
  if (firstResult) selectPokemon(firstResult);
});

elements.form.addEventListener("input", () => {
  const form = selectedFamily.find(({ id }) => id === elements.form.value);
  if (form) selectForm(form);
});

for (const control of [elements.moveSearch, elements.moveType, elements.moveCategory]) {
  control.addEventListener("input", renderMoveList);
}

function searchOptions() {
  return { abilityLookup, moveLookup };
}

function renderSearchResults(results) {
  elements.results.replaceChildren(
    ...results.map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.innerHTML = `
        <span>${entry.name}</span>
        <small>${entry.searchMatch || entry.aliases.join(" · ") || entry.baseSpecies}</small>
        <strong>${entry.baseSpeed}</strong>
      `;
      button.addEventListener("click", () => selectPokemon(entry));
      return button;
    }),
  );
  elements.results.hidden = results.length === 0;
}

function selectPokemon(entry, options = {}) {
  if (!entry) return;
  selectedFamily = megaFamily(pokemon, entry);
  renderFormOptions();
  renderFamilyStats();
  selectForm(entry, options);
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

function selectForm(entry, options = {}) {
  selectedPokemon = entry;
  if (options.syncSearch !== false) elements.search.value = entry.baseSpecies;
  elements.selectedName.textContent = entry.name;
  elements.selectedTypes.replaceChildren(...(entry.types ?? []).map(typeBadge));
  elements.selectedAlias.textContent = entry.aliases.join(" · ") || entry.baseSpecies;
  elements.baseStatTotal.textContent = totalBaseStats(entry.baseStats);
  elements.form.value = entry.id;

  for (const card of elements.baseStats.querySelectorAll(".form-card")) {
    card.classList.toggle("active", card.dataset.formId === entry.id);
  }
  renderCatalog();
}

function renderCatalog() {
  renderUsageSource();

  const usage = selectedPokemon?.champions?.usage;
  const abilities = sortByChampionsUsage(
    applyScopedUsage(resolvePokemonAbilities(selectedPokemon, abilityLookup), usage?.abilities),
  );
  const rankedItems = sortByChampionsUsage(applyScopedUsage(items, usage?.items));
  selectedMoves = sortByChampionsUsage(
    applyScopedUsage(resolveChampionsPokemonMoves(selectedPokemon, moveLookup), usage?.moves),
  );

  renderPlaystyle(abilities, rankedItems);
  renderSpreads();
  renderAbilities(abilities);
  renderItems(rankedItems);
  renderMoveFilterOptions();
  renderMoveList();
}

function renderUsageSource() {
  elements.usageSource.textContent = "Limitless Champions tournament usage";
}

function renderPlaystyle(abilities, rankedItems) {
  const ability = topName(abilities, "ability");
  const item = topName(rankedItems, "item");
  const moves = selectedMoves
    .slice(0, 4)
    .map((move) => move.name)
    .join(", ");

  elements.playstyleSummary.textContent =
    `${selectedPokemon.name} can use ${ability}. Popular Champions items include ${item}. ` +
    `High-count Champions moves include ${moves || "no ranked moves"}.`;
}

function topName(entries, fallback) {
  const [entry] = sortByChampionsUsage(entries);
  return entry?.name ?? `no common ${fallback}`;
}

function renderSpreads() {
  elements.spreadCount.textContent = "0";
  const empty = document.createElement("p");
  empty.className = "empty-catalog";
  empty.textContent = "No Champions spread source is available.";
  elements.spreadList.replaceChildren(empty);
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
      usage.textContent = formatChampionsUsage(ability);
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
    empty.textContent = "No Champions item data is available.";
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
      usage.textContent = formatChampionsUsage(item);
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
    cell.colSpan = 7;
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
    textCell(formatChampionsUsage(move), "numeric-cell", "Champions"),
    textCell(move.category || "—", "", "Category"),
    textCell(formatMovePower(move.basePower), "numeric-cell", "Power"),
    textCell(formatMoveAccuracy(move.accuracy), "numeric-cell", "Acc."),
    textCell(String(move.pp ?? "—"), "numeric-cell", "PP"),
    textCell(moveEffect(move), "effect-cell", "Effect"),
  );
  return row;
}

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
  formField: document.querySelector("#form-field"),
  form: document.querySelector("#form"),
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
let selectedPokemon = null;
let selectedFamily = [];

initialize();

async function initialize() {
  try {
    const response = await fetch("./public/pokemon.json");
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    pokemon = await response.json();
    elements.status.textContent = `${pokemon.length} Pokémon and forms loaded`;
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
  updateCalculation();
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

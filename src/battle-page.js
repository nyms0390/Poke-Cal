import {
  formatMovePriority,
  formatUsagePercent,
  mergeUsage,
  resolvePokemonItems,
  resolvePokemonAbilities,
  resolvePokemonMoves,
  sortByUsage,
  usageForPokemon,
} from "./catalog.js";
import { compareMoveOrder } from "./battle-order.js";
import { loadPokemonData } from "./data.js";
import { calculateDamage, calculateStat, formatDamageResult, koSummary, NATURES } from "./damage.js";
import { finalSpeed } from "./speed.js";
import { parseUsageSpread, usageDefaultsForPokemon } from "./usage-defaults.js";
import { damagePercentColor, optionElement, STAT_LABELS, typeBadge } from "./ui.js";

const elements = {
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
  attackerParalyzed: document.querySelector("#attacker-paralyzed"),
  defenderParalyzed: document.querySelector("#defender-paralyzed"),
  attackerBurned: document.querySelector("#attacker-burned"),
  defenderBurned: document.querySelector("#defender-burned"),
  trickRoom: document.querySelector("#trick-room"),
  battleFormat: document.querySelector("#battle-format"),
  damageCritical: document.querySelector("#damage-critical"),
  moveOrder: document.querySelector("#move-order"),
  speedSummary: document.querySelector("#speed-summary"),
  attackerFinalSpeed: document.querySelector("#attacker-final-speed"),
  defenderFinalSpeed: document.querySelector("#defender-final-speed"),
  damageCount: document.querySelector("#damage-count"),
  damageList: document.querySelector("#damage-list"),
  status: document.querySelector("#status"),
};

const SP_STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
const STAGE_STATS = ["atk", "def", "spa", "spd", "spe"];

let pokemon = [];
let abilityLookup = new Map();
let itemLookup = new Map();
let moveLookup = new Map();
let usageStats = null;
let damageState = {
  attacker: null,
  defender: null,
};

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
    renderDamageShell();
  } catch (error) {
    elements.status.textContent = "Run npm run sync-data to generate Pokémon data.";
    console.error(error);
  }
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
  elements.attackerSpeedMultiplier,
  elements.defenderSpeedMultiplier,
  elements.attackerTailwind,
  elements.defenderTailwind,
  elements.attackerParalyzed,
  elements.defenderParalyzed,
  elements.attackerBurned,
  elements.defenderBurned,
  elements.trickRoom,
  elements.battleFormat,
  elements.damageCritical,
]) {
  control.addEventListener("input", handleDamageControl);
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

  seedDamageSide("attacker", pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0]);
  seedDamageSide(
    "defender",
    pokemon.find(({ id }) => id === "blastoise") ??
      pokemon.find(({ id }) => id !== "pikachu") ??
      pokemon[0],
  );
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
    stages: { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    ability: defaults.ability,
    item: defaults.item,
    selectedMoveIds: [0, 1, 2, 3].map((index) => normalizeDamageId(defaults.moves[index]?.id)),
    speedMultiplier: Number(elements[`${side}SpeedMultiplier`]?.value ?? 1),
    tailwind: elements[`${side}Tailwind`]?.checked ?? false,
    paralyzed: elements[`${side}Paralyzed`]?.checked ?? false,
    burned: elements[`${side}Burned`]?.checked ?? false,
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
  renderDamageMovePickers(side);
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
    if (id === `${side}-speed-multiplier`) state.speedMultiplier = Number(event.target.value);
    if (id === `${side}-tailwind`) state.tailwind = event.target.checked;
    if (id === `${side}-paralyzed`) state.paralyzed = event.target.checked;
    if (id === `${side}-burned`) state.burned = event.target.checked;
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

  if (event.target.dataset.kind === "damage-move") {
    const { side } = event.target.dataset;
    const index = Number(event.target.dataset.index);
    damageState[side].selectedMoveIds[index] = normalizeDamageId(event.target.value);
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
            `${move.name} · ${formatUsagePercent(move.usagePercent)} · ${move.type ?? "—"}`,
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
    usageStats
      ? `Showdown usage defaults · ${usageStats.format} · ${usageStats.month} · top marginal spread, ability, item, and moves`
      : "No Showdown usage data loaded. Damage defaults use neutral 0 SP.";

  elements.attackerSummary.textContent = sideSummary(attacker);
  elements.defenderSummary.textContent = sideSummary(defender);
  elements.attackerFinalSpeed.textContent = String(finalSpeed(attacker));
  elements.defenderFinalSpeed.textContent = String(finalSpeed(defender));
  renderMoveOrder();
  elements.speedSummary.textContent =
    `${attacker.pokemon.name} Speed ${finalSpeed(attacker)} vs ` +
    `${defender.pokemon.name} Speed ${finalSpeed(defender)}`;

  const attackerRows = selectedDamageMoves("attacker").map((move, index) =>
    renderDamageCard(move, "attacker", "defender", index === 0),
  );
  const defenderRows = selectedDamageMoves("defender").map((move, index) =>
    renderDamageCard(move, "defender", "attacker", index === 0),
  );
  const rows = [...attackerRows, ...defenderRows];
  elements.damageCount.textContent = `${rows.length} moves`;
  elements.damageList.replaceChildren(
    damageColumn("Attacker moves", attackerRows),
    damageColumn("Defender moves", defenderRows),
  );
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

function renderDamageCard(move, sourceSide, targetSide, selected) {
  const source = damageState[sourceSide];
  const target = damageState[targetSide];
  const result = calculateDamage({
    attacker: source.pokemon,
    defender: target.pokemon,
    move,
    attackerState: source,
    defenderState: target,
    battleFormat: elements.battleFormat.value,
    critical: elements.damageCritical.checked,
    burned: source.burned,
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
  return card;
}

function renderMoveOrder() {
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
    trickRoom: elements.trickRoom.checked,
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
  const usage = usageForPokemon(usageStats, state.pokemon);
  return sortByUsage(mergeUsage(resolvePokemonMoves(state.pokemon, moveLookup), usage?.moves));
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

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function normalizeDamageId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

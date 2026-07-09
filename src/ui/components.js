import { formatMovePriority } from "../data/catalog.js";

// Abbreviated stat labels — used on the battle page (SP/stage inputs, final-stat chips) where
// space is tight.
export const STAT_LABELS = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

// Full-word stat labels — used on the lookup page's form-card stat grid.
export const FULL_STAT_LABELS = {
  hp: "HP",
  atk: "Attack",
  def: "Defense",
  spa: "Sp. Atk",
  spd: "Sp. Def",
  spe: "Speed",
};

export function optionElement(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

export function updateSelectOptions(select, emptyLabel, values) {
  const selected = select.value;
  const sortedValues = values.sort((a, b) => a.localeCompare(b));
  select.replaceChildren(
    optionElement("", emptyLabel),
    ...sortedValues.map((value) => optionElement(value, value)),
  );
  select.value = sortedValues.includes(selected) ? selected : "";
}

export function moveNameCell(move) {
  const cell = document.createElement("td");
  cell.className = "move-name-cell";
  cell.dataset.label = "Move";

  const name = document.createElement("strong");
  name.textContent = move.name;

  const id = document.createElement("small");
  id.textContent = move.id;

  const details = document.createElement("span");
  details.className = "move-name-details";
  if (move.type) details.append(typeBadge(move.type));
  details.append(id);

  const priority = Number(move.priority ?? 0);
  if (priority !== 0) {
    const badge = document.createElement("span");
    badge.className = `move-priority-badge ${priority > 0 ? "positive" : "negative"}`;
    badge.textContent = formatMovePriority(priority);
    badge.title = `Priority ${formatMovePriority(priority)}`;
    cell.append(badge);
  }

  cell.append(name, details);
  return cell;
}

export function typeBadge(type) {
  const badge = document.createElement("span");
  badge.className = `type-badge ${typeClassName(type)}`;
  badge.textContent = type || "Unknown";
  return badge;
}

export function typeClassName(type) {
  const normalized = String(type || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `type-${normalized || "unknown"}`;
}

export function damagePercentColor(minPercent, maxPercent = minPercent) {
  const min = Number(minPercent);
  const max = Number(maxPercent);
  const average = Number.isFinite(min) && Number.isFinite(max) ? (min + max) / 2 : 0;
  const clamped = Math.max(0, Math.min(100, average));
  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue} 72% 56%)`;
}

export function textCell(text, className = "", label = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text;
  return cell;
}

// Shared Pokémon search-result row, used by both the lookup page's Pokémon search and the
// battle page's attacker/defender search. `onSelect` receives the chosen entry.
// `preventBlur: true` (battle page only) keeps the search input focused across the click by
// stopping the pointerdown from blurring it before the click handler runs.
export function searchResultButton(entry, onSelect, { preventBlur = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result";
  button.innerHTML = `
    <span>${entry.name}</span>
    <small>${entry.searchMatch || entry.aliases.join(" · ") || entry.baseSpecies}</small>
    <strong>${entry.baseSpeed}</strong>
  `;
  if (preventBlur) button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => onSelect(entry));
  return button;
}

// Shared SP / stat-stage number inputs for the battle page's attacker/defender columns.
export function spInput({ stat, side, value = 0, onChange }) {
  return statNumberInput({
    stat,
    side,
    value,
    onChange,
    kind: "sp",
    label: `${STAT_LABELS[stat]} SP`,
    min: 0,
    max: 32,
  });
}

export function stageInput({ stat, side, value = 0, onChange }) {
  return statNumberInput({
    stat,
    side,
    value,
    onChange,
    kind: "stage",
    label: `${STAT_LABELS[stat]} stage`,
    min: -6,
    max: 6,
  });
}

function statNumberInput({ stat, side, value, onChange, kind, label: labelText, min, max }) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  input.dataset.side = side;
  input.dataset.kind = kind;
  input.dataset.stat = stat;
  if (onChange) input.addEventListener("input", onChange);
  label.append(input);
  return label;
}

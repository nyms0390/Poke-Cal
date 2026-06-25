import { formatMovePriority } from "./catalog.js";

export const STAT_LABELS = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
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

  const priority = Number(move.priority ?? 0);
  if (priority !== 0) {
    const badge = document.createElement("span");
    badge.className = `move-priority-badge ${priority > 0 ? "positive" : "negative"}`;
    badge.textContent = formatMovePriority(priority);
    badge.title = `Priority ${formatMovePriority(priority)}`;
    cell.append(badge);
  }

  cell.append(name, id);
  return cell;
}

export function textCell(text, className = "", label = "") {
  const cell = document.createElement("td");
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  cell.textContent = text;
  return cell;
}


import { pokemonSpriteId } from "../data/pokemon.js";
import { formatMovePriority } from "../engine/battle-order.js";
import { getLocale, localizedName, localizedTerm, t, toTraditionalChinese } from "../i18n.js";

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

export function updateSelectOptions(select, emptyLabel, values, displayValue = (value) => value) {
  const selected = select.value;
  const sortedValues = values.sort((a, b) => a.localeCompare(b));
  select.replaceChildren(
    optionElement("", emptyLabel),
    ...sortedValues.map((value) => optionElement(value, displayValue(value))),
  );
  select.value = sortedValues.includes(selected) ? selected : "";
}

export function ensureRenderedRows(container, rowSelector, createChildren, renderKey) {
  let rows = [...container.querySelectorAll(rowSelector)];
  const normalizedKey = renderKey === undefined ? undefined : String(renderKey);
  const keyChanged = normalizedKey !== undefined && container.dataset.renderKey !== normalizedKey;
  if (rows.length > 0 && !keyChanged) return rows;
  container.replaceChildren(...createChildren());
  if (normalizedKey !== undefined) container.dataset.renderKey = normalizedKey;
  rows = [...container.querySelectorAll(rowSelector)];
  return rows;
}

export function moveNameCell(move) {
  const cell = document.createElement("td");
  cell.className = "move-name-cell";
  cell.dataset.label = "Move";

  const name = document.createElement("strong");
  name.textContent = localizedName(move);

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
    badge.title = t("label.priority", { value: formatMovePriority(priority) });
    cell.append(badge);
  }

  cell.append(name, details);
  return cell;
}

export function typeBadge(type) {
  const badge = document.createElement("span");
  badge.className = `type-badge ${typeClassName(type)}`;
  badge.textContent = localizedTerm("type", type || "Unknown");
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

export function pokemonSpriteUrls(pokemon) {
  const spriteId = pokemon?.spriteId ?? pokemonSpriteId(pokemon);
  const baseUrl = "https://play.pokemonshowdown.com/sprites";
  return [`${baseUrl}/gen5/${spriteId}.png`, `${baseUrl}/ani/${spriteId}.gif`];
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
export function searchResultButton(entry, onSelect, {
  preventBlur = false,
  small = entry.searchMatch || (getLocale() === "zh-TW"
    ? entry.name
    : (entry.aliases ?? []).map(toTraditionalChinese).join(" · ")) || entry.baseSpecies,
  strong = entry.baseSpeed,
} = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result";
  button.innerHTML = `
    <span>${localizedName(entry)}</span>
    <small>${small ?? ""}</small>
    <strong>${strong ?? ""}</strong>
  `;
  if (preventBlur) button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => onSelect(entry));
  return button;
}

export function attachCombobox({ input, resultsEl, getMatches, onSelect, renderRow }) {
  function hide() {
    resultsEl.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }

  function render() {
    const matches = getMatches(input.value) ?? [];
    resultsEl.replaceChildren(
      ...matches.map((entry) => renderRow(entry, (selected) => {
        hide();
        onSelect(selected);
      })),
    );
    const isOpen = matches.length > 0;
    resultsEl.hidden = !isOpen;
    input.setAttribute("aria-expanded", String(isOpen));
    return matches;
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hide();
      return;
    }
    if (event.key === "ArrowDown") {
      const first = resultsEl.querySelector(".search-result");
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key !== "Enter") return;
    const [first] = getMatches(input.value) ?? [];
    if (!first) return;
    event.preventDefault();
    hide();
    onSelect(first);
  });

  resultsEl.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    hide();
    input.focus();
  });

  const outsideClick = (event) => {
    if (!input.contains(event.target) && !resultsEl.contains(event.target)) hide();
  };
  document.addEventListener("click", outsideClick);

  return {
    render,
    hide,
    destroy() {
      document.removeEventListener("click", outsideClick);
    },
  };
}

// Stat editor controls shared by the battle page's attacker/defender columns.
function spInput({ stat, side, value = 0, onChange }) {
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

export function statEditorRow(stat, { side, base, sp, final, stage, onChange }) {
  const row = document.createElement("div");
  row.className = "battle-stat-editor-row";

  const label = document.createElement("span");
  label.className = "stat-cell-label";
  label.textContent = localizedTerm("stat", STAT_LABELS[stat]);

  const baseCell = document.createElement("span");
  baseCell.className = "stat-cell-base";
  baseCell.textContent = String(base ?? "—");

  const spCell = document.createElement("span");
  spCell.className = "stat-cell-sp";
  const spControl = spInput({ stat, side, value: sp, onChange }).querySelector("input");
  spControl.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} SP`);
  spCell.append(spControl);

  const finalCell = document.createElement("span");
  finalCell.className = "stat-cell-final";
  finalCell.textContent = String(final ?? "—");

  const stageCell = document.createElement("span");
  stageCell.className = "stat-cell-stage";
  if (stat === "hp") {
    stageCell.textContent = "—";
  } else {
    const select = document.createElement("select");
    select.dataset.side = side;
    select.dataset.kind = "stage";
    select.dataset.stat = stat;
    select.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} ${getLocale() === "zh-TW" ? "階級" : "stage"}`);
    select.replaceChildren(
      ...Array.from({ length: 13 }, (_, index) => {
        const value = index - 6;
        return optionElement(value, value > 0 ? `+${value}` : String(value));
      }),
    );
    select.value = String(stage ?? 0);
    if (onChange) select.addEventListener("input", onChange);
    stageCell.append(select);
  }

  row.append(label, baseCell, spCell, finalCell, stageCell);
  return row;
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

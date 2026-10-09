import { filterMoves } from "../data/catalog.js";
import { pokemonSpriteId, searchPokemon } from "../data/pokemon.js";
import { MOVE_PROPERTY_FLAGS } from "../data/move-properties.js";
import { formatMovePriority } from "../engine/battle-order.js";
import { isGuaranteedCritical } from "../engine/critical.js";
import { getLocale, localizedName, localizedTerm, t, toTraditionalChinese } from "../i18n.js";
import { urlWithoutConsumedParams } from "./battle-state.js";

const ITEM_ICON_SHEET_URL = "https://play.pokemonshowdown.com/sprites/itemicons-sheet.png?v1";

const TYPE_ICON_PATHS = {
  Bug: "public/icons/types/bug.png",
  Dark: "public/icons/types/dark.png",
  Dragon: "public/icons/types/dragon.png",
  Electric: "public/icons/types/electric.png",
  Fairy: "public/icons/types/fairy.png",
  Fighting: "public/icons/types/fighting.png",
  Fire: "public/icons/types/fire.png",
  Flying: "public/icons/types/flying.png",
  Ghost: "public/icons/types/ghost.png",
  Grass: "public/icons/types/grass.png",
  Ground: "public/icons/types/ground.png",
  Ice: "public/icons/types/ice.png",
  Normal: "public/icons/types/normal.png",
  Poison: "public/icons/types/poison.png",
  Psychic: "public/icons/types/psychic.png",
  Rock: "public/icons/types/rock.png",
  Steel: "public/icons/types/steel.png",
  Water: "public/icons/types/water.png",
};

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

// Full-word stat labels — used on the lookup page's base-stat grid.
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

export function moveNameCell(move, { showType = true } = {}) {
  const cell = document.createElement("td");
  cell.className = "move-name-cell";
  cell.dataset.label = "Move";

  const name = document.createElement("strong");
  name.textContent = localizedName(move);

  const details = document.createElement("span");
  details.className = "move-name-details";
  if (showType && move.type) details.append(typeBadge(move.type));

  const priority = Number(move.priority ?? 0);
  if (priority !== 0) {
    const badge = document.createElement("span");
    badge.className = `move-priority-badge ${priority > 0 ? "positive" : "negative"}`;
    badge.textContent = formatMovePriority(priority);
    badge.title = t("label.priority", { value: formatMovePriority(priority) });
    cell.append(badge);
  }

  cell.append(name);
  if (details.children.length > 0) cell.append(details);
  return cell;
}

export function typeBadge(type) {
  const badge = document.createElement("span");
  badge.className = `type-badge ${typeClassName(type)}`;

  const iconPath = typeIconPath(type);
  if (iconPath) {
    const icon = document.createElement("img");
    icon.className = "type-badge-icon";
    icon.src = iconPath;
    icon.width = 14;
    icon.height = 14;
    icon.setAttribute("alt", "");
    icon.setAttribute("aria-hidden", "true");
    badge.append(icon);
  }

  const label = document.createElement("span");
  label.className = "type-badge-label";
  label.textContent = localizedTerm("type", type || "Unknown");
  badge.append(label);
  return badge;
}

export function typeIconPath(type) {
  return TYPE_ICON_PATHS[type] ?? "";
}

// A round type mark for a move (its base type, icon only; dashed when there is no move).
// Builder and Matchups put it before each move slot; Battle puts it in the set cards' move
// chips. Pass an existing mark as `icon` to update it in place. Decorative: the move name
// always sits next to it.
export function moveTypeIcon(move, { className = "", icon = document.createElement("span") } = {}) {
  icon.className = ["move-type-icon", "type-badge", move?.type ? typeClassName(move.type) : "empty", className]
    .filter(Boolean).join(" ");
  icon.setAttribute("aria-hidden", "true");
  const path = move?.type ? typeIconPath(move.type) : "";
  if (!path) {
    icon.replaceChildren();
    return icon;
  }
  const image = document.createElement("img");
  image.src = path;
  image.alt = "";
  icon.replaceChildren(image);
  return icon;
}

export function typeClassName(type) {
  const normalized = String(type || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `type-${normalized || "unknown"}`;
}

export function moveCategoryIconPath(category) {
  return {
    Physical: "public/icons/move-physical.png",
    Special: "public/icons/move-special.png",
    Status: "public/icons/move-status.png",
  }[category] ?? "";
}

export function moveCategoryMark(category) {
  const label = localizedTerm("category", category) || "—";
  const path = moveCategoryIconPath(category);
  if (!path) return document.createTextNode(label);

  const icon = document.createElement("img");
  icon.className = `move-category-icon move-category-${category.toLowerCase()}`;
  icon.src = path;
  icon.width = 24;
  icon.height = 18;
  icon.alt = label;
  icon.title = label;
  return icon;
}

export function movePropertyCell(move) {
  const cell = textCell("", "move-property-cell", t("label.moveProperties"));
  const flags = MOVE_PROPERTY_FLAGS.filter((flag) => move.flags?.[flag]);
  if (flags.length === 0) {
    cell.textContent = "—";
    return cell;
  }

  const tags = document.createElement("div");
  tags.className = "move-property-tags";
  tags.append(...flags.map((flag) => {
    const tag = document.createElement("span");
    tag.className = "move-property-tag";
    tag.textContent = t(`moveProperty.${flag}`);
    return tag;
  }));
  cell.append(tags);
  return cell;
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

// A Pokémon sprite image with the shared fallback chain: Showdown's gen5 sprite, then its
// animated sprite, then the localized initial in a span (hidden until both images fail).
// Returns [image, fallback]; the caller places them.
export function pokemonSpriteElements(pokemon, { size, lazy = false, className = "", fetchPriority = "" } = {}) {
  const image = document.createElement("img");
  if (lazy) image.loading = "lazy";
  image.alt = "";
  image.width = size;
  image.height = size;
  if (className) image.className = className;
  if (fetchPriority) image.fetchPriority = fetchPriority;
  const [source, fallbackSource] = pokemonSpriteUrls(pokemon);
  image.src = source;

  const fallback = document.createElement("span");
  fallback.setAttribute("aria-hidden", "true");
  fallback.hidden = true;
  fallback.textContent = localizedName(pokemon).slice(0, 1);

  let nextSource = fallbackSource;
  image.addEventListener("error", () => {
    if (nextSource) {
      image.src = nextSource;
      nextSource = "";
      return;
    }
    image.remove();
    fallback.hidden = false;
  });
  return [image, fallback];
}

// The 42px lazily loaded sprite used in Builder and Speed result rows.
export function pokemonMiniSprite(pokemon) {
  const wrap = document.createElement("span");
  wrap.className = "pokemon-minisprite";
  wrap.append(...pokemonSpriteElements(pokemon, { size: 42, lazy: true }));
  return wrap;
}

export function itemSpritePosition(item) {
  const left = (item.spritenum % 16) * 24;
  const top = Math.floor(item.spritenum / 16) * 24;
  return `-${left}px -${top}px`;
}

export function itemLabel(item, { showName = true } = {}) {
  const name = localizedName(item);
  const label = document.createElement("span");
  label.className = "item-label";

  if (!showName) {
    label.setAttribute("role", "img");
    label.setAttribute("aria-label", name);
    label.setAttribute("title", name);
  }

  const icon = document.createElement("span");
  icon.className = "item-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.style.backgroundImage = `url("${ITEM_ICON_SHEET_URL}")`;
  icon.style.backgroundPosition = itemSpritePosition(item);
  label.append(icon);

  if (showName) {
    const text = document.createElement("span");
    text.className = "item-label-text";
    text.textContent = name;
    label.append(text);
  }

  return label;
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
// Pointer selection keeps the search input focused until the click handler runs, so the
// combobox's focus-leave behavior cannot close the popup before selection completes.
export function searchResultButton(entry, onSelect, {
  preventBlur = true,
  small = entry.searchMatch || (getLocale() === "zh-TW"
    ? entry.name
    : (entry.aliases ?? []).map(toTraditionalChinese).join(" · ")) || entry.baseSpecies,
  strong = entry.baseSpeed,
} = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result";

  const name = document.createElement("span");
  name.textContent = localizedName(entry);
  const details = document.createElement("small");
  if (typeof small === "object" && small !== null) details.append(small);
  else details.textContent = String(small ?? "");
  details.hidden = details.children.length === 0 && !details.textContent;
  const value = document.createElement("strong");
  value.textContent = String(strong ?? "");
  button.append(name, details, value);

  if (preventBlur) button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", () => onSelect(entry));
  return button;
}

export const POKEMON_RESULT_LIMIT = 8;

// Pokémon search callbacks for attachCombobox: the first POKEMON_RESULT_LIMIT matches, and
// every match for "Show all". `getCatalogs` returns the current { pokemon, abilityLookup,
// moveLookup, itemLookup } so pickers can be attached before or after catalogs load.
export function pokemonSearchMatchers(getCatalogs) {
  const search = (query, limit) => {
    const { pokemon, abilityLookup, moveLookup, itemLookup } = getCatalogs();
    return searchPokemon(pokemon, query, {
      abilityLookup,
      moveLookup,
      itemLookup,
      limit: limit ?? pokemon.length,
    });
  };
  return {
    getMatches: (query) => search(query, POKEMON_RESULT_LIMIT),
    getAllMatches: (query) => search(query),
    resultLimit: POKEMON_RESULT_LIMIT,
  };
}

// localStorage, or null where storage is unavailable (privacy modes, sandboxed frames).
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

// Reads a one-off `?key=` hand-off from another page and removes it from the address bar, so
// a reload restores the page's saved state instead of re-seeding from the link (as Battle
// does for `?left=`).
export function consumeQueryParam(key) {
  const value = new URLSearchParams(globalThis.location?.search ?? "").get(key);
  const next = urlWithoutConsumedParams(globalThis.location?.href ?? "", [key]);
  if (next !== null) {
    try {
      globalThis.history?.replaceState(globalThis.history.state, "", next);
    } catch {
      // Some embedded or file:// contexts refuse history updates; the page still works.
    }
  }
  return value;
}

// Move search-result row: name, type and category, and base power.
export function moveSearchResultRow(move, onSelect) {
  const details = document.createDocumentFragment();
  details.append(typeBadge(move.type), " · ", moveCategoryMark(move.category));
  return searchResultButton(move, onSelect, {
    preventBlur: true,
    small: details,
    strong: move.basePower ?? "—",
  });
}

// One move slot's search combobox (Battle and Builder), named "Move 1"…"Move 4".
// `showSelection` puts the selected move in the input's "value" (Builder) or only in its
// "placeholder" (Battle). With `resultLimit`, the list shows that many moves plus
// "Show all". `onSelect(move, input)` runs after a pick. Returns the .move-combobox
// element, its input, and a cleanup for the document listener.
export function moveSlotCombobox({ index, moves, selectedMove, showSelection = "value", resultLimit = null, onSelect }) {
  const input = document.createElement("input");
  input.type = "search";
  input.autocomplete = "off";
  input.role = "combobox";
  if (showSelection === "placeholder") {
    input.placeholder = selectedMove ? localizedName(selectedMove) : t("label.chooseMove");
  } else {
    input.value = selectedMove ? localizedName(selectedMove) : "";
    input.placeholder = t("label.chooseMove");
  }
  input.setAttribute("aria-label", t("battle.moveNumber", { number: index + 1 }));
  const results = document.createElement("div");
  results.className = "search-results move-search-results";
  results.hidden = true;
  const element = document.createElement("div");
  element.className = "move-combobox";
  element.append(input, results);
  const allMatches = (query) => filterMoves(moves, { query });
  const combobox = attachCombobox({
    input,
    resultsEl: results,
    getMatches: resultLimit ? (query) => allMatches(query).slice(0, resultLimit) : allMatches,
    getAllMatches: resultLimit ? allMatches : null,
    resultLimit,
    onSelect: (move) => onSelect(move, input),
    renderRow: moveSearchResultRow,
  });
  return { element, input, destroy: combobox.destroy };
}

// The per-slot critical-hit toggle. Guaranteed crits (Frost Breath, or Leaf Blade from a
// Sirfetch'd holding a Leek) are shown pressed and disabled; pass the user's `pokemon` and
// `state` (item/ability) so held-item and ability crit stages count.
// `onToggle(pressed, button)` runs after aria-pressed flips.
export function critToggleButton({ index, side = "", selectedMove, pokemon = null, state = {}, manual = false, onToggle }) {
  const crit = document.createElement("button");
  crit.type = "button";
  crit.className = "move-toggle";
  crit.textContent = t("battle.crit");
  crit.dataset.kind = "crit";
  if (side) crit.dataset.side = side;
  crit.dataset.index = String(index);
  const alwaysCrit = selectedMove && isGuaranteedCritical({ move: selectedMove, attacker: pokemon, attackerState: state });
  crit.disabled = Boolean(alwaysCrit);
  crit.setAttribute("aria-pressed", String(alwaysCrit || Boolean(manual)));
  crit.addEventListener("click", () => {
    const pressed = crit.getAttribute("aria-pressed") !== "true";
    crit.setAttribute("aria-pressed", String(pressed));
    onToggle(pressed, crit);
  });
  return crit;
}

// A labelled select for one move-condition descriptor (see move-conditions.js).
export function moveConditionSelect(descriptor, { index, side = "", value, onInput }) {
  const label = document.createElement("label");
  label.className = "move-inline-control";
  label.textContent = t(descriptor.labelKey);
  const select = document.createElement("select");
  select.dataset.kind = "move-option";
  if (side) select.dataset.side = side;
  select.dataset.index = String(index);
  select.dataset.key = descriptor.key;
  select.replaceChildren(...descriptor.choices.map((choice) =>
    optionElement(choice.value, choice.labelKey ? t(choice.labelKey) : choice.label)));
  select.value = value;
  select.addEventListener("input", onInput);
  label.append(select);
  return label;
}

export function visibleSearchResults(matches, { limit = 12, expanded = false } = {}) {
  const allMatches = Array.isArray(matches) ? matches : [];
  const visibleMatches = expanded ? allMatches : allMatches.slice(0, limit);
  return {
    matches: visibleMatches,
    canExpand: !expanded && visibleMatches.length < allMatches.length,
  };
}

export function searchResultFocusIndex(currentIndex, count, key) {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return (currentIndex + 1 + count) % count;
  if (key === "ArrowUp") return (currentIndex - 1 + count) % count;
  return -1;
}

let comboboxIdCounter = 0;

// Give a popup list a document-unique id so option ids, aria-controls and
// aria-activedescendant never collide between pickers (move pickers have no static id).
function ensureListboxId(resultsEl) {
  if (!resultsEl.id) {
    comboboxIdCounter += 1;
    resultsEl.id = `pokecal-listbox-${comboboxIdCounter}`;
  }
  return resultsEl.id;
}

export function attachCombobox({
  input,
  resultsEl,
  getQuery = (value) => value,
  getMatches,
  getAllMatches = null,
  resultLimit = null,
  onSelect,
  renderRow,
}) {
  let expanded = false;
  const listboxId = ensureListboxId(resultsEl);
  resultsEl.setAttribute("role", "listbox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-haspopup", "listbox");
  input.setAttribute("aria-controls", listboxId);
  input.setAttribute("aria-expanded", String(!resultsEl.hidden));

  // A closed popup keeps no options, so nothing (including aria-activedescendant) can point
  // into a hidden list.
  function hide() {
    resultsEl.hidden = true;
    resultsEl.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function render() {
    input.removeAttribute("aria-activedescendant");
    const query = getQuery(input.value);
    const allMatches = getAllMatches ? getAllMatches(query) ?? [] : null;
    const matches = allMatches ?? (getMatches(query) ?? []);
    const visible = allMatches
      ? visibleSearchResults(allMatches, { limit: resultLimit ?? matches.length, expanded })
      : { matches, canExpand: false };
    resultsEl.replaceChildren(
      ...visible.matches.map((entry, index) => {
        const row = renderRow(entry, (selected) => {
          row.setAttribute("aria-selected", "true");
          input.removeAttribute("aria-activedescendant");
          hide();
          onSelect(selected);
        });
        row.id = `${listboxId}-option-${index}`;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        return row;
      }),
    );
    if (visible.canExpand) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "search-results-more";
      more.setAttribute("role", "option");
      more.setAttribute("aria-selected", "false");
      more.textContent = t("label.showAll");
      more.addEventListener("pointerdown", (event) => event.preventDefault());
      more.addEventListener("click", () => {
        expanded = true;
        render();
        input.focus();
      });
      resultsEl.append(more);
    }
    const hasQuery = query.trim().length > 0;
    if (hasQuery && visible.matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "search-results-empty";
      empty.setAttribute("role", "option");
      empty.setAttribute("aria-disabled", "true");
      empty.textContent = t("search.noMatches");
      resultsEl.append(empty);
    }
    const isOpen = visible.matches.length > 0 || hasQuery;
    if (!isOpen) {
      hide();
      return visible.matches;
    }
    resultsEl.hidden = false;
    input.setAttribute("aria-expanded", "true");
    return visible.matches;
  }

  input.addEventListener("input", () => {
    expanded = false;
    render();
  });
  input.addEventListener("focus", render);
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === "Escape") {
      if (!resultsEl.hidden) event.preventDefault();
      hide();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const options = [...resultsEl.querySelectorAll(".search-result")];
      const target = event.key === "ArrowDown" ? options[0] : options.at(-1);
      if (target) {
        event.preventDefault();
        input.setAttribute("aria-activedescendant", target.id);
        target.focus();
      }
      return;
    }
    if (event.key !== "Enter" || resultsEl.hidden) return;
    const [first] = getMatches(getQuery(input.value)) ?? [];
    if (!first) return;
    event.preventDefault();
    hide();
    onSelect(first);
  });

  resultsEl.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      input.focus();
      hide();
      return;
    }
    const options = [...resultsEl.querySelectorAll(".search-result")];
    const current = options.indexOf(event.target.closest?.(".search-result"));
    const next = searchResultFocusIndex(current, options.length, event.key);
    if (next < 0) return;
    event.preventDefault();
    input.setAttribute("aria-activedescendant", options[next].id);
    options[next].focus();
  });

  const focusLeave = () => {
    queueMicrotask(() => {
      if (document.activeElement !== input && !resultsEl.contains(document.activeElement)) hide();
    });
  };
  input.addEventListener("focusout", focusLeave);
  resultsEl.addEventListener("focusout", focusLeave);

  const outsideClick = (event) => {
    const path = event.composedPath?.();
    const isInside = path
      ? path.includes(input) || path.includes(resultsEl)
      : input.contains(event.target) || resultsEl.contains(event.target);
    if (!isInside) hide();
  };
  document.addEventListener("click", outsideClick);

  return {
    render,
    hide,
    destroy() {
      input.removeEventListener("focusout", focusLeave);
      resultsEl.removeEventListener("focusout", focusLeave);
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

// Shared data-load error panel. Text uses data-i18n keys so applyDocumentTranslations()
// re-localizes it when the language changes. `messageKeys` lists one sentence per failed
// source; `onRetry` runs when the Retry button is pressed.
export function loadErrorPanel({ messageKeys = [], onRetry } = {}) {
  const panel = document.createElement("section");
  panel.className = "load-error";
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-labelledby", "load-error-title");
  panel.dataset.loadError = "";

  const title = document.createElement("h2");
  title.id = "load-error-title";
  title.className = "load-error-title";
  title.dataset.i18n = "loadError.title";
  title.textContent = t("loadError.title");

  const messages = document.createElement("div");
  messages.className = "load-error-messages";

  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "load-error-retry";
  retry.addEventListener("click", () => {
    if (retry.getAttribute("aria-disabled") === "true") return;
    onRetry?.();
  });

  panel.append(title, messages, retry);
  updateLoadErrorPanel(panel, { messageKeys, retrying: false });
  return panel;
}

export function updateLoadErrorPanel(panel, { messageKeys, retrying = false } = {}) {
  const messages = panel.querySelector(".load-error-messages");
  if (messageKeys) {
    messages.replaceChildren(...messageKeys.map((key) => {
      const message = document.createElement("p");
      message.dataset.i18n = key;
      message.textContent = t(key);
      return message;
    }));
  }
  const retry = panel.querySelector(".load-error-retry");
  const labelKey = retrying ? "loadError.retrying" : "loadError.retry";
  retry.dataset.i18n = labelKey;
  retry.textContent = t(labelKey);
  // aria-disabled (not disabled) keeps keyboard focus on the button during a retry.
  retry.setAttribute("aria-disabled", String(retrying));
  panel.setAttribute("aria-busy", String(retrying));
}

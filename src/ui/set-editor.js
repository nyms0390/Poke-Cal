// The "Your set" editor shared by Builder and Matchups: Pokémon (with its sprite), nature,
// ability, item and status, the Stat / Base / SP / Stage / Final table with the SP budget, and
// four move slots (type mark, move search, crit toggle and any move conditions).
//
// The editor owns its markup and rendering; the page owns the state. Every edit is reported as
// an applyControl-shaped control through `onControl` (ability and item already resolved to
// catalog entries), and the editor redraws from `getSetup()` afterwards, so a page can stage
// edits (Builder) or apply them at once (Matchups).
import {
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
} from "../data/catalog.js";
import { STAT_KEYS } from "../engine/constants.js";
import { NATURES, natureOptionLabel } from "../engine/natures.js";
import { calculateStat } from "../engine/stats.js";
import {
  getLocale,
  localizedName,
  localizedNatureOptionLabel,
  localizedTerm,
  t,
  translateSubtree,
} from "../i18n.js";
import { rankByUsage } from "./bootstrap.js";
import {
  STAT_LABELS,
  attachCombobox,
  critToggleButton,
  ensureRenderedRows,
  moveConditionSelect,
  moveSlotCombobox,
  optionElement,
  pokemonSearchMatchers,
  pokemonSpriteElements,
  searchResultButton,
  typeClassName,
  typeIconPath,
} from "./components.js";
import { moveConditionDescriptors, moveConditionValue } from "./move-conditions.js";

// Champions caps a Pokémon's SP at 66 in total (see SP_TOTAL_LIMIT in the damage engine).
export const SET_SP_LIMIT = 66;
const MOVE_SLOTS = [0, 1, 2, 3];
const MOVE_RESULT_LIMIT = 12;

export const STATUS_OPTIONS = [
  ["", "Healthy"],
  ["burn", "Burned"],
  ["poison", "Poisoned"],
  ["toxic", "Badly Poisoned"],
  ["paralysis", "Paralyzed"],
  ["sleep", "Asleep"],
  ["freeze", "Frozen"],
  ["soak", "Soaked"],
];

export function statusOptions() {
  return STATUS_OPTIONS.map(([value, label]) => ({ value, label: localizedTerm("status", label) }));
}

/** The moves a set can pick from, most used first. */
export function setEditorMoves(pokemon, moveLookup) {
  if (!pokemon) return [];
  return rankByUsage(resolveChampionsPokemonMoves(pokemon, moveLookup), pokemon.champions?.usage?.moves);
}

/** Final stats with stat stages (HP has none). */
export function setFinalStats(setup) {
  if (!setup?.pokemon) return null;
  return Object.fromEntries(STAT_KEYS.map((stat) => [stat, calculateStat({
    base: setup.pokemon.baseStats[stat],
    stat,
    sp: setup.sp?.[stat] ?? 0,
    nature: setup.nature,
    stage: stat === "hp" ? 0 : setup.stages?.[stat] ?? 0,
  })]));
}

export function spSpent(sp = {}) {
  return STAT_KEYS.reduce((total, stat) => total + (Number(sp[stat]) || 0), 0);
}

/**
 * Builds the editor inside `host` (an empty element) and returns
 * `{ elements, renderOptions(), render(), renderMoves() }`.
 * - `prefix` namespaces element ids (`<prefix>-pokemon-search`, `<prefix>-stats`, …).
 * - `getCatalogs()` returns the loaded catalogs (null while loading).
 * - `getSetup()` returns the side state to show (Builder passes its staged draft).
 * - `onPokemonSelect(pokemon)` and `onControl(control)` report edits.
 */
export function mountSetEditor(host, { prefix, getCatalogs, getSetup, onPokemonSelect, onControl }) {
  const id = (name) => `${prefix}-${name}`;
  host.classList.add("set-editor");
  host.innerHTML = `
    <h2 id="${id("set-heading")}" class="set-editor-title sheet-hidden" data-i18n="matchups.yourSet">Your set</h2>
    <div class="set-editor-pokemon">
      <span id="${id("sprite")}" class="set-editor-sprite" aria-hidden="true"></span>
      <div class="set-editor-pokemon-field">
        <label class="visually-hidden" for="${id("pokemon-search")}">Pokémon</label>
        <div class="pokemon-combobox">
          <input id="${id("pokemon-search")}" name="${id("pokemon-search")}" type="search" autocomplete="off"
            role="combobox" aria-controls="${id("pokemon-results")}" aria-expanded="false" />
          <div id="${id("pokemon-results")}" class="search-results pokemon-search-results" hidden></div>
        </div>
      </div>
    </div>
    <label class="set-editor-field">
      Nature
      <select id="${id("nature")}" data-kind="nature"></select>
    </label>
    <div class="set-editor-fields">
      <label class="set-editor-field">
        Ability
        <select id="${id("ability")}" data-kind="ability"></select>
      </label>
      <label class="set-editor-field">
        Item
        <select id="${id("item")}" data-kind="item"></select>
      </label>
      <label class="set-editor-field">
        Status
        <select id="${id("status")}" data-kind="status"></select>
      </label>
    </div>
    <div class="set-editor-stats">
      <div class="set-editor-stat-heading" aria-hidden="true">
        <span>Stat</span><span>Base</span><span>SP</span><span>Stage</span><span>Final</span>
      </div>
      <div id="${id("stats")}" class="set-editor-stat-rows" role="group" aria-label="Final stats"
        data-i18n-aria-label="builder.finalStats"></div>
    </div>
    <div class="set-editor-sp-budget">
      <p id="${id("sp-total")}" class="set-editor-sp-total" aria-live="polite">—</p>
      <span class="set-editor-sp-meter" aria-hidden="true"><span id="${id("sp-meter-fill")}"></span></span>
    </div>
    <section class="set-editor-moves" aria-labelledby="${id("moves-heading")}">
      <h3 id="${id("moves-heading")}" class="set-editor-subtitle" data-i18n="matchups.moves">Moves</h3>
      <div id="${id("move-picks")}" class="set-editor-move-picks"></div>
    </section>`;

  const find = (name) => host.querySelector(`#${id(name)}`);
  const elements = {
    sprite: find("sprite"),
    pokemonSearch: find("pokemon-search"),
    pokemonResults: find("pokemon-results"),
    nature: find("nature"),
    ability: find("ability"),
    item: find("item"),
    status: find("status"),
    stats: find("stats"),
    spTotal: find("sp-total"),
    spMeterFill: find("sp-meter-fill"),
    movePicks: find("move-picks"),
  };
  let spriteId = "";
  let moveCleanups = [];

  attachCombobox({
    input: elements.pokemonSearch,
    resultsEl: elements.pokemonResults,
    ...pokemonSearchMatchers(() => getCatalogs()),
    onSelect: (pokemon) => onPokemonSelect(pokemon),
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });

  const edit = (control, { moves = false } = {}) => {
    onControl(control);
    if (moves) renderMoves();
    render();
  };

  for (const select of [elements.nature, elements.ability, elements.item, elements.status]) {
    select.addEventListener("input", (event) => {
      const { kind } = event.target.dataset;
      const catalogs = getCatalogs();
      const value = event.target.value;
      if (kind === "ability") edit({ kind, value: catalogs?.abilityLookup.get(normalizeId(value)) ?? null }, { moves: true });
      else if (kind === "item") edit({ kind, value: catalogs?.itemLookup.get(normalizeId(value)) ?? null }, { moves: true });
      else edit({ kind, value }, { moves: kind === "status" });
    });
  }

  elements.stats.addEventListener("input", (event) => {
    const { kind, stat } = event.target.dataset;
    if (!stat || (kind !== "sp" && kind !== "stage")) return;
    edit({ kind, stat, value: event.target.value });
  });
  // A typed SP value is clamped (0-32) once the field is left.
  elements.stats.addEventListener("change", (event) => {
    if (event.target.dataset.kind === "sp") renderStats(getSetup(), { force: true });
  });

  function renderOptions() {
    const setup = getSetup();
    const catalogs = getCatalogs();
    elements.nature.replaceChildren(...Object.keys(NATURES).map((nature) => optionElement(
      nature,
      getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature),
    )));
    elements.status.replaceChildren(...statusOptions().map(({ value, label }) => optionElement(value, label)));
    if (setup?.pokemon && catalogs) {
      const usage = setup.pokemon.champions?.usage;
      const abilities = rankByUsage(resolvePokemonAbilities(setup.pokemon, catalogs.abilityLookup), usage?.abilities);
      const items = rankByUsage(catalogs.items, usage?.items);
      elements.ability.replaceChildren(
        optionElement("", t("builder.noAbility")),
        ...abilities.map((ability) => optionElement(ability.id, localizedName(ability))),
      );
      elements.item.replaceChildren(
        optionElement("", t("builder.noItem")),
        ...items.map((item) => optionElement(item.id, localizedName(item))),
      );
    }
    renderMoves();
    render();
    translateSubtree(host);
  }

  function render() {
    const setup = getSetup();
    if (!setup?.pokemon) return;
    if (document.activeElement !== elements.pokemonSearch) elements.pokemonSearch.value = localizedName(setup.pokemon);
    elements.nature.value = setup.nature;
    elements.ability.value = setup.ability?.id ?? "";
    elements.item.value = setup.item?.id ?? "";
    elements.status.value = setup.soaked ? "soak" : setup.status ?? "";
    if (spriteId !== setup.pokemon.id) {
      spriteId = setup.pokemon.id;
      elements.sprite.replaceChildren(...pokemonSpriteElements(setup.pokemon, { size: 56 }));
    }
    renderStats(setup);
    renderBudget(setup);
  }

  function renderStats(setup, { force = false } = {}) {
    const stats = setFinalStats(setup);
    const rows = ensureRenderedRows(elements.stats, ".set-editor-stat-row", () => STAT_KEYS.map(statRow), getLocale());
    for (const [index, stat] of STAT_KEYS.entries()) {
      const row = rows[index];
      row.querySelector(".set-editor-stat-base").textContent = String(setup.pokemon.baseStats[stat]);
      const input = row.querySelector('input[data-kind="sp"]');
      if (force || document.activeElement !== input) input.value = String(setup.sp?.[stat] ?? 0);
      const stage = row.querySelector('select[data-kind="stage"]');
      if (stage) stage.value = String(setup.stages?.[stat] ?? 0);
      row.querySelector(".set-editor-stat-final").textContent = String(stats[stat]);
    }
  }

  function renderBudget(setup) {
    const spent = spSpent(setup.sp);
    const over = spent > SET_SP_LIMIT;
    elements.spTotal.textContent = over
      ? t("matchups.spOver", { count: spent, limit: SET_SP_LIMIT, over: spent - SET_SP_LIMIT })
      : t("matchups.spTotal", { count: spent, limit: SET_SP_LIMIT });
    elements.spTotal.classList.toggle("over", over);
    for (const input of elements.stats.querySelectorAll('input[data-kind="sp"]')) {
      input.setAttribute("aria-invalid", String(over));
    }
    elements.spMeterFill.style.width = `${Math.min(1, spent / SET_SP_LIMIT) * 100}%`;
    elements.spMeterFill.parentElement.classList.toggle("over", over);
  }

  function statRow(stat) {
    const statName = localizedTerm("stat", STAT_LABELS[stat]);
    const row = document.createElement("div");
    row.className = "set-editor-stat-row";
    const label = document.createElement("span");
    label.className = "set-editor-stat-label";
    label.textContent = statName;
    const base = document.createElement("span");
    base.className = "set-editor-stat-base";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "32";
    input.step = "1";
    input.inputMode = "numeric";
    input.dataset.kind = "sp";
    input.dataset.stat = stat;
    input.setAttribute("aria-label", `${statName} SP`);
    input.setAttribute("aria-describedby", id("sp-total"));
    const stage = document.createElement("span");
    stage.className = "set-editor-stat-stage";
    if (stat === "hp") {
      stage.textContent = "—";
      stage.setAttribute("aria-hidden", "true");
    } else {
      const select = document.createElement("select");
      select.dataset.kind = "stage";
      select.dataset.stat = stat;
      select.setAttribute("aria-label", `${statName} ${getLocale() === "zh-TW" ? "階級" : "stage"}`);
      select.replaceChildren(...Array.from({ length: 13 }, (_, index) => {
        const value = index - 6;
        return optionElement(value, value > 0 ? `+${value}` : String(value));
      }));
      stage.append(select);
    }
    const final = document.createElement("strong");
    final.className = "set-editor-stat-final";
    row.append(label, base, input, stage, final);
    return row;
  }

  function renderMoves() {
    for (const cleanup of moveCleanups) cleanup();
    moveCleanups = [];
    const setup = getSetup();
    const catalogs = getCatalogs();
    if (!setup?.pokemon || !catalogs) {
      elements.movePicks.replaceChildren();
      return;
    }
    const moves = setEditorMoves(setup.pokemon, catalogs.moveLookup);
    elements.movePicks.replaceChildren(...MOVE_SLOTS.map((index) => {
      const row = document.createElement("div");
      row.className = "set-editor-move-row";
      const selectedId = setup.selectedMoveIds?.[index] ?? "";
      const selected = moves.find((move) => normalizeId(move.id) === normalizeId(selectedId));
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      renderMoveTypeIcon(icon, selected);
      const combobox = moveSlotCombobox({
        index,
        moves,
        selectedMove: selected,
        resultLimit: MOVE_RESULT_LIMIT,
        onSelect: (move, input) => {
          input.value = localizedName(move);
          edit({ kind: "move", index, value: move.id }, { moves: true });
        },
      });
      moveCleanups.push(combobox.destroy);
      const crit = critToggleButton({
        index,
        selectedMove: selected,
        pokemon: setup.pokemon,
        state: setup,
        manual: setup.critMoves?.[index],
        onToggle: (pressed) => edit({ kind: "crit", index, value: pressed }),
      });
      // Status moves deal no damage, so a crit means nothing for them.
      if (selected?.category === "Status") {
        crit.disabled = true;
        crit.setAttribute("aria-pressed", "false");
      }
      row.append(icon, combobox.element, crit);
      const descriptors = selected ? moveConditionDescriptors(selected, setup) : [];
      if (descriptors.length > 0) {
        const conditions = document.createElement("div");
        conditions.className = "set-editor-move-conditions";
        conditions.append(...descriptors.map((descriptor) => moveConditionSelect(descriptor, {
          index,
          value: moveConditionValue(setup, index, descriptor),
          onInput: (event) => edit({ kind: "moveOption", index, key: descriptor.key, value: event.target.value }),
        })));
        row.append(conditions);
      }
      return row;
    }));
  }

  return { elements, renderOptions, render, renderMoves };
}

// A round type mark in front of each move slot (the move's base type); dashed when empty.
function renderMoveTypeIcon(icon, move) {
  icon.className = `set-editor-move-type type-badge ${move?.type ? typeClassName(move.type) : "empty"}`;
  const path = move?.type ? typeIconPath(move.type) : "";
  if (!path) {
    icon.replaceChildren();
    return;
  }
  const image = document.createElement("img");
  image.src = path;
  image.width = 16;
  image.height = 16;
  image.alt = "";
  icon.replaceChildren(image);
}

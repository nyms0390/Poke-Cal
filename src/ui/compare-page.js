// Compare sets: variants of one Pokémon's set raced against the same common opponents.
// The page shows a strip of variant cards (the pinned card is the baseline and mirrors the
// shared active set), the selected variant's moves against the baseline, the outcome counts
// against the baseline, and the opponents whose outcome changes. The full set editor opens in
// a dialog (bottom sheet on phones), like Battle's editors. State and diffs live in
// src/data/set-comparison.js.
import { normalizeId } from "../data/catalog.js";
import { activeSetFromState, applyActiveSet, createActiveSetStore, planActiveSetRefresh } from "../data/active-set.js";
import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import {
  analyzeMatchups, matchupSetFromSide, normalizeOpponentCount, normalizeSpeedMode, rankedOpponents,
} from "../data/matchup-analysis.js";
import { trickRoomTeamShares } from "../data/matchups.js";
import {
  MAX_VARIANTS, VARIANT_NAME_LIMIT, addVariant, analysisKey, canAddVariant, changeTally, comparisonRows,
  createComparison, createComparisonStore, deltaTone, findVariant, hydrateSide, pinVariant, removeVariant,
  renameVariant, replaceVariantSide, selectVariant, setChanges,
} from "../data/set-comparison.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { initI18n, localizedName, localizedTerm, onLocaleChange, t } from "../i18n.js";
import { watchActiveSet } from "./active-set-sync.js";
import { applyControl, createSideState } from "./battle-state.js";
import { loadCatalogs } from "./bootstrap.js";
import { browserStorage, itemLabel, natureLabel, pokemonSpriteElements, typeBadge } from "./components.js";
import { ambientFieldLabels, mountAmbientFieldControls } from "./field-controls.js";
import { applyAmbientFieldControl, createAmbientFieldState } from "./field-state.js";
import { moveOptionsForSlot } from "./move-conditions.js";
import { mountSetEditor, statusOptions } from "./set-editor.js";
import { mountSetSheet } from "./set-sheet.js";

const SP_ANALYSIS_DELAY_MS = 150;
// Card and summary order: what you beat first, then what beats you.
const COUNT_ORDER = ["win", "speed", "loss", "stalemate"];
const COUNT_KEYS = { win: "matchups.favorable", speed: "matchups.speedRaces", loss: "matchups.threats", stalemate: "matchups.stalemate" };
const STAT_KEYS = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
const SPEED_MODE_KEYS = { auto: "matchups.speedAuto", normal: "matchups.speedNormal", trickRoom: "matchups.speedTrickRoom" };
const PIN_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 3h6l-1 6 3.5 3.5V15h-11v-2.5L10 9 9 3Z" stroke-linejoin="round"/><path d="M12 15v6" stroke-linecap="round"/></svg>';

const elements = {
  status: document.querySelector("#status"),
  notice: document.querySelector("#compare-notice"),
  count: document.querySelector("#compare-opponent-count"),
  speed: document.querySelector("#compare-speed-mode"),
  environmentSummary: document.querySelector("#compare-environment-summary"),
  ambient: document.querySelector("#compare-ambient-field"),
  variants: document.querySelector("#compare-variant-list"),
  selected: document.querySelector("#compare-selected"),
  summaryTitle: document.querySelector("#compare-summary-title"),
  summaryCounts: document.querySelector("#compare-summary-counts"),
  summaryHint: document.querySelector("#compare-summary-hint"),
  matrixTitle: document.querySelector("#compare-matrix-title"),
  filter: document.querySelector("#compare-filter"),
  rowCount: document.querySelector("#compare-row-count"),
  head: document.querySelector("#compare-matrix-head"),
  body: document.querySelector("#compare-matrix-body"),
  source: document.querySelector("#compare-source"),
  editor: document.querySelector("#compare-editor"),
  editing: document.querySelector("#compare-editing-label"),
  editHint: document.querySelector("#compare-edit-hint"),
};

const activeStore = createActiveSetStore(browserStorage());
const comparisonStore = createComparisonStore(browserStorage());
const createId = () => globalThis.crypto?.randomUUID?.() ?? `v${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

let catalogs = null;
let trickRoomShares = null;
let comparison = null;
let settings = { opponentCount: 50, speedMode: "auto", field: createAmbientFieldState() };
let filter = "changed";
let renaming = false;
// Saved abilities or items the catalog no longer has: [{ variant, field }].
let missingNotes = [];
// Each variant's last analysis, reused until its set or a shared setting changes.
const analysisCache = new Map();
let latest = null;
let analysisTimer = null;

const selected = () => findVariant(comparison, comparison?.selectedId);
const pinned = () => findVariant(comparison, comparison?.pinnedId);
const titleOf = (variant) => (variant ? t("compare.variantTitle", { label: variant.label, name: variant.name }) : "—");
const createSide = (pokemon) => createSideState(pokemon, championsDefaultsForPokemon(pokemon, {
  abilityLookup: catalogs.abilityLookup,
  moveLookup: catalogs.moveLookup,
  items: catalogs.items,
}));

const setEditor = mountSetEditor(document.querySelector("#compare-set-editor"), {
  prefix: "compare",
  getCatalogs: () => catalogs,
  getSetup: () => selected()?.side,
  onPokemonSelect: changeBaselinePokemon,
  onControl: (control) => editSelected(applyControl(selected().side, control), { analysis: control.kind === "sp" ? "later" : "now" }),
});
const editorSheet = mountSetSheet({
  editor: elements.editor,
  id: "compare-set-sheet",
  titleKey: "compare.editorTitle",
  doneKey: "compare.editorDone",
  media: "(min-width: 0px)",
});
editorSheet.element.classList.add("editor-dialog");
const fieldControls = mountAmbientFieldControls(elements.ambient, {
  namePrefix: "compare",
  onChange: (control) => {
    settings = { ...settings, field: applyAmbientFieldControl(settings.field, control) };
    renderControls();
    update();
  },
});

initI18n();
elements.count.addEventListener("change", (event) => {
  settings = { ...settings, opponentCount: normalizeOpponentCount(event.target.value) };
  update();
});
elements.speed.addEventListener("change", (event) => {
  settings = { ...settings, speedMode: normalizeSpeedMode(event.target.value) };
  update();
});
elements.filter.addEventListener("change", (event) => {
  filter = event.target.value === "all" ? "all" : "changed";
  renderMatrix();
});
onLocaleChange(() => {
  if (!comparison) return;
  setEditor.renderOptions();
  fieldControls.sync(settings.field);
  render();
});
initialize();

// ---------- Loading and state changes ----------

async function initialize() {
  catalogs = await loadCatalogs({ onStatus: (message) => { elements.status.textContent = message; } });
  if (!catalogs) return;
  const stored = activeStore.readSet();
  const storedPokemon = stored && findPokemon(stored.pokemonId);
  if (storedPokemon) {
    openComparison(storedPokemon, stored);
  } else {
    const pokemon = rankedOpponents(catalogs.pokemon, 1)[0]?.pokemon ?? catalogs.pokemon[0];
    if (!pokemon) return;
    openComparison(pokemon, null);
    activeStore.writeSet(activeSetFromState(pinned().side));
  }
  setEditor.renderOptions();
  fieldControls.sync(settings.field);
  render();
  watchActiveSet(refreshFromActiveSet);
  try {
    trickRoomShares = trickRoomTeamShares(await loadLimitlessTeamArchive());
  } catch (error) {
    console.error("PokéCal team archive load failed; Auto uses normal move order.", error);
  }
  update();
}

function findPokemon(id) {
  const key = normalizeId(id);
  return catalogs.pokemonLookup?.get(key) ?? catalogs.pokemon.find((entry) => normalizeId(entry.id) === key) ?? null;
}

/**
 * Shows the comparison for `pokemon`: the stored one if there is one, otherwise a new A/B pair.
 * `activeSet` (the shared set, when it names this Pokémon) is applied to the baseline, so a set
 * edited on another page arrives here as the baseline.
 */
function openComparison(pokemon, activeSet) {
  const saved = comparisonStore.read(pokemon.id);
  missingNotes = [];
  let next = null;
  if (saved) {
    const variants = [];
    for (const variant of saved.variants) {
      const hydrated = hydrateSide(variant.side, catalogs, createSide);
      if (!hydrated) continue;
      const restored = { ...variant, side: hydrated.side };
      variants.push(restored);
      for (const field of hydrated.missing) missingNotes.push({ variant: restored, field });
    }
    if (variants.some(({ id }) => id === saved.pinnedId)) next = { ...saved, variants };
  }
  if (!next) next = createComparison(createSide(pokemon), { createId });
  if (activeSet && normalizeId(activeSet.pokemonId) === normalizeId(pokemon.id)) {
    const baseline = findVariant(next, next.pinnedId);
    next = replaceVariantSide(next, baseline.id, applyActiveSet(baseline.side, activeSet, catalogs));
  }
  comparison = next;
  renaming = false;
  persist();
}

// Another page (or tab) changed the shared set: update the baseline, or switch to the
// comparison for the new Pokémon. Variants never change species underneath the user.
function refreshFromActiveSet() {
  if (!catalogs || !comparison) return;
  const stored = activeStore.readSet();
  const plan = planActiveSetRefresh(stored, activeSetFromState(pinned().side));
  if (plan === "none") return;
  if (plan === "apply") {
    comparison = replaceVariantSide(comparison, comparison.pinnedId, applyActiveSet(pinned().side, stored, catalogs));
    persist();
  } else {
    const pokemon = findPokemon(stored.pokemonId);
    if (!pokemon) return;
    openComparison(pokemon, stored);
  }
  setEditor.renderOptions();
  render();
}

function persist() {
  comparisonStore.write(comparison);
}

function editSelected(side, { analysis = "now" } = {}) {
  const variant = selected();
  if (!variant) return;
  comparison = replaceVariantSide(comparison, variant.id, side);
  if (variant.id === comparison.pinnedId) activeStore.writeSet(activeSetFromState(side));
  persist();
  render({ analysis });
}

// Only the baseline picks the Pokémon (the editor disables the search for other variants).
// The new Pokémon opens its own comparison (restored if it has one), whose baseline becomes the
// shared set.
function changeBaselinePokemon(pokemon) {
  if (selected()?.id !== comparison.pinnedId) return;
  openComparison(pokemon, null);
  comparison = selectVariant(comparison, comparison.pinnedId);
  activeStore.writeSet(activeSetFromState(pinned().side));
  persist();
  setEditor.renderOptions();
  render();
}

function choose(id) {
  if (id === comparison.selectedId) return;
  comparison = selectVariant(comparison, id);
  renaming = false;
  persist();
  setEditor.renderOptions();
  render({ analysis: "none" });
  focusCard(id, ".compare-variant-main");
}

function pin(id) {
  if (id === comparison.pinnedId) return;
  comparison = pinVariant(comparison, id);
  activeStore.writeSet(activeSetFromState(pinned().side));
  persist();
  render({ analysis: "rows" });
  focusCard(id, ".compare-pin");
}

// Cards are redrawn on every change; keep keyboard focus on the control that was used.
function focusCard(id, selector) {
  if (!elements.variants.contains(document.activeElement) && document.activeElement !== document.body) return;
  elements.variants.querySelector(`[data-variant-id="${CSS.escape(id)}"] ${selector}`)?.focus();
}

function add() {
  if (!canAddVariant(comparison)) return;
  comparison = addVariant(comparison, { createId });
  renaming = false;
  persist();
  setEditor.renderOptions();
  render();
}

function remove(id) {
  const variant = findVariant(comparison, id);
  if (!variant || id === comparison.pinnedId) return;
  if (!globalThis.confirm(t("compare.confirmRemove", { title: titleOf(variant) }))) return;
  comparison = removeVariant(comparison, id);
  analysisCache.delete(id);
  renaming = false;
  persist();
  setEditor.renderOptions();
  render({ analysis: "rows" });
  elements.variants.querySelector(".compare-variant.is-selected .compare-variant-main")?.focus();
}

function rename(name) {
  comparison = renameVariant(comparison, comparison.selectedId, name);
  renaming = false;
  persist();
  render({ analysis: "none" });
  elements.selected.querySelector("[data-action='rename']")?.focus();
}

// ---------- Analysis ----------

/**
 * `analysis`: "now" re-races what changed, "later" debounces that (SP typing), "rows" only
 * re-aligns cached results (pin, remove), "none" skips it (selection, rename).
 */
function render({ analysis = "now" } = {}) {
  if (!comparison) return;
  renderControls();
  renderEditor();
  renderSelected();
  if (analysis === "now") update();
  else if (analysis === "later") scheduleUpdate();
  else if (analysis === "rows") realign();
  else renderResults();
}

function scheduleUpdate() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(update, SP_ANALYSIS_DELAY_MS);
  renderVariants();
}

function update() {
  clearTimeout(analysisTimer);
  analysisTimer = null;
  if (!catalogs || !comparison) return;
  const opponents = rankedOpponents(catalogs.pokemon, settings.opponentCount);
  const shared = { ...settings, trickRoom: Boolean(trickRoomShares) };
  for (const variant of comparison.variants) {
    const key = analysisKey(variant.side, shared);
    if (analysisCache.get(variant.id)?.key === key) continue;
    const ours = matchupSetFromSide(variant.side, catalogs.moveLookup, {
      moveOptions: (index, move) => moveOptionsForSlot(variant.side, index, move),
    });
    const result = analyzeMatchups({
      ours, opponents, lookups: catalogs, field: settings.field, speedMode: settings.speedMode, trickRoomShares,
    });
    analysisCache.set(variant.id, { key, result, selected: opponents.length });
  }
  realign();
}

function realign() {
  const analyses = comparison.variants
    .map((variant) => ({ id: variant.id, cached: analysisCache.get(variant.id) }))
    .filter(({ cached }) => cached)
    .map(({ id, cached }) => ({ id, rows: cached.result.rows, skipped: cached.result.skipped, selected: cached.selected }));
  if (analyses.length !== comparison.variants.length) return;
  const base = analyses.find(({ id }) => id === comparison.pinnedId);
  latest = { ...comparisonRows(analyses, comparison.pinnedId), selected: base.selected, skipped: base.skipped.length };
  renderResults();
}

function renderResults() {
  renderVariants();
  renderSummary();
  renderMatrix();
}

// ---------- Rendering ----------

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function button(text, className, action) {
  const node = element("button", className, text);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function sprite(pokemon, size, className) {
  const wrap = element("span", className);
  wrap.setAttribute("aria-hidden", "true");
  wrap.append(...pokemonSpriteElements(pokemon, { size }));
  return wrap;
}

function signed(value) {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "±0";
}

function renderControls() {
  elements.count.value = String(settings.opponentCount);
  elements.speed.value = settings.speedMode;
  for (const option of elements.count.options) option.textContent = t("matchups.topCount", { count: option.value });
  for (const option of elements.speed.options) option.textContent = t(SPEED_MODE_KEYS[option.value]);
  elements.environmentSummary.textContent = ambientFieldLabels(settings.field).join(" · ");
  elements.filter.value = filter;
  elements.notice.hidden = missingNotes.length === 0;
  elements.notice.textContent = missingNotes.length ? t("compare.missing", {
    list: missingNotes.map(({ variant, field }) => t("compare.missingEntry", { title: titleOf(variant), field: t(`compare.field.${field}`) })).join(", "),
  }) : "";
}

function renderEditor() {
  const variant = selected();
  const isBaseline = variant.id === comparison.pinnedId;
  elements.editing.textContent = t("compare.editing", { title: titleOf(variant) });
  elements.editHint.textContent = isBaseline
    ? t("compare.editHintBaseline")
    : t("compare.editHintVariant", { title: titleOf(variant) });
  setEditor.elements.pokemonSearch.disabled = !isBaseline;
  setEditor.render();
}

function countsFor(id) {
  return latest?.variants.find((entry) => entry.id === id) ?? null;
}

function variantSubtitle(variant, base) {
  if (variant.id === comparison.pinnedId) {
    return [localizedTerm("nature", variant.side.nature), variant.side.item ? localizedName(variant.side.item) : ""]
      .filter(Boolean).join(" · ");
  }
  const { moves, parts } = changeTally(setChanges(base.side, variant.side));
  const list = [
    moves ? t("compare.movesChanged", { count: moves }) : "",
    ...parts.map((part) => t(`compare.part.${part}`)),
  ].filter(Boolean);
  return list.length ? t("compare.changed", { list: list.join(" + ") }) : t("compare.sameAsBaseline");
}

function renderVariants() {
  const base = pinned();
  const cards = comparison.variants.map((variant) => {
    const isPinned = variant.id === base.id;
    const isSelected = variant.id === comparison.selectedId;
    const card = element("article", ["compare-variant", isPinned && "is-pinned", isSelected && "is-selected"].filter(Boolean).join(" "));
    card.dataset.variantId = variant.id;
    const main = button("", "compare-variant-main", () => choose(variant.id));
    main.setAttribute("aria-pressed", String(isSelected));
    main.setAttribute("aria-label", [t("compare.select", { title: titleOf(variant) }), localizedName(variant.side.pokemon), variantSubtitle(variant, base)].join(", "));
    const identity = element("span", "compare-variant-identity");
    const text = element("span", "compare-variant-text");
    text.append(element("strong", "", localizedName(variant.side.pokemon)), element("small", "", variantSubtitle(variant, base)));
    identity.append(sprite(variant.side.pokemon, 48, "compare-variant-sprite"), text);
    main.append(element("span", "compare-variant-title", titleOf(variant)), identity, variantFooter(variant, isPinned, base));

    const pinButton = button("", "compare-pin", () => pin(variant.id));
    pinButton.innerHTML = PIN_ICON;
    pinButton.setAttribute("aria-pressed", String(isPinned));
    pinButton.setAttribute("aria-label", isPinned ? t("compare.pinned", { title: titleOf(variant) }) : t("compare.pin", { title: titleOf(variant) }));
    pinButton.title = pinButton.getAttribute("aria-label");
    card.append(main, pinButton);
    return card;
  });

  const addButton = button("", "compare-add", add);
  const full = !canAddVariant(comparison);
  addButton.disabled = full;
  addButton.append(
    element("span", "compare-add-label", `+ ${t("compare.add")}`),
    element("small", "", full ? t("compare.addLimit", { count: MAX_VARIANTS }) : t("compare.addFrom", { title: titleOf(selected()) })),
  );
  elements.variants.replaceChildren(...cards, addButton);
}

function variantFooter(variant, isPinned, base) {
  const footer = element("span", "compare-variant-counts");
  const counts = countsFor(variant.id);
  for (const outcome of ["win", "loss"]) {
    const stat = element("span", `compare-variant-count ${outcome}`);
    stat.append(element("span", "", t(COUNT_KEYS[outcome])), element("strong", "", counts ? String(counts.counts[outcome]) : "—"));
    if (!isPinned && counts) {
      const delta = counts.delta[outcome];
      const change = element("span", `compare-delta ${deltaTone(outcome, delta)}`, signed(delta));
      change.append(element("span", "visually-hidden", ` ${t("compare.vs", { label: base.label })}`));
      stat.append(change);
    }
    footer.append(stat);
  }
  return footer;
}

function renderSelected() {
  const variant = selected();
  const base = pinned();
  const isBaseline = variant.id === base.id;
  const head = element("div", "compare-card-head");
  if (renaming) {
    head.append(renameForm(variant));
  } else {
    const title = element("h2", "compare-card-title", titleOf(variant));
    title.id = "compare-selected-title";
    const actions = element("div", "compare-actions");
    const renameButton = button(t("compare.rename"), "compare-action", () => {
      renaming = true;
      renderSelected();
      elements.selected.querySelector(".compare-rename input")?.focus();
    });
    renameButton.dataset.action = "rename";
    actions.append(renameButton);
    if (!isBaseline) actions.append(button(t("compare.remove"), "compare-action", () => remove(variant.id)));
    const edit = button(t("compare.edit"), "compare-action primary", () => editorSheet.open());
    edit.setAttribute("aria-haspopup", "dialog");
    edit.setAttribute("aria-controls", editorSheet.element.id);
    actions.append(edit);
    head.append(title, actions);
  }

  const identity = element("div", "compare-selected-identity");
  const text = element("div", "compare-selected-text");
  const chips = element("div", "compare-chips");
  for (const value of [
    variant.side.nature ? natureLabel(variant.side.nature) : "",
    variant.side.ability ? localizedName(variant.side.ability) : "",
    variant.side.item ? itemLabel(variant.side.item) : "",
  ].filter(Boolean)) {
    const chip = element("span", "compare-chip");
    chip.append(value);
    chips.append(chip);
  }
  text.append(element("strong", "", localizedName(variant.side.pokemon)), chips);
  identity.append(sprite(variant.side.pokemon, 64, "compare-selected-sprite"), text);

  const changes = isBaseline ? [] : setChanges(base.side, variant.side);
  const moves = element("ol", "compare-moves");
  moves.setAttribute("aria-label", t("compare.moves"));
  for (const slot of [0, 1, 2, 3]) {
    const moveId = variant.side.selectedMoveIds[slot];
    const move = moveId ? catalogs.moveLookup.get(moveId) : null;
    const swap = changes.find((change) => change.kind === "move" && change.slot === slot);
    const item = element("li", `compare-move${swap ? " is-changed" : ""}`);
    const name = moveName(moveId);
    item.append(element("strong", "", swap ? t("compare.moveSwap", { from: moveName(swap.from), to: name }) : name));
    const meta = element("span", "compare-move-meta");
    if (move?.type) meta.append(typeBadge(move.type));
    if (!isBaseline && !swap) meta.append(element("small", "", t("compare.unchanged")));
    item.append(meta);
    moves.append(item);
  }

  const body = element("div", "compare-selected-body");
  body.append(identity, moves);
  const nodes = [head, body];
  const other = changes.filter((change) => change.kind !== "move").map(describeChange);
  if (isBaseline) nodes.push(element("p", "compare-meta", t("compare.baselineNote")));
  else if (other.length) nodes.push(element("p", "compare-other-changes", t("compare.alsoChanged", { list: other.join(" · ") })));
  elements.selected.replaceChildren(...nodes);
  elements.selected.setAttribute("aria-labelledby", renaming ? "compare-rename-input" : "compare-selected-title");
}

function renameForm(variant) {
  const form = element("form", "compare-rename");
  const label = element("label", "compare-rename-label");
  label.htmlFor = "compare-rename-input";
  label.textContent = `${t("compare.nameLabel")} · ${variant.label}`;
  const input = element("input");
  input.id = "compare-rename-input";
  input.type = "text";
  input.maxLength = VARIANT_NAME_LIMIT;
  input.value = variant.name;
  input.placeholder = t("compare.namePlaceholder");
  input.autocomplete = "off";
  const save = element("button", "compare-action primary", t("compare.save"));
  save.type = "submit";
  const cancel = button(t("compare.cancel"), "compare-action", () => {
    renaming = false;
    renderSelected();
    elements.selected.querySelector("[data-action='rename']")?.focus();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel.click();
    }
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    rename(input.value);
  });
  const actions = element("div", "compare-actions");
  actions.append(cancel, save);
  form.append(label, input, actions);
  return form;
}

function moveName(id) {
  if (!id) return t("compare.noMove");
  const move = catalogs.moveLookup.get(id);
  return move ? localizedName(move) : id;
}

function describeChange(change) {
  const named = (lookup, id) => (id ? (lookup.get(id) ? localizedName(lookup.get(id)) : id) : t("compare.none"));
  const status = (value) => statusOptions().find((option) => option.value === value)?.label ?? value;
  const stat = (key) => localizedTerm("stat", STAT_KEYS[key]);
  switch (change.kind) {
    case "nature":
      return t("compare.change", { label: t("compare.field.nature"), from: localizedTerm("nature", change.from), to: localizedTerm("nature", change.to) });
    case "ability":
      return t("compare.change", { label: t("compare.field.ability"), from: named(catalogs.abilityLookup, change.from), to: named(catalogs.abilityLookup, change.to) });
    case "item":
      return t("compare.change", { label: t("compare.field.item"), from: named(catalogs.itemLookup, change.from), to: named(catalogs.itemLookup, change.to) });
    case "status":
      return t("compare.change", { label: t("compare.field.status"), from: status(change.from), to: status(change.to) });
    case "soaked":
      return t(change.to ? "compare.soakedOn" : "compare.soakedOff");
    case "sp":
      return t("compare.change", { label: t("compare.spLabel", { stat: stat(change.stat) }), from: change.from, to: change.to });
    case "stage":
      return t("compare.change", { label: t("compare.stageLabel", { stat: stat(change.stat) }), from: signed(change.from), to: signed(change.to) });
    case "crit":
      return t(change.to ? "compare.critOn" : "compare.critOff", { slot: change.slot + 1 });
    case "conditions":
      return t("compare.conditions", { slot: change.slot + 1 });
    default:
      return "";
  }
}

function renderSummary() {
  const variant = selected();
  const base = pinned();
  const isBaseline = variant.id === base.id;
  elements.summaryTitle.textContent = isBaseline
    ? t("compare.baselineCounts", { title: titleOf(base) })
    : t("compare.comparedWith", { title: titleOf(base) });
  elements.summaryHint.hidden = !isBaseline || comparison.variants.length < 2;
  const ours = countsFor(variant.id);
  const theirs = countsFor(base.id);
  elements.summaryCounts.replaceChildren(...COUNT_ORDER.map((outcome) => {
    const cell = element("div", `compare-summary-count ${outcome}`);
    cell.append(element("span", "compare-summary-label", t(COUNT_KEYS[outcome])));
    const value = element("span", "compare-summary-value");
    if (!ours || !theirs) {
      value.textContent = "—";
    } else if (isBaseline) {
      value.append(element("strong", "", String(ours.counts[outcome])));
    } else {
      const delta = ours.delta[outcome];
      value.append(
        element("span", "compare-summary-from", String(theirs.counts[outcome])),
        element("span", "compare-summary-arrow", " → "),
        element("strong", "", String(ours.counts[outcome])),
        element("span", `compare-delta ${deltaTone(outcome, delta)}`, ` (${signed(delta)})`),
      );
    }
    cell.append(value);
    return cell;
  }));
}

function renderMatrix() {
  if (!latest) return;
  const base = pinned();
  const selectedId = comparison.selectedId;
  const columnClass = (id) => [id === selectedId && "is-selected", id === base.id && "is-baseline"].filter(Boolean).join(" ");
  elements.matrixTitle.textContent = t(filter === "all" ? "compare.allMatchups" : "compare.changedMatchups");

  const header = element("tr");
  const opponentHeader = element("th", "compare-opponent-head", t("matchups.opponent"));
  opponentHeader.scope = "col";
  header.append(opponentHeader);
  for (const variant of comparison.variants) {
    const th = element("th", columnClass(variant.id), titleOf(variant));
    th.scope = "col";
    if (variant.id === base.id) {
      const icon = element("span", "compare-head-pin");
      icon.innerHTML = PIN_ICON;
      th.prepend(icon);
      th.append(element("span", "visually-hidden", ` (${t("compare.baselineColumn")})`));
    }
    header.append(th);
  }
  elements.head.replaceChildren(header);

  // "Changed" follows the selected variant (the counts above compare it with the baseline);
  // with the baseline selected, any variant's change counts.
  const isBaselineSelected = selectedId === base.id;
  const changed = (row) => (isBaselineSelected ? row.changed : row.shifts[selectedId] !== "same");
  const changedCount = latest.rows.filter(changed).length;
  const rows = filter === "all" ? latest.rows : latest.rows.filter(changed);
  // Phones show only the baseline and selected columns unless the baseline is selected.
  elements.head.closest("table").classList.toggle("shows-all", isBaselineSelected);
  elements.rowCount.textContent = filter === "all"
    ? t("compare.showingAll", { total: latest.rows.length })
    : t("compare.showingChanged", { shown: changedCount, total: latest.rows.length });
  elements.source.textContent = t("compare.source", {
    selected: latest.selected, analyzed: latest.rows.length, skipped: latest.skipped,
  });

  elements.body.replaceChildren(...rows.map((row) => {
    const shift = row.shifts[selectedId];
    const tr = element("tr", shift === "worse" ? "is-worse" : shift === "better" ? "is-better" : "");
    const th = element("th", "compare-opponent");
    th.scope = "row";
    const name = element("span", "compare-opponent-name");
    const types = element("span", "compare-opponent-types");
    types.append(...(row.opponent.pokemon.types ?? []).map((type) => typeBadge(type)));
    name.append(element("strong", "", localizedName(row.opponent.pokemon)), types);
    const inner = element("div", "compare-opponent-inner");
    inner.append(sprite(row.opponent.pokemon, 40, "compare-opponent-sprite"), name);
    th.append(inner);
    tr.append(th);
    for (const variant of comparison.variants) tr.append(matrixCell(row, variant, base, columnClass(variant.id)));
    return tr;
  }));
  if (!rows.length) {
    const tr = element("tr");
    const td = element("td", "compare-empty", isBaselineSelected
      ? t("compare.noChangedAny", { base: titleOf(base) })
      : t("compare.noChanged", { title: titleOf(selected()), base: titleOf(base) }));
    td.colSpan = comparison.variants.length + 1;
    tr.append(td);
    elements.body.append(tr);
  }
}

function matrixCell(row, variant, base, className) {
  const td = element("td", ["compare-cell", className].filter(Boolean).join(" "));
  const cell = row.cells[variant.id];
  if (!cell) {
    td.textContent = "—";
    return td;
  }
  const { outcome } = cell.result;
  const top = element("span", "compare-cell-top");
  top.append(element("span", `compare-outcome ${outcome}`, outcomeLabel(cell)));
  const shift = row.shifts[variant.id];
  if (shift && shift !== "same") {
    const mark = element("span", `compare-shift ${shift}`, shift === "better" ? "▲" : shift === "worse" ? "▼" : "•");
    mark.setAttribute("aria-hidden", "true");
    top.append(mark, element("span", "visually-hidden", t(`compare.shift.${shift}`, { title: titleOf(base) })));
  }
  const ours = Number.isFinite(cell.result.ourHits) ? cell.result.ourHits : "—";
  const theirs = Number.isFinite(cell.result.theirHits) ? cell.result.theirHits : "—";
  const turns = element("small", "compare-turns");
  const visible = element("span", "", t("compare.turns", { ours, theirs }));
  visible.setAttribute("aria-hidden", "true");
  turns.append(visible, element("span", "visually-hidden", t("compare.turnsLabel", { ours, theirs })));
  td.append(top, turns);
  return td;
}

function outcomeLabel(row) {
  const { outcome } = row.result;
  if (outcome === "win") return t("matchups.youWin");
  if (outcome === "loss") return t("matchups.beatsYou");
  if (outcome === "stalemate") return t("matchups.noKoEither");
  const { first, ourWinChance } = row.speed ?? {};
  if (first === "split") return t("matchups.firstSplit", { share: `${Math.round((Number(ourWinChance) || 0) * 100)}%` });
  return t(first === "ours" ? "matchups.youFirst" : first === "theirs" ? "matchups.theyFirst" : "matchups.speedTie");
}

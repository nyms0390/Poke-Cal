import { normalizeId } from "../data/catalog.js";
import { activeSetFromState, applyActiveSet, createActiveSetStore, planActiveSetRefresh } from "../data/active-set.js";
import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import { analyzeMatchups, matchupSetFromSide, normalizeOpponentCount, normalizeSpeedMode, rankedOpponents } from "../data/matchup-analysis.js";
import { trickRoomTeamShares } from "../data/matchups.js";
import { changedFields, comparisonRows, createComparisonStore, hydrateSide, pinVariant, removeVariant } from "../data/set-comparison.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { initI18n, localizedName, onLocaleChange, t } from "../i18n.js";
import { applyControl, createSideState } from "./battle-state.js";
import { loadCatalogs } from "./bootstrap.js";
import { watchActiveSet } from "./active-set-sync.js";
import { browserStorage } from "./components.js";
import { mountAmbientFieldControls } from "./field-controls.js";
import { applyAmbientFieldControl, createAmbientFieldState } from "./field-state.js";
import { moveOptionsForSlot } from "./move-conditions.js";
import { mountSetEditor } from "./set-editor.js";
import { mountSetSheet } from "./set-sheet.js";

const elements = {
  status: document.querySelector("#status"),
  editor: document.querySelector("#compare-editor"),
  editing: document.querySelector("#compare-editing-label"),
  summary: document.querySelector("#compare-summary-card"),
  variants: document.querySelector("#compare-variant-list"),
  add: document.querySelector("#compare-add"),
  count: document.querySelector("#compare-opponent-count"),
  speed: document.querySelector("#compare-speed-mode"),
  ambient: document.querySelector("#compare-ambient-field"),
  source: document.querySelector("#compare-source"),
  changedOnly: document.querySelector("#compare-changed-only"),
  rowCount: document.querySelector("#compare-row-count"),
  head: document.querySelector("#compare-matrix-head"),
  body: document.querySelector("#compare-matrix-body"),
};
const activeStore = createActiveSetStore(browserStorage());
const comparisonStore = createComparisonStore(browserStorage());
const SP_ANALYSIS_DELAY_MS = 150;
let catalogs = null;
let trickRoomShares = null;
let analysisTimer = null;
let state = {
  variants: [], pinnedId: "", selectedId: "", opponentCount: 50,
  speedMode: "auto", field: createAmbientFieldState(),
};
let latest = null;

const selected = () => state.variants.find(({ id }) => id === state.selectedId);
const pinned = () => state.variants.find(({ id }) => id === state.pinnedId);
const createSide = (pokemon) => createSideState(pokemon, championsDefaultsForPokemon(pokemon, {
  abilityLookup: catalogs.abilityLookup,
  moveLookup: catalogs.moveLookup,
  items: catalogs.items,
}));
const setEditor = mountSetEditor(document.querySelector("#compare-set-editor"), {
  prefix: "compare", getCatalogs: () => catalogs, getSetup: () => selected()?.side,
  onPokemonSelect: (pokemon) => changeSide(createSide(pokemon)),
  onControl: (control) => changeSide(applyControl(selected().side, control), { immediate: control.kind !== "sp" }),
});
const sheet = mountSetSheet({
  editor: elements.editor, id: "compare-set-sheet", titleKey: "compare.editorLabel",
  doneKey: "sheet.viewMatchups", summaryHost: elements.summary, editKey: "sheet.editSet",
});
const fieldControls = mountAmbientFieldControls(elements.ambient, {
  namePrefix: "compare",
  onChange: (control) => {
    state.field = applyAmbientFieldControl(state.field, control);
    renderAnalysis();
  },
});

initI18n();
elements.add.addEventListener("click", duplicateSelected);
elements.count.addEventListener("change", (event) => { state.opponentCount = normalizeOpponentCount(event.target.value); renderAnalysis(); });
elements.speed.addEventListener("change", (event) => { state.speedMode = normalizeSpeedMode(event.target.value); renderAnalysis(); });
elements.changedOnly.addEventListener("change", renderMatrix);
onLocaleChange(() => {
  if (!catalogs) return;
  setEditor.renderOptions();
  fieldControls.sync(state.field);
  render();
});
initialize();

async function initialize() {
  catalogs = await loadCatalogs({ onStatus: (message) => { elements.status.textContent = message; } });
  if (!catalogs) return;
  const saved = comparisonStore.read();
  const variants = saved.variants
    .filter((variant) => typeof variant?.id === "string" && variant.id && variant.side?.pokemonId)
    .map((variant) => ({ ...variant, side: hydrateSide(variant.side, catalogs, createSide) }))
    .filter((variant) => variant.side);
  const stored = activeStore.readSet();
  const firstPokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === stored?.pokemonId) ??
    rankedOpponents(catalogs.pokemon, 1)[0]?.pokemon ?? catalogs.pokemon[0];
  if (!firstPokemon) return;
  if (variants.length) {
    state.variants = variants;
    state.pinnedId = variants.some(({ id }) => id === saved.pinnedId) ? saved.pinnedId : variants[0].id;
    state.selectedId = variants.some(({ id }) => id === saved.selectedId) ? saved.selectedId : state.pinnedId;
  } else {
    let side = createSide(firstPokemon);
    if (stored?.pokemonId === normalizeId(firstPokemon.id)) side = applyActiveSet(side, stored, catalogs);
    state.variants = [
      { id: "a", name: "A", side },
      { id: "b", name: "B", side: hydrateSide({ ...side, pokemonId: side.pokemon.id }, catalogs, createSide) },
    ];
    state.pinnedId = "a";
    state.selectedId = "b";
  }
  refreshFromActiveSet();
  if (!activeStore.readSet()) activeStore.writeSet(activeSetFromState(pinned().side));
  persist();
  setEditor.renderOptions();
  fieldControls.sync(state.field);
  render();
  watchActiveSet(refreshFromActiveSet);
  try {
    trickRoomShares = trickRoomTeamShares(await loadLimitlessTeamArchive());
  } catch (error) {
    console.error("PokéCal team archive load failed; Auto uses normal move order.", error);
  }
  renderAnalysis();
}

function refreshFromActiveSet() {
  if (!catalogs || !pinned()) return;
  const stored = activeStore.readSet();
  const plan = planActiveSetRefresh(stored, activeSetFromState(pinned().side));
  if (plan === "none") return;
  const pokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === stored.pokemonId);
  if (!pokemon) return;
  const next = plan === "seed" ? createSide(pokemon) : pinned().side;
  replaceVariant(state.pinnedId, applyActiveSet(next, stored, catalogs));
  persist();
  setEditor.renderOptions();
  render();
}

function replaceVariant(id, side) {
  state.variants = state.variants.map((variant) => variant.id === id ? { ...variant, side } : variant);
}

function changeSide(side, { immediate = true } = {}) {
  const id = state.selectedId;
  const pokemonChanged = selected().side.pokemon.id !== side.pokemon.id;
  replaceVariant(id, side);
  if (id === state.pinnedId) activeStore.writeSet(activeSetFromState(side));
  persist();
  if (pokemonChanged) setEditor.renderOptions();
  render({ immediate });
}

function persist() { comparisonStore.write(state); }

function duplicateSelected() {
  const source = selected();
  if (!source) return;
  const id = globalThis.crypto?.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2)}`;
  const usedNames = new Set(state.variants.map((variant) => variant.name));
  const name = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
    .find((candidate) => !usedNames.has(candidate)) ?? t("compare.defaultName", { count: state.variants.length + 1 });
  const side = hydrateSide({ ...source.side, pokemonId: source.side.pokemon.id }, catalogs, createSide);
  state.variants = [...state.variants, { id, name, side }];
  state.selectedId = id;
  persist();
  setEditor.renderOptions();
  render();
}

function selectVariant(id) {
  if (!state.variants.some((variant) => variant.id === id)) return;
  state.selectedId = id;
  persist();
  setEditor.renderOptions();
  render();
  if (sheet.isSheet()) sheet.open();
}

function pin(id) {
  state = pinVariant(state, id);
  activeStore.writeSet(activeSetFromState(pinned().side));
  persist();
  setEditor.renderOptions();
  render();
}

function remove(id) {
  const variant = state.variants.find((entry) => entry.id === id);
  if (!variant || id === state.pinnedId || !globalThis.confirm(t("compare.confirmRemove", { name: variant.name }))) return;
  state = removeVariant(state, id);
  persist();
  setEditor.renderOptions();
  render();
}

function render({ immediate = true } = {}) {
  if (!selected()) return;
  elements.count.value = String(state.opponentCount);
  elements.speed.value = state.speedMode;
  elements.editing.textContent = t("compare.editing", { name: selected().name });
  setEditor.render();
  sheet.update({ pokemon: selected().side.pokemon, label: selected().name,
    meta: selected().id === state.pinnedId ? t("compare.pinned") : t("compare.variant") });
  if (immediate) renderAnalysis();
  else scheduleAnalysis();
}

function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(renderAnalysis, SP_ANALYSIS_DELAY_MS);
}

function renderAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = null;
  if (!catalogs || !pinned()) return;
  const opponents = rankedOpponents(catalogs.pokemon, state.opponentCount);
  const analyses = state.variants.map((variant) => {
    const ours = matchupSetFromSide(variant.side, catalogs.moveLookup, {
      moveOptions: (index, move) => moveOptionsForSlot(variant.side, index, move),
    });
    const result = analyzeMatchups({ ours, opponents, lookups: catalogs, field: state.field,
      speedMode: state.speedMode, trickRoomShares });
    return { id: variant.id, ...result };
  });
  latest = comparisonRows(analyses, state.pinnedId);
  const analyzed = latest.variants.find(({ id }) => id === state.pinnedId)?.count ?? 0;
  elements.source.textContent = t("compare.source", { selected: opponents.length, analyzed, skipped: opponents.length - analyzed });
  renderVariants();
  renderMatrix();
}

const outcomeKeys = { loss: "matchups.threats", speed: "matchups.speedRaces", win: "matchups.favorable", stalemate: "matchups.stalemate" };
function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}
function button(key, action, className = "") {
  const node = element("button", className, t(key));
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}
function renderVariants() {
  const base = pinned().side;
  elements.variants.replaceChildren(...state.variants.map((variant) => {
    const card = element("article", `compare-variant${variant.id === state.selectedId ? " selected" : ""}`);
    const top = element("div", "compare-variant-top");
    const name = element("input", "compare-name");
    name.type = "text";
    name.maxLength = 60;
    name.value = variant.name;
    name.setAttribute("aria-label", t("compare.nameLabel", { name: variant.name }));
    const previousName = variant.name;
    name.addEventListener("input", () => {
      variant.name = name.value;
      persist();
      if (variant.id === state.selectedId) {
        elements.editing.textContent = t("compare.editing", { name: variant.name });
        sheet.update({ pokemon: variant.side.pokemon, label: variant.name,
          meta: variant.id === state.pinnedId ? t("compare.pinned") : t("compare.variant") });
      }
      const column = state.variants.findIndex(({ id }) => id === variant.id) + 1;
      const heading = elements.head.querySelector(`th:nth-child(${column + 1})`);
      if (heading) heading.textContent = variant.name;
    });
    name.addEventListener("change", () => {
      variant.name = name.value.trim() || previousName;
      persist();
      render();
    });
    top.append(name, element("span", "compare-pin-label", variant.id === state.pinnedId ? t("compare.pinned") : ""));
    const pokemon = element("p", "compare-pokemon", localizedName(variant.side.pokemon));
    const delta = latest?.variants.find(({ id }) => id === variant.id);
    const stats = element("div", "compare-counts");
    for (const outcome of ["win", "loss", "speed", "stalemate"]) {
      const value = delta?.counts[outcome] ?? 0;
      const change = delta?.delta[outcome] ?? 0;
      const cell = element("span", `compare-count ${outcome}`);
      cell.append(element("small", "", t(outcomeKeys[outcome])), element("strong", "", String(value)));
      if (variant.id !== state.pinnedId) cell.append(element("small", "compare-delta", `${change > 0 ? "+" : ""}${change}`));
      stats.append(cell);
    }
    const edits = changedFields(base, variant.side);
    const changes = element("p", "compare-changes", variant.id === state.pinnedId ? t("compare.reference") :
      edits.length ? t("compare.edits", { fields: edits.map(localizeChange).join(" · ") }) : t("compare.noEdits"));
    const actions = element("div", "compare-card-actions");
    const select = button("compare.select", () => selectVariant(variant.id));
    select.setAttribute("aria-label", t("compare.selectNamed", { name: variant.name }));
    select.setAttribute("aria-pressed", String(variant.id === state.selectedId));
    actions.append(select);
    if (variant.id !== state.pinnedId) {
      const makePin = button("compare.pin", () => pin(variant.id));
      makePin.setAttribute("aria-label", t("compare.pinNamed", { name: variant.name }));
      const removeButton = button("compare.remove", () => remove(variant.id));
      removeButton.setAttribute("aria-label", t("compare.removeNamed", { name: variant.name }));
      actions.append(makePin, removeButton);
    }
    card.append(top, pokemon, stats, changes, actions);
    return card;
  }));
}

function localizeChange(change) {
  const match = /^(hp|atk|def|spa|spd|spe) (SP|stage)$/.exec(change);
  if (match) return `${t(`compare.stat.${match[1]}`)} ${match[2] === "SP" ? "SP" : t("compare.stage")}`;
  const move = /^move (\d)( critical| conditions)?$/.exec(change);
  if (move) return t("compare.moveChange", { slot: move[1], detail: move[2] ? t(move[2] === " critical" ? "compare.critical" : "compare.conditions") : "" });
  return t(`compare.field.${change}`);
}

function renderMatrix() {
  if (!latest) return;
  const header = element("tr");
  const opponentHeader = element("th", "", t("matchups.opponent"));
  opponentHeader.scope = "col";
  header.append(opponentHeader);
  for (const variant of state.variants) {
    const th = element("th", "", variant.name);
    th.scope = "col";
    header.append(th);
  }
  elements.head.replaceChildren(header);
  const rows = latest.rows.filter((row) => !elements.changedOnly.checked || row.changed);
  elements.rowCount.textContent = t("compare.showing", { shown: rows.length, analyzed: latest.rows.length });
  elements.body.replaceChildren(...rows.map((row) => {
    const tr = element("tr", row.changed ? "changed" : "");
    const th = element("th", "compare-opponent", localizedName(row.opponent.pokemon));
    th.scope = "row";
    tr.append(th);
    for (const variant of state.variants) {
      const result = row.cells[variant.id]?.result;
      const td = element("td", `compare-matrix-cell ${result?.outcome ?? ""}`);
      if (!result) {
        td.textContent = "—";
      } else {
        td.append(element("strong", "", t(outcomeKeys[result.outcome])));
        const ours = result.ours.best;
        const theirs = result.theirs.best;
        td.append(element("small", "", t("compare.yourMove", { move: ours?.move ? localizedName(ours.move) : "—", turns: turns(result.ourHits) })));
        td.append(element("small", "", t("compare.theirMove", { move: theirs?.move ? localizedName(theirs.move) : "—", turns: turns(result.theirHits) })));
      }
      tr.append(td);
    }
    return tr;
  }));
  if (!rows.length) {
    const tr = element("tr");
    const td = element("td", "compare-empty", t("compare.noChanged"));
    td.colSpan = state.variants.length + 1;
    tr.append(td);
    elements.body.append(tr);
  }
}

function turns(count) { return Number.isFinite(count) ? t("compare.turnCount", { count }) : t("compare.noKoTurns"); }

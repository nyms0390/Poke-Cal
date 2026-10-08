import {
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
} from "../data/catalog.js";
import { activeSetFromState, applyActiveSet, createActiveSetStore } from "../data/active-set.js";
import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import {
  HIT_BUCKETS,
  analyzeMatchups,
  createMatchupPreferencesStore,
  matchupSections,
  matchupSetFromSide,
  normalizeOpponentCount,
  normalizeSpeedMode,
  rankedOpponents,
  summarizeMatchups,
} from "../data/matchup-analysis.js";
import { trickRoomTeamShares } from "../data/matchups.js";
import { groupNicheThreats, nicheThreatRow, splitByTeams } from "../data/niche-threats.js";
import { sortUncommonRows, uncommonSetRow } from "../data/uncommon-sets.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { STAT_KEYS } from "../engine/constants.js";
import { NATURES, natureOptionLabel } from "../engine/natures.js";
import { calculateStat } from "../engine/stats.js";
import {
  getLocale,
  initI18n,
  localizedName,
  localizedNatureOptionLabel,
  localizedTerm,
  onLocaleChange,
  t,
  translateSubtree,
} from "../i18n.js";
import { formatDamageReason, formatKoText } from "../i18n-formatters.js";
import { applyControl, createSideState } from "./battle-state.js";
import { loadCatalogs, rankByUsage, requestedPokemonStatus } from "./bootstrap.js";
import {
  STAT_LABELS,
  attachCombobox,
  browserStorage,
  consumeQueryParam,
  ensureRenderedRows,
  moveSlotCombobox,
  optionElement,
  pokemonMiniSprite,
  pokemonSearchMatchers,
  pokemonSpriteElements,
  searchResultButton,
  typeClassName,
  typeIconPath,
} from "./components.js";
import { mountAmbientFieldControls } from "./field-controls.js";
import { applyAmbientFieldControl, createAmbientFieldState } from "./field-state.js";
import { SHEET_MEDIA_QUERY, mountSetSheet, mountSheetBar } from "./set-sheet.js";

const SECTION_KEYS = ["threats", "speed", "favorable", "stalemate"];
const SP_ANALYSIS_DELAY_MS = 150;
// Champions caps a Pokémon's SP at 66 in total (see SP_TOTAL_LIMIT in the damage engine).
const SP_LIMIT = 66;

// The outcome filters above the results list, in list order. "all" lists every section in turn.
const FILTERS = [
  { key: "all", labelKey: "matchups.filterAll" },
  { key: "threats", labelKey: "matchups.threats", className: "loss" },
  { key: "speed", labelKey: "matchups.speedRaces", className: "speed" },
  { key: "favorable", labelKey: "matchups.favorable", className: "win" },
  { key: "stalemate", labelKey: "matchups.stalemate", className: "stalemate" },
];
const DEFAULT_FILTER = "threats";

const elements = {
  editor: document.querySelector("#matchups-editor"),
  summaryCard: document.querySelector("#matchups-summary-card"),
  source: document.querySelector("#matchups-source"),
  status: document.querySelector("#status"),
  sprite: document.querySelector("#matchups-sprite"),
  pokemonSearch: document.querySelector("#matchups-pokemon-search"),
  pokemonResults: document.querySelector("#matchups-pokemon-results"),
  nature: document.querySelector("#matchups-nature"),
  ability: document.querySelector("#matchups-ability"),
  item: document.querySelector("#matchups-item"),
  stats: document.querySelector("#matchups-stats"),
  spTotal: document.querySelector("#matchups-sp-total"),
  spMeterFill: document.querySelector("#matchups-sp-meter-fill"),
  environmentSummary: document.querySelector("#matchups-environment-summary"),
  tabs: [...document.querySelectorAll("[data-matchups-tab]")],
  panels: {
    common: document.querySelector("#matchups-common-panel"),
    beyond: document.querySelector("#matchups-beyond-panel"),
  },
  beyondTabCount: document.querySelector("#matchups-tab-beyond-count"),
  uncommonList: document.querySelector("#matchups-uncommon"),
  uncommonCount: document.querySelector("#matchups-uncommon-count"),
  uncommonStatus: document.querySelector("#matchups-uncommon-status"),
  nicheList: document.querySelector("#matchups-niche"),
  nicheRepeats: document.querySelector("#matchups-niche-repeats"),
  nicheRepeatsSummary: document.querySelector("#matchups-niche-repeats-summary"),
  nicheRepeatsGroups: document.querySelector("#matchups-niche-repeats-groups"),
  movePicks: document.querySelector("#matchups-move-picks"),
  opponentCount: document.querySelector("#matchups-opponent-count"),
  speedMode: document.querySelector("#matchups-speed-mode"),
  speedHelp: document.querySelector("#matchups-speed-help"),
  ambientField: document.querySelector("#matchups-ambient-field"),
  shareBar: document.querySelector("#matchups-share-bar"),
  shareLegend: document.querySelector("#matchups-share-legend"),
  shareNote: document.querySelector("#matchups-share-note"),
  gridBody: document.querySelector("#matchups-grid-body"),
  filter: document.querySelector("#matchups-filter"),
  filterText: document.querySelector("#matchups-filter-text"),
  filterClear: document.querySelector("#matchups-filter-clear"),
  outcomeFilter: document.querySelector("#matchups-outcome-filter"),
  outcomeSelect: document.querySelector("#matchups-outcome-select"),
  opponentSearch: document.querySelector("#matchups-opponent-search"),
  list: document.querySelector("#matchups-list"),
  showing: document.querySelector("#matchups-showing"),
};

const preferencesStore = createMatchupPreferencesStore(browserStorage());
const activeSetStore = createActiveSetStore(browserStorage());
const expandedRows = new Set();
let catalogs = null;
let trickRoomShares = null;
let teamArchiveState = "loading";
let unavailableRequestId = "";
let moveComboboxCleanups = [];
let analysisTimer = null;
// "Beyond the usual sets" checks every Pokémon (about a second for the popular ones, a few more
// for the rarely used ones), so it runs one Pokémon per task in the background, popular ones
// first, and restarts whenever your set or the field changes.
const UNCOMMON_START_DELAY_MS = 300;
const uncommon = {
  key: "", run: 0, timer: null,
  phase: "popular", done: 0, total: 0,
  popularRows: [], nicheRows: [], popularDone: false, nicheDone: false,
  popularCount: 0, rareCount: 0,
};
let lastThreatRows = [];
// The latest analysis, so the outcome filter and opponent search re-render without re-racing.
let lastAnalysis = null;
let state = {
  user: null,
  field: createAmbientFieldState(),
  ...preferencesStore.read(),
  cell: null,
  filter: DEFAULT_FILTER,
  query: "",
  tab: "common",
};
const phoneQuery = globalThis.matchMedia?.(SHEET_MEDIA_QUERY);
const setSheet = mountSetSheet({
  editor: elements.editor,
  id: "matchups-set-sheet",
  doneKey: "sheet.viewMatchups",
  summaryHost: elements.summaryCard,
});
const sheetBar = mountSheetBar({ actions: [{ sheet: setSheet, labelKey: "sheet.editSet" }], withStatus: true });

const ambientFieldControls = mountAmbientFieldControls(elements.ambientField, {
  namePrefix: "matchups",
  onChange: (control) => {
    state = { ...state, field: applyAmbientFieldControl(state.field, control) };
    renderAnalysis();
  },
});
ambientFieldControls.sync(state.field);

initI18n();
buildGrid();
buildOutcomeFilter();
bindResultControls();
initialize();

onLocaleChange(() => {
  if (!catalogs || !state.user) return;
  renderStatus();
  renderNatureOptions();
  renderPicks();
  renderMovePicks();
  buildGrid();
  buildOutcomeFilter();
  render();
});

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;

  renderNatureOptions();
  attachCombobox({
    input: elements.pokemonSearch,
    resultsEl: elements.pokemonResults,
    ...pokemonSearchMatchers(() => catalogs),
    onSelect: (pokemon) => {
      unavailableRequestId = "";
      renderStatus();
      seedPokemon(pokemon);
    },
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });
  elements.nature.addEventListener("input", (event) => updateUser({ kind: "nature", value: event.target.value }));
  elements.ability.addEventListener("input", (event) => updateUser({
    kind: "ability",
    value: catalogs.abilityLookup.get(normalizeId(event.target.value)) ?? null,
  }));
  elements.item.addEventListener("input", (event) => updateUser({
    kind: "item",
    value: catalogs.itemLookup.get(normalizeId(event.target.value)) ?? null,
  }));
  elements.stats.addEventListener("input", handleSpInput);
  elements.opponentCount.addEventListener("input", (event) => {
    state = { ...state, ...preferencesStore.write({ opponentCount: normalizeOpponentCount(event.target.value) }), cell: null };
    renderAnalysis();
  });
  elements.speedMode.addEventListener("input", (event) => {
    state = { ...state, ...preferencesStore.write({ speedMode: normalizeSpeedMode(event.target.value) }) };
    renderAnalysis();
  });

  // `?pokemon=` is a one-off hand-off (Builder links here); the active set carries the full set.
  const requestedId = consumeQueryParam("pokemon");
  const requested = requestedId
    ? catalogs.pokemon.find(({ id }) => normalizeId(id) === normalizeId(requestedId))
    : undefined;
  unavailableRequestId = requestedId && !requested ? requestedId : "";
  renderStatus();
  const activeSet = activeSetStore.readSet();
  const activePokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === activeSet?.pokemonId);
  const initialPokemon = requested ?? activePokemon ?? rankedOpponents(catalogs.pokemon, 1)[0]?.pokemon ?? catalogs.pokemon[0];
  seedPokemon(initialPokemon, {
    activeSet: activeSet?.pokemonId === normalizeId(initialPokemon?.id) ? activeSet : null,
  });
  loadTrickRoomShares();
}

async function loadTrickRoomShares() {
  try {
    trickRoomShares = trickRoomTeamShares(await loadLimitlessTeamArchive());
    teamArchiveState = "loaded";
  } catch (error) {
    console.error("PokéCal team archive load failed; Auto uses normal move order.", error);
    teamArchiveState = "failed";
  }
  renderAnalysis();
}

function renderStatus() {
  elements.status.textContent = requestedPokemonStatus(catalogs, unavailableRequestId);
}

function seedPokemon(pokemon, { activeSet = null } = {}) {
  if (!pokemon) return;
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    items: catalogs.items,
  });
  let user = createSideState(pokemon, defaults);
  if (activeSet) {
    user = applyActiveSet(user, activeSet, {
      abilityLookup: catalogs.abilityLookup,
      itemLookup: catalogs.itemLookup,
    });
  }
  state = { ...state, user, cell: null };
  expandedRows.clear();
  renderPicks();
  renderMovePicks();
  render();
}

function updateUser(control, { immediate = true } = {}) {
  if (!state.user) return;
  state = { ...state, user: applyControl(state.user, control) };
  if (control.kind === "ability" || control.kind === "item") renderMovePicks();
  activeSetStore.writeSet(activeSetFromState(state.user));
  renderEditor();
  if (immediate) renderAnalysis();
  else scheduleAnalysis();
}

function handleSpInput(event) {
  const stat = event.target.dataset.stat;
  if (event.target.dataset.kind !== "matchups-sp" || !stat) return;
  updateUser({ kind: "sp", stat, value: event.target.value }, { immediate: false });
}

function scheduleAnalysis() {
  clearTimeout(analysisTimer);
  analysisTimer = setTimeout(renderAnalysis, SP_ANALYSIS_DELAY_MS);
}

function render() {
  if (!state.user) return;
  activeSetStore.writeSet(activeSetFromState(state.user));
  renderEditor();
  renderAnalysis();
}

// ---------- editor ----------

function renderNatureOptions() {
  elements.nature.replaceChildren(
    ...Object.keys(NATURES).map((nature) => optionElement(
      nature,
      getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature),
    )),
  );
}

function renderPicks() {
  const user = state.user;
  const usage = user.pokemon.champions?.usage;
  const abilities = rankByUsage(resolvePokemonAbilities(user.pokemon, catalogs.abilityLookup), usage?.abilities);
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

function userMoves() {
  return rankByUsage(
    resolveChampionsPokemonMoves(state.user.pokemon, catalogs.moveLookup),
    state.user.pokemon.champions?.usage?.moves,
  );
}

function renderMovePicks() {
  for (const cleanup of moveComboboxCleanups) cleanup();
  moveComboboxCleanups = [];
  const moves = userMoves();
  elements.movePicks.replaceChildren(...[0, 1, 2, 3].map((index) => {
    const row = document.createElement("div");
    row.className = "matchups-move-row";
    const selectedId = state.user.selectedMoveIds[index] ?? "";
    const selected = moves.find((move) => normalizeId(move.id) === normalizeId(selectedId));
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    renderMoveTypeIcon(icon, selected);
    const combobox = moveSlotCombobox({
      index,
      moves,
      selectedMove: selected,
      resultLimit: 12,
      onSelect: (move, input) => {
        input.value = localizedName(move);
        renderMoveTypeIcon(icon, move);
        updateUser({ kind: "move", index, value: move.id });
      },
    });
    moveComboboxCleanups.push(combobox.destroy);
    row.append(icon, combobox.element);
    return row;
  }));
}

// A round type mark in front of each move slot (the move's base type).
function renderMoveTypeIcon(icon, move) {
  icon.className = `matchups-move-type type-badge ${move?.type ? typeClassName(move.type) : "empty"}`;
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

let spriteId = "";

function renderEditor() {
  const user = state.user;
  elements.pokemonSearch.value = localizedName(user.pokemon);
  elements.nature.value = user.nature;
  elements.ability.value = user.ability?.id ?? "";
  elements.item.value = user.item?.id ?? "";
  if (spriteId !== user.pokemon.id) {
    spriteId = user.pokemon.id;
    elements.sprite.replaceChildren(...pokemonSpriteElements(user.pokemon, { size: 56 }));
  }
  const rows = ensureRenderedRows(elements.stats, ".matchups-stat-row", () => STAT_KEYS.map(statRow), getLocale());
  for (const [index, stat] of STAT_KEYS.entries()) {
    const row = rows[index];
    row.querySelector(".matchups-stat-base").textContent = String(user.pokemon.baseStats[stat]);
    const input = row.querySelector("input");
    if (document.activeElement !== input) input.value = String(user.sp[stat] ?? 0);
    row.querySelector(".builder-stat-final").textContent = String(calculateStat({
      base: user.pokemon.baseStats[stat],
      stat,
      sp: user.sp[stat] ?? 0,
      nature: user.nature,
    }));
  }
  const spent = STAT_KEYS.reduce((total, stat) => total + (user.sp[stat] ?? 0), 0);
  const over = spent > SP_LIMIT;
  elements.spTotal.textContent = over
    ? t("matchups.spOver", { count: spent, limit: SP_LIMIT, over: spent - SP_LIMIT })
    : t("matchups.spTotal", { count: spent, limit: SP_LIMIT });
  elements.spTotal.classList.toggle("over", over);
  for (const input of elements.stats.querySelectorAll("input")) {
    input.setAttribute("aria-invalid", String(over));
  }
  elements.spMeterFill.style.width = `${Math.min(1, spent / SP_LIMIT) * 100}%`;
  elements.spMeterFill.parentElement.classList.toggle("over", over);
  setSheet.update({
    pokemon: user.pokemon,
    meta: [
      localizedTerm("nature", user.nature),
      user.item ? localizedName(user.item) : t("builder.noItem"),
    ].join(" · "),
  });
  sheetBar.setStatus(t("matchups.spShort", { count: spent, limit: SP_LIMIT }), over ? "over" : spent === SP_LIMIT ? "ok" : "");
}

function statRow(stat) {
  const row = document.createElement("div");
  row.className = "matchups-stat-row";
  const label = document.createElement("span");
  label.className = "matchups-stat-label";
  const name = document.createElement("span");
  name.textContent = localizedTerm("stat", STAT_LABELS[stat]);
  // The base stat stays visible but quiet: SP choices depend on it.
  const base = document.createElement("small");
  base.className = "matchups-stat-base";
  base.title = t("matchups.baseLabel");
  label.append(name, base);
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "32";
  input.step = "1";
  input.inputMode = "numeric";
  input.dataset.kind = "matchups-sp";
  input.dataset.stat = stat;
  input.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} SP`);
  input.setAttribute("aria-describedby", "matchups-sp-total");
  const final = document.createElement("strong");
  final.className = "builder-stat-final";
  row.append(label, input, final);
  return row;
}

// ---------- analysis ----------

function renderAnalysis() {
  clearTimeout(analysisTimer);
  if (!catalogs || !state.user) return;
  syncControls();
  const ours = matchupSetFromSide(state.user, catalogs.moveLookup);
  const opponents = rankedOpponents(catalogs.pokemon, state.opponentCount);
  const { rows, skipped } = analyzeMatchups({
    ours,
    opponents,
    lookups: catalogs,
    field: state.field,
    speedMode: state.speedMode,
    trickRoomShares,
  });
  const summary = summarizeMatchups(rows);
  const sections = matchupSections(rows, { cell: state.cell });

  elements.source.textContent = t("matchups.source", { count: opponents.length, skipped: skipped.length });
  renderSpeedHelp();
  renderOverview(summary);
  renderGrid(summary);
  renderFilter(sections);
  lastAnalysis = { sections, ours };
  renderResults();
  lastThreatRows = rows.filter((row) => row.result.outcome === "loss");
  scheduleUncommon(ours);
  translateSubtree(elements.shareLegend, elements.gridBody);
}

// ---------- results list, filters and views ----------

function bindResultControls() {
  elements.outcomeSelect.addEventListener("input", (event) => setFilter(event.target.value));
  elements.opponentSearch.addEventListener("input", (event) => {
    state = { ...state, query: event.target.value };
    renderResults();
  });
  elements.filterClear.addEventListener("click", () => {
    state = { ...state, cell: null };
    renderAnalysis();
    elements.outcomeFilter.querySelector("input:checked")?.focus();
  });
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => setTab(tab.dataset.matchupsTab));
    tab.addEventListener("keydown", (event) => {
      const index = elements.tabs.indexOf(tab);
      const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: elements.tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = elements.tabs[(next + elements.tabs.length) % elements.tabs.length];
      setTab(target.dataset.matchupsTab);
      target.focus();
    });
  }
  phoneQuery?.addEventListener?.("change", renderSpeedModeOptions);
}

function setTab(tab) {
  state = { ...state, tab };
  for (const button of elements.tabs) {
    const selected = button.dataset.matchupsTab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const [key, panel] of Object.entries(elements.panels)) panel.hidden = key !== tab;
}

function setFilter(filter) {
  if (!FILTERS.some(({ key }) => key === filter)) return;
  state = { ...state, filter };
  renderResults();
}

function buildOutcomeFilter() {
  elements.outcomeFilter.replaceChildren(...FILTERS.map(({ key, labelKey, className }) => {
    const option = document.createElement("label");
    option.className = `matchups-outcome-option ${className ?? "all"}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "matchups-outcome";
    input.value = key;
    input.addEventListener("input", () => setFilter(key));
    const text = document.createElement("span");
    text.textContent = t(labelKey);
    const count = document.createElement("strong");
    count.dataset.count = key;
    count.textContent = "—";
    option.append(input, text, count);
    return option;
  }));
  elements.outcomeSelect.replaceChildren(...FILTERS.map(({ key }) => optionElement(key, "")));
}

function filteredRows(sections) {
  const rows = state.filter === "all" ? SECTION_KEYS.flatMap((key) => sections[key]) : sections[state.filter];
  const query = state.query.trim().toLowerCase();
  if (!query) return rows;
  return rows.filter((row) => [localizedName(row.pokemon), row.pokemon.name, row.pokemon.id]
    .some((name) => String(name ?? "").toLowerCase().includes(query)));
}

function renderResults() {
  if (!lastAnalysis) return;
  const { sections, ours } = lastAnalysis;
  const counts = {
    all: SECTION_KEYS.reduce((total, key) => total + sections[key].length, 0),
    ...Object.fromEntries(SECTION_KEYS.map((key) => [key, sections[key].length])),
  };
  for (const input of elements.outcomeFilter.querySelectorAll("input")) {
    input.checked = input.value === state.filter;
    input.closest("label").classList.toggle("selected", input.checked);
  }
  for (const count of elements.outcomeFilter.querySelectorAll("[data-count]")) {
    count.textContent = String(counts[count.dataset.count]);
  }
  for (const option of elements.outcomeSelect.options) {
    const filter = FILTERS.find(({ key }) => key === option.value);
    option.textContent = `${t(filter.labelKey)} · ${counts[option.value]}`;
  }
  elements.outcomeSelect.value = state.filter;
  elements.outcomeSelect.className = `matchups-outcome-select ${FILTERS.find(({ key }) => key === state.filter)?.className ?? "all"}`;

  const rows = filteredRows(sections);
  const total = counts[state.filter];
  if (rows.length === 0) {
    const empty = document.createElement("li");
    empty.className = "matchups-empty";
    empty.textContent = state.query.trim()
      ? t("matchups.noSearchMatch", { query: state.query.trim() })
      : t(state.cell ? "matchups.emptyFiltered" : "matchups.empty", { count: state.opponentCount });
    elements.list.replaceChildren(empty);
  } else {
    elements.list.replaceChildren(...rows.map((row) => matchupRow("common", row, ours)));
  }
  elements.showing.textContent = t("matchups.showing", { count: rows.length, total, filter: state.filter });
  translateSubtree(elements.list);
}

// ---------- beyond the usual sets ----------

function uncommonKey(ours) {
  return JSON.stringify([
    normalizeId(ours.pokemon.id), ours.nature, ours.sp, ours.ability?.id ?? "", ours.item?.id ?? "",
    ours.moves.map((move) => move.id), state.field,
  ]);
}

function scheduleUncommon(ours) {
  const key = uncommonKey(ours);
  if (key === uncommon.key) {
    renderUncommon(ours);
    return;
  }
  const { popular, rare } = splitByTeams(catalogs.pokemon);
  Object.assign(uncommon, {
    key, run: uncommon.run + 1, phase: "popular", done: 0, total: popular.length,
    popularRows: [], nicheRows: [], popularDone: false, nicheDone: false,
    popularCount: popular.length, rareCount: rare.length,
  });
  clearTimeout(uncommon.timer);
  renderUncommon(ours);
  const run = uncommon.run;
  uncommon.timer = setTimeout(() => searchBeyond(run, ours, popular, rare), UNCOMMON_START_DELAY_MS);
}

async function searchBeyond(run, ours, popular, rare) {
  const field = state.field;
  for (const opponent of popular) {
    if (run !== uncommon.run) return;
    const row = uncommonSetRow(opponent, ours, catalogs, { field });
    if (row) uncommon.popularRows.push(row);
    uncommon.done += 1;
    renderUncommonStatus();
    await nextTask();
  }
  if (run !== uncommon.run) return;
  uncommon.popularRows = sortUncommonRows(uncommon.popularRows);
  Object.assign(uncommon, { popularDone: true, phase: "rare", done: 0, total: rare.length });
  renderUncommon(ours);
  for (const opponent of rare) {
    if (run !== uncommon.run) return;
    const row = nicheThreatRow(opponent, ours, catalogs, { field });
    if (row) uncommon.nicheRows.push(row);
    uncommon.done += 1;
    renderUncommonStatus();
    await nextTask();
  }
  if (run !== uncommon.run) return;
  uncommon.nicheDone = true;
  renderUncommon(ours);
}

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function renderUncommonStatus() {
  elements.uncommonStatus.textContent = uncommon.nicheDone
    ? t("matchups.beyondDone", { popular: uncommon.popularCount, rare: uncommon.rareCount })
    : t(uncommon.phase === "popular" ? "matchups.checkingPopular" : "matchups.checkingRare", { done: uncommon.done, total: uncommon.total });
}

// Popular rows minus the usual-set threats the "Beat you" list already shows.
function visiblePopularRows() {
  const shown = new Set(lastThreatRows.map((row) => row.id));
  return uncommon.popularRows.filter((row) => !(row.usualBeats && shown.has(row.id)));
}

function renderUncommon(ours) {
  renderUncommonStatus();
  const popularRows = uncommon.popularDone ? visiblePopularRows() : [];
  const grouped = uncommon.nicheDone
    ? groupNicheThreats(uncommon.nicheRows, [...lastThreatRows, ...popularRows].map((row) => row.result))
    : { novel: [], repeats: [] };
  const finished = uncommon.popularDone && uncommon.nicheDone;
  const total = popularRows.length + grouped.novel.length;
  elements.uncommonCount.textContent = finished ? t("matchups.pokemonCount", { count: total }) : "…";
  elements.beyondTabCount.textContent = finished ? String(total) : "…";

  renderRowList(elements.uncommonList, uncommon.popularDone, popularRows, "matchups.uncommonEmpty", (row) =>
    matchupRow("uncommon", row, ours, { badge: changesBadge(row), facts: popularFacts(row) }));
  renderRowList(elements.nicheList, uncommon.nicheDone, grouped.novel, "matchups.nicheEmpty", (row) =>
    matchupRow("niche", row, ours, { facts: nicheFacts(row) }));
  renderNicheRepeats(grouped.repeats, ours);
  translateSubtree(elements.uncommonList, elements.nicheList, elements.nicheRepeats);
}

function renderRowList(list, done, rows, emptyKey, renderRow) {
  if (!done) {
    list.replaceChildren();
    return;
  }
  if (rows.length === 0) {
    const empty = document.createElement("li");
    empty.className = "matchups-empty";
    empty.textContent = t(emptyKey);
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...rows.map(renderRow));
}

function renderNicheRepeats(repeats, ours) {
  const count = repeats.reduce((total, group) => total + group.rows.length, 0);
  elements.nicheRepeats.hidden = count === 0;
  if (count === 0) {
    elements.nicheRepeatsGroups.replaceChildren();
    return;
  }
  elements.nicheRepeatsSummary.textContent = t("matchups.nicheRepeats", {
    count,
    types: repeats.map(({ type, rows }) => `${localizedTerm("type", type)} ${rows.length}`).join(" · "),
  });
  elements.nicheRepeatsGroups.replaceChildren(...repeats.map(({ type, rows }) => {
    const group = document.createElement("section");
    group.className = "matchups-repeat-group";
    const heading = document.createElement("h4");
    heading.textContent = t("matchups.nicheRepeatType", { type: localizedTerm("type", type), count: rows.length });
    const list = document.createElement("ul");
    list.className = "matchups-list";
    list.replaceChildren(...rows.map((row) => matchupRow("niche-repeat", row, ours, { facts: nicheFacts(row) })));
    group.append(heading, list);
    return group;
  }));
}

function outcomeLabel(outcome) {
  return t({ win: "matchups.youWin", speed: "matchups.speedDecides", loss: "matchups.beatsYou" }[outcome] ?? "matchups.noKoEither");
}

function popularFacts(row) {
  return row.usualBeats
    ? [[t("matchups.usualSet"), outcomeLabel(row.usualOutcome)]]
    : [
      [t("matchups.usualSet"), outcomeLabel(row.usualOutcome)],
      [t("matchups.theorySpread"), t(`matchups.template.${row.template}`)],
    ];
}

function nicheFacts(row) {
  return [[t("matchups.theorySpread"), t(`matchups.template.${row.template}`)]];
}

function changesBadge(row) {
  const badge = document.createElement("span");
  badge.className = "matchups-verdict-label loss matchups-changes";
  badge.textContent = row.usualBeats
    ? t("matchups.usualBeats")
    : row.changes.length === 0
    ? t("matchups.spreadOnly")
    : t("matchups.needs", { list: row.changes.map(changeLabel).join(" + ") });
  return badge;
}

function changeLabel(change) {
  if (change.kind === "nature") return localizedTerm("nature", change.name);
  const lookup = { move: catalogs.moveLookup, ability: catalogs.abilityLookup, item: catalogs.itemLookup }[change.kind];
  const entry = lookup?.get(change.id);
  return entry ? localizedName(entry) : change.name;
}

function syncControls() {
  elements.opponentCount.value = String(state.opponentCount);
  renderSpeedModeOptions();
  ambientFieldControls.sync(state.field);
  const overrides = [
    fieldLabel(WEATHER_LABEL_KEYS, "field.weather", state.field.weather),
    fieldLabel(TERRAIN_LABEL_KEYS, "field.terrain", state.field.terrain),
    state.field.gravity ? t("field.gravity") : "",
  ].filter(Boolean);
  elements.environmentSummary.textContent = [
    t(state.field.format === "singles" ? "field.singles" : "field.doubles"),
    ...(overrides.length > 0 ? overrides : [t("matchups.noOverride")]),
  ].join(" · ");
}

// "Move order: Normal" on wide screens; the shorter "Normal order" fits a half-width phone select.
function renderSpeedModeOptions() {
  const short = Boolean(phoneQuery?.matches);
  for (const option of elements.speedMode.options) {
    const mode = t(speedModeKey(option.value));
    option.textContent = short ? t("matchups.orderShort", { mode }) : t("matchups.orderLong", { mode });
  }
  for (const option of elements.opponentCount.options) {
    option.textContent = t("matchups.topCount", { count: option.value });
  }
  elements.speedMode.value = state.speedMode;
}

function renderSpeedHelp() {
  if (state.speedMode === "normal") {
    elements.speedHelp.textContent = t("matchups.speedNormalHelp");
  } else if (state.speedMode === "trickRoom") {
    elements.speedHelp.textContent = t("matchups.speedTrickRoomHelp");
  } else if (teamArchiveState === "loaded") {
    elements.speedHelp.textContent = t("matchups.speedAutoHelp", {
      share: percentLabel(trickRoomShares.overall.share),
      teams: trickRoomShares.overall.teams,
    });
  } else {
    elements.speedHelp.textContent = t(teamArchiveState === "failed" ? "matchups.speedAutoFailed" : "matchups.speedAutoLoading");
  }
}

const OUTCOME_LEGEND = [
  { outcome: "loss", labelKey: "matchups.threats", className: "loss" },
  { outcome: "speed", labelKey: "matchups.speedDecides", className: "speed" },
  { outcome: "win", labelKey: "matchups.favorable", className: "win" },
  { outcome: "stalemate", labelKey: "matchups.stalemate", className: "stalemate" },
];

function renderOverview(summary) {
  elements.shareBar.replaceChildren(...OUTCOME_LEGEND
    .filter(({ outcome }) => summary.shares[outcome] > 0)
    .map(({ outcome, className }) => {
      const segment = document.createElement("span");
      segment.className = `matchups-share-segment ${className}`;
      segment.style.flexGrow = String(summary.shares[outcome]);
      // Label a segment only when it is wide enough to hold its percentage.
      if (summary.shares[outcome] >= 0.07) segment.textContent = percentLabel(summary.shares[outcome]);
      return segment;
    }));
  elements.shareLegend.replaceChildren(...OUTCOME_LEGEND.map(({ outcome, labelKey, className }) => {
    const item = document.createElement("li");
    item.className = `matchups-share-item ${className}`;
    const label = document.createElement("span");
    label.className = "matchups-share-label";
    label.textContent = t(labelKey);
    const value = document.createElement("strong");
    value.textContent = percentLabel(summary.shares[outcome]);
    const count = document.createElement("span");
    count.className = "matchups-share-count";
    count.textContent = t("matchups.pokemonCount", { count: summary.counts[outcome] });
    item.append(label, value, count);
    if (outcome === "stalemate" && summary.counts.stalemate === 0) item.classList.add("none");
    return item;
  }));
  const speedPart = summary.speedFirstShare === null
    ? ""
    : ` ${t("matchups.speedFirstNote", { share: percentLabel(summary.speedFirstShare), mode: t(speedModeKey(state.speedMode)) })}`;
  elements.shareNote.textContent = `${t("matchups.shareNote", {
    count: summary.count,
    walled: percentLabel(summary.walledShare),
  })}${speedPart}`;
}

function speedModeKey(mode) {
  return { auto: "matchups.speedAuto", normal: "matchups.speedNormal", trickRoom: "matchups.speedTrickRoom" }[mode];
}

function buildGrid() {
  elements.gridBody.replaceChildren(...HIT_BUCKETS.map((theirs) => {
    const row = document.createElement("tr");
    const header = document.createElement("th");
    header.scope = "row";
    header.textContent = hitsBucketLabel(theirs);
    row.append(header);
    for (const ours of HIT_BUCKETS) {
      const cell = document.createElement("td");
      cell.dataset.theirs = String(theirs);
      cell.dataset.ours = String(ours);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "matchups-grid-button";
      button.addEventListener("click", () => toggleCell(theirs, ours));
      cell.append(button);
      row.append(cell);
    }
    return row;
  }));
}

function hitsBucketLabel(bucket) {
  return bucket === 4 ? "4+" : String(bucket);
}

// Picking a cell lists exactly those opponents in the results below: every outcome, only that
// cell. Picking it again (or "Show all") clears it.
function toggleCell(theirs, ours) {
  const same = state.cell?.theirs === theirs && state.cell?.ours === ours;
  state = same ? { ...state, cell: null } : { ...state, cell: { theirs, ours }, filter: "all" };
  renderAnalysis();
}

function renderGrid(summary) {
  for (const cellElement of elements.gridBody.querySelectorAll("td")) {
    const theirs = Number(cellElement.dataset.theirs);
    const ours = Number(cellElement.dataset.ours);
    const data = summary.grid[theirs - 1][ours - 1];
    const button = cellElement.querySelector("button");
    const selected = state.cell?.theirs === theirs && state.cell?.ours === ours;
    cellElement.className = `matchups-grid-cell ${data.outcome}${data.count === 0 ? " empty" : ""}`;
    button.textContent = String(data.count);
    button.disabled = data.count === 0 && !selected;
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", t("matchups.cellLabel", {
      count: data.count,
      theirs: hitsBucketLabel(theirs),
      ours: hitsBucketLabel(ours),
    }));
  }
}

function renderFilter(sections) {
  const cell = state.cell;
  elements.filter.hidden = !cell;
  if (!cell) return;
  const shown = SECTION_KEYS.reduce((total, key) => total + sections[key].length, 0);
  elements.filterText.textContent = t("matchups.filterText", {
    count: shown,
    theirs: hitsBucketLabel(cell.theirs),
    ours: hitsBucketLabel(cell.ours),
  });
}

function matchupRow(sectionKey, row, ours, { badge = null, facts = [] } = {}) {
  const item = document.createElement("li");
  const details = document.createElement("details");
  details.className = `matchups-row ${row.result.outcome}`;
  const expandKey = `${sectionKey}:${row.id}`;
  details.open = expandedRows.has(expandKey);
  details.addEventListener("toggle", () => {
    if (details.open) {
      expandedRows.add(expandKey);
      if (!details.querySelector(".matchups-detail")) details.append(matchupDetail(row, ours, facts));
    } else {
      expandedRows.delete(expandKey);
    }
  });

  const summary = document.createElement("summary");
  summary.className = "matchups-row-summary";
  const name = document.createElement("span");
  name.className = "matchups-pokemon";
  const nameText = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = localizedName(row.pokemon);
  const meta = document.createElement("small");
  meta.textContent = Number.isFinite(row.rank) && Number(row.usagePercent) > 0
    ? t("matchups.usageShare", { usage: usageLabel(row.usagePercent) })
    : t("matchups.noUsage");
  nameText.append(strong, meta);
  name.append(pokemonMiniSprite(row.pokemon), nameText);

  summary.append(
    name,
    hitCell(t("matchups.theirMove"), row.result.theirs.best, row.result.theirHits),
    hitCell(t("matchups.yourMove"), row.result.ours.best, row.result.ourHits),
    raceCell(row, badge ?? resultBadge(row)),
  );
  details.append(summary);
  if (details.open) details.append(matchupDetail(row, ours, facts));
  item.append(details);
  return item;
}

function hitCell(label, best, turns) {
  const cell = document.createElement("span");
  cell.className = "matchups-hit";
  const heading = document.createElement("small");
  heading.className = "matchups-hit-label";
  heading.textContent = label;
  const move = document.createElement("span");
  move.className = "matchups-hit-move";
  move.textContent = best ? localizedName(best.move) : t("matchups.noMove");
  const value = document.createElement("span");
  value.className = "matchups-hit-value";
  if (best) {
    const range = document.createElement("span");
    range.className = "matchups-hit-range";
    range.textContent = rangeLabel(best);
    value.append(range, ...raceCaveats(best, turns).map((note) => ` · ${note}`));
  } else {
    value.textContent = "—";
  }
  // Phones show each side's turns under its move; wide screens show them in the KO race column.
  const turnCount = document.createElement("span");
  turnCount.className = "matchups-hit-turns";
  turnCount.textContent = turnsLabel(turns);
  cell.append(heading, move, value, turnCount);
  return cell;
}

function raceCell(row, badge) {
  const cell = document.createElement("span");
  cell.className = "matchups-race";
  const race = document.createElement("span");
  race.className = "matchups-race-turns";
  race.setAttribute("aria-hidden", "true");
  race.textContent = t("matchups.raceTurns", {
    theirs: row.result.theirHits,
    ours: row.result.ourHits,
  });
  const spoken = document.createElement("span");
  spoken.className = "visually-hidden matchups-race-spoken";
  spoken.textContent = t("matchups.raceSpoken", {
    theirs: turnsLabel(row.result.theirHits),
    ours: turnsLabel(row.result.ourHits),
  });
  cell.append(race, spoken, badge);
  return cell;
}

function resultBadge(row) {
  const badge = document.createElement("span");
  const { outcome, decisive } = row.result;
  badge.className = `matchups-verdict-label ${outcome}`;
  if (outcome === "loss") {
    badge.textContent = t(decisive ? "matchups.hardCounter" : "matchups.beatsYou");
  } else if (outcome === "win") {
    badge.textContent = t(decisive ? "matchups.hardCheck" : "matchups.youWin");
  } else if (outcome === "speed") {
    const { first, ourWinChance } = row.speed ?? {};
    badge.textContent = first === "split"
      ? t("matchups.firstSplit", { share: percentLabel(ourWinChance) })
      : t(first === "ours" ? "matchups.youFirst" : first === "theirs" ? "matchups.theyFirst" : "matchups.speedTie");
  } else {
    badge.textContent = t("matchups.noKoEither");
  }
  return badge;
}

// One sentence on how the race goes, as the first line of an opened row.
function verdictText(row) {
  const name = localizedName(row.pokemon);
  const { outcome } = row.result;
  if (outcome === "loss") return t("matchups.verdict.loss", { name });
  if (outcome === "win") return t("matchups.verdict.win", { name });
  if (outcome === "stalemate") return t("matchups.verdict.stalemate");
  const { first, ourWinChance } = row.speed ?? {};
  if (first === "split") return t("matchups.verdict.speedSplit", { share: percentLabel(ourWinChance) });
  if (first === "ours") return t("matchups.verdict.speedOurs");
  if (first === "theirs") return t("matchups.verdict.speedTheirs", { name });
  return t("matchups.verdict.speedTie");
}

function matchupDetail(row, ours, extraFacts = []) {
  const detail = document.createElement("div");
  detail.className = "matchups-detail";
  const verdict = document.createElement("p");
  verdict.className = `matchups-verdict ${row.result.outcome}`;
  verdict.textContent = verdictText(row);

  const set = row.set;
  const columns = document.createElement("div");
  columns.className = "matchups-detail-columns";
  columns.append(
    detailColumn(t("matchups.theirSet"), [
      localizedTerm("nature", set.nature),
      set.ability ? localizedName(set.ability) : t("builder.noAbility"),
      set.item ? localizedName(set.item) : t("builder.noItem"),
    ].join(" · ")),
    detailColumn(t("matchups.theRace"), [
      raceLine(row.result.theirs.best, row.result.theirHits),
      raceLine(row.result.ours.best, row.result.ourHits),
    ].join(" · ")),
  );

  const note = document.createElement("div");
  note.className = "matchups-inspect";
  const noteText = document.createElement("p");
  noteText.textContent = t("matchups.assumesConnect");
  const inspect = document.createElement("details");
  const inspectSummary = document.createElement("summary");
  inspectSummary.textContent = t("matchups.inspectMoves");
  inspect.append(inspectSummary);
  inspect.addEventListener("toggle", () => {
    if (inspect.open && !inspect.querySelector(".matchups-inspect-body")) inspect.append(inspectBody(row, ours, extraFacts));
  });
  note.append(noteText, inspect);

  detail.append(verdict, columns, note);
  translateSubtree(detail);
  return detail;
}

function detailColumn(heading, text) {
  const column = document.createElement("div");
  const title = document.createElement("h4");
  title.textContent = heading;
  const body = document.createElement("p");
  body.textContent = text;
  column.append(title, body);
  return column;
}

function raceLine(best, turns) {
  return best ? `${localizedName(best.move)}: ${turnsLabel(turns)}` : t("matchups.noMove");
}

function inspectBody(row, ours, extraFacts) {
  const body = document.createElement("div");
  body.className = "matchups-inspect-body";
  const facts = document.createElement("dl");
  facts.className = "matchups-facts";
  const set = row.set;
  for (const [term, value] of extraFacts) addFact(facts, term, value);
  addFact(facts, t("matchups.spread"), STAT_KEYS.map((stat) => set.sp[stat] ?? 0).join("/"));
  addFact(facts, t("matchups.setSource"), [
    t("matchups.teams", { count: set.source.teams }),
    t({ smogon: "matchups.spreadSmogon", theory: "matchups.spreadTheory" }[set.source.spread] ?? "matchups.spreadPreset"),
  ].join(" · "));
  addFact(facts, t("matchups.moveOrder"), [
    orderLabel("matchups.speedNormal", row.result.order.normal),
    orderLabel("matchups.speedTrickRoom", row.result.order.trickRoom),
  ].join(" · "));
  if (row.trickRoom) {
    addFact(facts, t("matchups.speedTrickRoom"), t(
      row.trickRoom.source === "pokemon" ? "matchups.trShare" : "matchups.trShareOverall",
      { share: percentLabel(row.trickRoom.share), teams: row.trickRoom.teams },
    ));
  }
  const fieldLabels = [
    fieldLabel(WEATHER_LABEL_KEYS, "field.weather", row.result.field.weather),
    fieldLabel(TERRAIN_LABEL_KEYS, "field.terrain", row.result.field.terrain),
  ].filter(Boolean);
  if (fieldLabels.length > 0) addFact(facts, t("field.environment"), fieldLabels.join(" · "));
  body.append(
    facts,
    moveTable(t("matchups.theirMoves", { name: localizedName(row.pokemon) }), row.result.theirs.moves),
    moveTable(t("matchups.yourMoves", { name: localizedName(ours.pokemon) }), row.result.ours.moves),
  );
  translateSubtree(body);
  return body;
}

const WEATHER_LABEL_KEYS = { SunnyDay: "field.sun", RainDance: "field.rain", Sandstorm: "field.sand", Snowscape: "field.snow" };
const TERRAIN_LABEL_KEYS = {
  "Electric Terrain": "field.electric",
  "Grassy Terrain": "field.grassy",
  "Misty Terrain": "field.misty",
  "Psychic Terrain": "field.psychic",
};

function fieldLabel(keys, groupKey, value) {
  if (!value) return "";
  return t("matchups.fieldValue", { label: t(groupKey), value: keys[value] ? t(keys[value]) : value });
}

function addFact(list, term, value) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = value;
  list.append(dt, dd);
}

function orderLabel(modeKey, order) {
  const mode = t(modeKey);
  if (order.first === "tie") return t("matchups.orderTie", { mode, speed: order.ourSpeed });
  if (order.ourPriority !== order.theirPriority) {
    return t("matchups.orderPriority", {
      mode,
      first: order.first,
      ours: signed(order.ourPriority),
      theirs: signed(order.theirPriority),
    });
  }
  return t("matchups.orderSpeed", { mode, first: order.first, ours: order.ourSpeed, theirs: order.theirSpeed });
}

function moveTable(caption, entries) {
  const table = document.createElement("table");
  table.className = "matchups-move-table";
  const captionElement = document.createElement("caption");
  captionElement.textContent = caption;
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const key of ["matchups.move", "matchups.damage", "matchups.ko"]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = t(key);
    headRow.append(th);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  const sorted = [...entries].sort((a, b) => Number(b.included) - Number(a.included) ||
    (a.hits === b.hits ? 0 : a.hits < b.hits ? -1 : 1) || (b.maxPercent ?? 0) - (a.maxPercent ?? 0));
  for (const entry of sorted) {
    const row = document.createElement("tr");
    const move = document.createElement("td");
    move.textContent = localizedName(entry.move);
    const damage = document.createElement("td");
    damage.className = "matchups-numeric";
    damage.textContent = entry.included ? rangeLabel(entry) : "—";
    const ko = document.createElement("td");
    ko.textContent = entry.included
      ? formatKoText(entry.koText, getLocale())
      : exclusionLabel(entry);
    if (entry.included && entry.statDrop) ko.textContent += ` · ${t("matchups.statDrop")}`;
    if (entry.included && entry.critical) ko.textContent += ` · ${t("matchups.critical")}`;
    if (entry.included) for (const note of raceTiming(entry, entry.hits)) ko.textContent += ` · ${note}`;
    if (entry.included && entry.accuracy < 100) {
      ko.textContent += ` · ${t("matchups.accuracy", { accuracy: entry.accuracy })}`;
    }
    row.append(move, damage, ko);
    body.append(row);
  }
  table.append(captionElement, head, body);
  return table;
}

// The race-timing caveats for a move: its plan (charge, recharge, conditional, …) and, when the
// turns differ from the uses, the turn count the race uses.
function raceTiming(entry, turns) {
  const notes = [];
  // A recharge only matters once a second use is needed.
  const recharging = entry.plan?.kind === "recharge" && turns === entry.uses;
  if (entry.plan?.code && !recharging) notes.push(t(`matchups.plan.${entry.plan.code}`));
  if (Number.isFinite(entry.uses) && Number.isFinite(turns) && turns !== entry.uses) notes.push(t("matchups.turns", { count: turns }));
  return notes;
}

// Only the move's own caveat (charge, recharge, conditional, …); the turn count is shown apart.
function raceCaveats(entry, turns) {
  const recharging = entry.plan?.kind === "recharge" && turns === entry.uses;
  return entry.plan?.code && !recharging ? [t(`matchups.plan.${entry.plan.code}`)] : [];
}

function turnsLabel(turns) {
  return Number.isFinite(turns) ? t("matchups.turnCount", { count: turns }) : t("matchups.noKoTurns");
}

function exclusionLabel(entry) {
  // Codes come from raceExclusion in src/data/matchups.js.
  if (entry.reasonCode === "unsupported") return formatDamageReason(entry.reason, getLocale());
  return t(`matchups.excluded.${entry.reasonCode || "missing"}`);
}

// ---------- formatting ----------

function rangeLabel(entry) {
  return `${entry.minPercent}–${entry.maxPercent}%`;
}

function percentLabel(fraction) {
  return `${Math.round((Number(fraction) || 0) * 100)}%`;
}

function usageLabel(usagePercent) {
  return `${(Number(usagePercent) || 0).toFixed(1)}%`;
}

function signed(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

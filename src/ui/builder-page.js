import {
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
} from "../data/catalog.js";
import {
  activeSetFromState,
  applyActiveSet,
  createActiveSetStore,
  planActiveSetRefresh,
} from "../data/active-set.js";
import {
  breakPoints,
  rankBreakPointPokemonGroups,
  yourDamageAnalysis,
} from "../data/break-points.js";
import {
  bulkBaseline,
  bulkCoverage,
  bulkCoverageTable,
  bulkPointMatchups,
  generalBulkRecommendation,
  koHitCount,
  rankBulkCoverageGroups,
} from "../data/bulk-points.js";
import { megaFamilyId } from "../data/pokemon.js";
import { createThreatPreferencesStore } from "../data/threat-preferences.js";
import { mergeThreatLists, threatForPokemon, threatList } from "../data/threats.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { STAT_KEYS } from "../engine/constants.js";
import { createField } from "../engine/field.js";
import { NATURES } from "../engine/natures.js";
import {
  getLocale,
  initI18n,
  localizedName,
  localizedNatureDropdownLabel,
  localizedTerm,
  onLocaleChange,
  translateSubtree,
  t,
} from "../i18n.js";
import { formatKoText } from "../i18n-formatters.js";
import { applyControl } from "./battle-state.js";
import { loadCatalogs, rankByUsage, requestedPokemonStatus } from "./bootstrap.js";
import { restoreBuilderCardFocus } from "./builder-focus.js";
import {
  analysisRenderKey,
  analysisSignature,
  applyGlobalThreatStatus,
  applyThreatControl,
  availableBulkSpBudget,
  breakAnalysisContextSignature,
  breakCoverage,
  bulkAnalysisContextSignature,
  bulkTableContextSignature,
  canApplySpTargets,
  createAnalysisMemo,
  createBuilderState,
  detachFamilyForms,
  partitionBulkCoverageGroups,
  selectBuilderAnalysis,
  selectBuilderSort,
  significantBreakPoints,
  threatAnalysisSignature,
} from "./builder-state.js";
import {
  attachCombobox,
  browserStorage,
  consumeQueryParam,
  damagePercentColor,
  optionElement,
  pokemonMiniSprite,
  pokemonSearchMatchers,
  searchResultButton,
  STAT_LABELS,
} from "./components.js";
import { mountAmbientFieldControls } from "./field-controls.js";
import { mountSetSheet, mountSheetBar } from "./set-sheet.js";
import { applyAmbientFieldControl } from "./field-state.js";
import { createDeferredUpdater, createLiveUpdater } from "./live-update.js";
import { watchActiveSet } from "./active-set-sync.js";
import { moveOptionsForSlot } from "./move-conditions.js";
import { SET_SP_LIMIT, mountSetEditor, setEditorMoves, spSpent, statusOptions } from "./set-editor.js";

const elements = {
  source: document.querySelector("#builder-source"),
  applySpread: document.querySelector("#builder-apply-spread"),
  ambientField: document.querySelector("#builder-ambient-field"),
  threatCount: document.querySelector("#builder-threat-count"),
  threatStatus: document.querySelector("#builder-threat-status"),
  threatSearch: document.querySelector("#builder-threat-search"),
  threatResults: document.querySelector("#builder-threat-results"),
  threatSummary: document.querySelector("#builder-threat-summary"),
  customThreats: document.querySelector("#builder-custom-threats"),
  speedLink: document.querySelector("#builder-speed-link"),
  matchupsLink: document.querySelector("#builder-matchups-link"),
  sortToolbar: document.querySelector("#builder-sort-toolbar"),
  sortToggle: document.querySelector("#builder-sort-toggle"),
  analysisTabs: [...document.querySelectorAll("[data-builder-analysis]")],
  bulkPanel: document.querySelector("#builder-bulk-panel"),
  breakPanel: document.querySelector("#builder-break-panel"),
  bulkCount: document.querySelector("#bulk-count"),
  generalBulk: document.querySelector("#builder-general-bulk"),
  bulkPoints: document.querySelector("#bulk-points"),
  breakCount: document.querySelector("#break-count"),
  breakPoints: document.querySelector("#break-points"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let state = createBuilderState();
const activeSetStore = createActiveSetStore(browserStorage());
const threatPreferencesStore = createThreatPreferencesStore(browserStorage());
let customThreats = [];
let userSetupDraft = null;
let unavailableRequestId = "";
const threatOverrides = new Map();
const expandedCards = new Set();
const openAnalysisPanels = new Set();
// Analyses are memoized per threat under a context signature (user, field, budget); see
// builder-state.js. Only the visible tab is computed synchronously; the hidden tab is warmed
// in small time slices afterwards so switching tabs reuses its results.
const bulkMatchupMemo = createAnalysisMemo();
const bulkTableMemo = createAnalysisMemo();
const bulkBaselineMemo = createAnalysisMemo();
const breakMemo = createAnalysisMemo();
const renderedAnalysisKeys = { bulk: "", break: "" };
let warmGeneration = 0;
const updatePage = createLiveUpdater(render);
// Phones edit the set in a bottom sheet. Setup edits are staged until "Apply spread", so closing
// the sheet applies them: the results the sheet's button promises are then up to date.
const setSheet = mountSetSheet({
  editor: document.querySelector("#builder-editor"),
  id: "builder-set-sheet",
  doneKey: "sheet.viewResults",
  summaryHost: document.querySelector("#builder-summary-card"),
  onClose: () => applyUserSetup(),
});
const sheetBar = mountSheetBar({ actions: [{ sheet: setSheet, labelKey: "sheet.editSet" }], withStatus: true });
const setEditor = mountSetEditor(document.querySelector("#builder-set-editor"), {
  prefix: "builder",
  getCatalogs: () => catalogs,
  getSetup: () => userSetupDraft?.current() ?? state.user,
  onPokemonSelect: (pokemon) => {
    unavailableRequestId = "";
    renderStatus();
    seedPokemon(pokemon);
  },
  onControl: handleSetupControl,
});
const ambientFieldControls = mountAmbientFieldControls(elements.ambientField, {
  namePrefix: "builder",
  onChange: handleAmbientFieldControl,
});
ambientFieldControls.sync(state.field);

initI18n();
initializeAnalysisTabs();
initialize();

onLocaleChange(() => {
  if (!catalogs) return;
  renderStatus();
  if (state.user) render({ refreshPicks: true });
});

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;

  state = { ...state, threatCount: threatPreferencesStore.readThreatCount() };
  attachCombobox({
    input: elements.threatSearch,
    resultsEl: elements.threatResults,
    ...pokemonSearchMatchers(() => catalogs),
    onSelect: addCustomThreat,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });

  elements.applySpread.addEventListener("click", applyUserSetup);
  elements.threatCount.addEventListener("input", handleThreatCount);
  elements.threatStatus.addEventListener("input", handleThreatStatus);

  // `?pokemon=` is a one-off hand-off: consume it so a reload restores the saved active set.
  const requestedId = consumeQueryParam("pokemon");
  const requested = requestedId
    ? catalogs.pokemon.find(({ id }) => normalizeId(id) === normalizeId(requestedId))
    : undefined;
  unavailableRequestId = requestedId && !requested ? requestedId : "";
  renderStatus();
  const activeSet = activeSetStore.readSet();
  const activePokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === activeSet?.pokemonId);
  const defaultThreat = threatList(catalogs.pokemon, { count: 1, moveLookup: catalogs.moveLookup })[0];
  const initialPokemon = requested ?? activePokemon ?? defaultThreat?.pokemon ?? catalogs.pokemon[0];
  seedPokemon(initialPokemon, {
    activeSet: activeSet?.pokemonId === normalizeId(initialPokemon?.id) ? activeSet : null,
  });
  watchActiveSet(refreshFromActiveSet);
}

function renderStatus() {
  elements.status.textContent = requestedPokemonStatus(catalogs, unavailableRequestId);
}

function initializeAnalysisTabs() {
  elements.sortToggle.addEventListener("click", toggleAnalysisSort);
  for (const tab of elements.analysisTabs) {
    tab.addEventListener("click", () => activateAnalysisTab(tab.dataset.builderAnalysis));
    tab.addEventListener("keydown", handleAnalysisTabKeydown);
  }
  renderAnalysisTabs();
}

function toggleAnalysisSort() {
  updatePage(() => {
    const nextSort = state.analysisSort === "breakpoint" ? "default" : "breakpoint";
    state = selectBuilderSort(state, nextSort);
  });
}

function activateAnalysisTab(analysisTab, { focus = false } = {}) {
  updatePage(() => {
    state = selectBuilderAnalysis(state, analysisTab);
  }, { focusAnalysisTab: focus });
}

function handleAnalysisTabKeydown(event) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) return;
  event.preventDefault();
  const currentIndex = elements.analysisTabs.indexOf(event.currentTarget);
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? elements.analysisTabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + elements.analysisTabs.length) %
        elements.analysisTabs.length;
  activateAnalysisTab(elements.analysisTabs[nextIndex].dataset.builderAnalysis, { focus: true });
}

function renderAnalysisTabs() {
  const breakpointSort = state.analysisSort === "breakpoint";
  elements.sortToolbar.hidden = state.analysisTab === "bulk";
  elements.sortToggle.textContent = t(
    breakpointSort ? "builder.sortBreakpoint" : "builder.sortDefault",
  );
  elements.sortToggle.setAttribute("aria-pressed", String(breakpointSort));
  for (const tab of elements.analysisTabs) {
    const selected = tab.dataset.builderAnalysis === state.analysisTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  elements.bulkPanel.hidden = state.analysisTab !== "bulk";
  elements.breakPanel.hidden = state.analysisTab !== "break";
}


function seedPokemon(pokemon, { activeSet = null } = {}) {
  if (!pokemon) return;
  resetUserSetupDraft();
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    items: catalogs.items,
  });
  updatePage(() => {
    state = createBuilderState(pokemon, defaults, {
      threatCount: state.threatCount,
      threatStatus: state.threatStatus,
      analysisTab: state.analysisTab,
      analysisSort: state.analysisSort,
      field: state.field,
    });
    if (activeSet) {
      state = {
        ...state,
        user: applyActiveSet(state.user, activeSet, {
          abilityLookup: catalogs.abilityLookup,
          itemLookup: catalogs.itemLookup,
        }),
      };
    }
  }, { refreshPicks: true });
}

// Another page or tab changed the shared set (or Back restored this page): show the stored set.
// The shared set wins over unapplied edits here, which were staged against the old set.
function refreshFromActiveSet() {
  if (!catalogs || !state.user) return;
  const stored = activeSetStore.readSet();
  const plan = planActiveSetRefresh(stored, activeSetFromState(state.user));
  if (plan === "none") return;
  const pokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === stored.pokemonId);
  if (!pokemon) return;
  if (plan === "seed") {
    seedPokemon(pokemon, { activeSet: stored });
    return;
  }
  resetUserSetupDraft();
  updatePage(() => {
    state = {
      ...state,
      user: applyActiveSet(state.user, stored, {
        abilityLookup: catalogs.abilityLookup,
        itemLookup: catalogs.itemLookup,
      }),
    };
  }, { refreshPicks: true });
}

// Setup edits are staged until "Apply spread"; a crit toggle applies at once, as before.
function handleSetupControl(control) {
  if (!state.user) return;
  if (control.kind === "crit") {
    updatePage(() => {
      if (userSetupDraft) userSetupDraft.stage((current) => applyControl(current, control));
      state = { ...state, user: applyControl(state.user, control) };
    });
    return;
  }
  const setup = stageUserSetup(control);
  renderSheetStatus(setup.sp);
}

function stageUserSetup(control) {
  if (!userSetupDraft) {
    userSetupDraft = createDeferredUpdater(state.user, (setup) => {
      userSetupDraft = null;
      updatePage(() => {
        state = { ...state, user: setup };
      }, { refreshMoves: true });
    });
  }
  const setup = userSetupDraft.stage((current) => applyControl(current, control));
  elements.applySpread.disabled = false;
  return setup;
}

function applyUserSetup() {
  userSetupDraft?.apply();
}

function resetUserSetupDraft() {
  userSetupDraft = null;
  elements.applySpread.disabled = true;
}

function handleThreatCount(event) {
  const threatCount = threatPreferencesStore.writeThreatCount(event.target.value);
  updatePage(() => {
    state = { ...state, threatCount };
  });
  event.target.value = String(threatCount);
}

function handleThreatStatus(event) {
  updatePage(() => {
    state = { ...state, threatStatus: event.target.value };
  });
}

function handleAmbientFieldControl(control) {
  updatePage(() => {
    state = {
      ...state,
      field: applyAmbientFieldControl(state.field, control),
    };
  });
}

function addCustomThreat(pokemon) {
  if (!pokemon) return;
  const alreadyCustom = customThreats.some(({ pokemon: entry }) =>
    normalizeId(entry.id) === normalizeId(pokemon.id));
  updatePage(() => {
    if (!alreadyCustom) {
      customThreats = [...customThreats, threatForPokemon(pokemon, {
        abilityLookup: catalogs.abilityLookup,
        items: catalogs.items,
        moveLookup: catalogs.moveLookup,
      })];
    }
    elements.threatSearch.value = "";
  });
}

function removeCustomThreat(id) {
  updatePage(() => {
    const threatId = normalizeId(id);
    customThreats = customThreats.filter(({ pokemon }) =>
      normalizeId(pokemon.id) !== threatId);
    threatOverrides.delete(threatId);
    deletePanelKeysForPokemon(expandedCards, threatId);
    deletePanelKeysForPokemon(openAnalysisPanels, threatId);
  });
}

function render({ refreshPicks = false, refreshMoves = false, focusKey = "", focusAnalysisTab = false } = {}) {
  const user = state.user;
  if (!user) return;
  if (refreshPicks) setEditor.renderOptions();
  else if (refreshMoves) setEditor.renderMoves();
  activeSetStore.writeSet(activeSetFromState(user));
  const displayedSetup = userSetupDraft?.current() ?? user;
  setEditor.render();
  elements.threatCount.value = String(state.threatCount);
  elements.threatStatus.value = state.threatStatus;
  ambientFieldControls.sync(state.field);
  elements.threatSummary.textContent = t("builder.topCustom", { top: state.threatCount, custom: customThreats.length });
  elements.source.textContent = t("builder.source", { top: state.threatCount, custom: customThreats.length });
  elements.speedLink.href = `./speed.html?pokemon=${encodeURIComponent(user.pokemon.id)}`;
  elements.matchupsLink.href = `./matchups.html?pokemon=${encodeURIComponent(user.pokemon.id)}`;
  renderAnalysisTabs();

  renderSheetStatus(displayedSetup.sp);
  setSheet.update({
    pokemon: user.pokemon,
    meta: [
      localizedTerm("nature", user.nature),
      user.item ? localizedName(user.item) : t("builder.noItem"),
    ].join(" · "),
  });
  elements.applySpread.disabled = !userSetupDraft;
  renderCustomThreats();
  const inputs = analysisInputs();
  elements.breakCount.textContent = t("builder.breakCount", {
    pokemon: inputs.threats.length,
    moves: inputs.breakMoves.length,
  });
  if (state.analysisTab === "bulk") {
    renderBulkPoints(inputs);
    warmHiddenAnalysis(breakWarmTasks(inputs));
  } else {
    renderBreakPoints(inputs);
    renderHiddenBulkCount(inputs);
  }
  translateSubtree(
    elements.customThreats,
    elements.bulkPanel,
    elements.breakPanel,
  );
  const analysisPanel = state.analysisTab === "bulk" ? elements.bulkPanel : elements.breakPanel;
  restoreBuilderCardFocus(analysisPanel, focusKey, {
    onOpenPanel: (panelKey) => openAnalysisPanels.add(panelKey),
  });
  if (focusAnalysisTab) {
    elements.analysisTabs.find((tab) => tab.dataset.builderAnalysis === state.analysisTab)?.focus();
  }
}

function analysisInputs() {
  const user = state.user;
  const threats = selectedThreats();
  const field = createField(state.field);
  return {
    user,
    threats,
    field,
    budget: availableBulkSpBudget(user.sp),
    breakMoves: selectedMoves(user).filter(({ category }) =>
      category === "Physical" || category === "Special"),
    bulkContext: bulkAnalysisContextSignature(user, field),
    bulkTableContext: bulkTableContextSignature(user, field),
    breakContext: breakAnalysisContextSignature(user, field),
    bulkThreatKeys: threats.map((threat) => threatAnalysisSignature(threat, "bulk")),
    breakThreatKeys: threats.map((threat) => threatAnalysisSignature(threat, "break")),
  };
}

// Runs memo-filling tasks in short slices after the visible tab has rendered. A newer render
// bumps the generation, which stops an outdated warm-up; results are keyed by their full input
// signature, so anything already computed stays valid.
function warmHiddenAnalysis(tasks, onDone) {
  const generation = ++warmGeneration;
  if (tasks.length === 0) {
    onDone?.();
    return;
  }
  let index = 0;
  const step = () => {
    if (generation !== warmGeneration) return;
    const deadline = performance.now() + 8;
    while (index < tasks.length) {
      tasks[index]();
      index += 1;
      if (performance.now() >= deadline) break;
    }
    if (index < tasks.length) setTimeout(step, 0);
    else onDone?.();
  };
  setTimeout(step, 0);
}

function renderHiddenBulkCount(inputs) {
  const pending = inputs.threats
    .map((threat, index) => ({ threat, threatKey: inputs.bulkThreatKeys[index] }))
    .filter(({ threatKey }) => !bulkMatchupMemo.has(inputs.bulkContext, threatKey));
  if (pending.length > 0) elements.bulkCount.textContent = "—";
  warmHiddenAnalysis(
    pending.map(({ threat, threatKey }) => () => bulkThreatResult(inputs, threat, threatKey)),
    () => {
      const results = inputs.threats.map((threat, index) =>
        bulkThreatResult(inputs, threat, inputs.bulkThreatKeys[index]));
      renderBulkCount(results);
    },
  );
}

function breakWarmTasks(inputs) {
  if (inputs.breakMoves.length === 0) return [];
  return inputs.threats
    .map((threat, index) => ({ threat, threatKey: inputs.breakThreatKeys[index] }))
    .filter(({ threatKey }) => !breakMemo.has(inputs.breakContext, threatKey))
    .map(({ threat, threatKey }) => () => breakThreatResult(inputs, threat, threatKey));
}

function renderSheetStatus(sp) {
  const spent = spSpent(sp);
  sheetBar.setStatus(
    t("matchups.spShort", { count: spent, limit: SET_SP_LIMIT }),
    spent > SET_SP_LIMIT ? "over" : spent === SET_SP_LIMIT ? "ok" : "",
  );
}

function builderMoves() {
  return setEditorMoves(state.user.pokemon, catalogs.moveLookup);
}

function selectedMoves(setup = state.user) {
  const lookup = new Map(builderMoves().map((move) => [normalizeId(move.id), move]));
  return setup.selectedMoveIds
    .map((id, index) => {
      const move = lookup.get(normalizeId(id));
      return move ? { ...move, slotIndex: index } : null;
    })
    .filter(Boolean);
}

function selectedThreats() {
  const popularThreats = threatList(catalogs.pokemon, {
    count: state.threatCount,
    abilityLookup: catalogs.abilityLookup,
    includeMegas: true,
    items: catalogs.items,
    moveLookup: catalogs.moveLookup,
  });
  const threats = mergeThreatLists(popularThreats, customThreats).map((threat) =>
    threatOverrides.get(normalizeId(threat.pokemon.id)) ?? threat);
  return applyGlobalThreatStatus(threats, state.threatStatus);
}

function renderCustomThreats() {
  elements.customThreats.replaceChildren(...customThreats.map(({ pokemon }) => {
    const chip = document.createElement("span");
    chip.className = "builder-threat-chip";
    chip.append(pokemonMiniSprite(pokemon));
    const name = document.createElement("span");
    name.textContent = localizedName(pokemon);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", t("builder.remove", { name: localizedName(pokemon) }));
    remove.addEventListener("click", () => removeCustomThreat(pokemon.id));
    chip.append(name, remove);
    return chip;
  }));
}

function renderBulkPoints(inputs) {
  const { user, threats, budget } = inputs;
  const renderKey = analysisRenderKey({
    context: inputs.bulkContext,
    threatKeys: inputs.bulkThreatKeys,
    locale: getLocale(),
  });
  const results = threats.map((threat, index) =>
    bulkThreatResult(inputs, threat, inputs.bulkThreatKeys[index]));
  renderBulkCount(results);
  if (renderedAnalysisKeys.bulk === renderKey) return;
  renderedAnalysisKeys.bulk = renderKey;

  renderGeneralBulkRecommendation(generalBulkRecommendation(user, { budget }));
  const resultsByThreat = new Map(threats.map((threat, index) => [threat, results[index]]));
  const families = threatFamilies(threats).map((family) => ({
    ...family,
    forms: family.forms
      .map((threat) => ({ threat, ...resultsByThreat.get(threat) }))
      .filter(({ matchups }) => matchups.length > 0),
  })).filter(({ forms }) => forms.length > 0);
  const forms = rankBulkCoverageGroups(detachFamilyForms(families));
  const sections = partitionBulkCoverageGroups(forms);

  elements.bulkPoints.replaceChildren(
    ...(forms.length === 0
      ? [emptyText(t("builder.noThreatMoves"))]
      : ["possible", "covered", "unreachable"]
        .filter((status) => sections[status].length > 0)
        .map((status) => coverageSection(sections[status], status, "bulk", bulkThreatCards))),
  );
}

function renderBulkCount(results) {
  const matchupCount = results.reduce((total, { matchups }) => total + matchups.length, 0);
  const spreadCount = results.reduce((total, { matchups }) =>
    total + matchups.reduce((sum, { points }) => sum + points.length, 0), 0);
  elements.bulkCount.textContent = t("builder.bulkCount", {
    spreads: spreadCount,
    matchups: matchupCount,
  });
}

// One threat's defensive matchups and coverage, memoized by the bulk context and threat.
function bulkThreatResult(inputs, threat, threatKey) {
  const { user, field, budget } = inputs;
  return bulkMatchupMemo.get(inputs.bulkContext, threatKey, () => {
    // Zero-bulk baselines and coverage tables ignore the user's HP/Def/SpD SP, so they are
    // shared across defensive SP edits.
    const scenarioKey = (scenario) => `${threatKey}:${analysisSignature(scenario.move)}`;
    const baseline = (scenario) => bulkBaselineMemo.get(
      `${inputs.bulkTableContext}:${budget}`,
      scenarioKey(scenario),
      () => bulkBaseline(user, scenario, { budget, field }),
    );
    const matchups = bulkPointMatchups(user, [threat], { budget, field, baseline });
    if (matchups.length === 0) return { matchups, coverage: null };
    const tables = matchups.map((matchup) => bulkTableMemo.get(
      inputs.bulkTableContext,
      scenarioKey(matchup.scenario),
      () => bulkCoverageTable(user, matchup),
    ));
    return { matchups, coverage: bulkCoverage(user, matchups, { budget, tables }) };
  });
}

function renderGeneralBulkRecommendation(recommendation) {
  if (!recommendation || recommendation.addedSp <= 0) {
    elements.generalBulk.hidden = true;
    elements.generalBulk.replaceChildren();
    return;
  }

  const heading = document.createElement("div");
  heading.className = "builder-general-bulk-heading";
  const title = document.createElement("strong");
  title.id = "builder-general-bulk-title";
  title.textContent = t("builder.generalBulkTitle");
  heading.append(
    title,
    textSpan(
      t("builder.unassignedSp", { count: recommendation.addedSp }),
      "builder-general-bulk-count",
    ),
  );

  const spreads = document.createElement("div");
  spreads.className = "builder-general-bulk-spreads";
  spreads.append(
    generalBulkStatGroup(t("builder.recommendedSp"), recommendation.sp),
    generalBulkStatGroup(t("builder.finalBulkStats"), recommendation.stats),
  );

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "builder-apply-button";
  apply.textContent = t("builder.applyRecommendation");
  apply.addEventListener("click", () => {
    resetUserSetupDraft();
    updatePage(() => {
      state = {
        ...state,
        user: {
          ...state.user,
          sp: { ...state.user.sp, ...recommendation.sp },
        },
      };
    });
  });

  elements.generalBulk.replaceChildren(
    heading,
    textSpan(t("builder.generalBulkDescription"), "builder-general-bulk-description"),
    spreads,
    apply,
  );
  elements.generalBulk.hidden = false;
}

function generalBulkStatGroup(label, values) {
  const group = document.createElement("div");
  group.className = "builder-general-bulk-stat-group";
  group.append(
    textSpan(label, "builder-general-bulk-stat-label"),
    ...["hp", "def", "spd"].map((stat) =>
      statChip(localizedTerm("stat", STAT_LABELS[stat]), values[stat])),
  );
  return group;
}

function threatFamilies(threats) {
  const families = new Map();
  for (const threat of threats) {
    const familyId = megaFamilyId(threat.pokemon);
    if (!families.has(familyId)) families.set(familyId, { forms: [] });
    families.get(familyId).forms.push(threat);
  }
  return [...families.values()];
}

function bulkThreatCards(forms) {
  return forms.map(({ threat, matchups: formMatchups, relatedForms }) => {
    const threatId = normalizeId(threat.pokemon.id);
    const cardKey = `bulk:${threatId}`;
    return analysisCard({
      threat,
      renderMovePanels: () => formMatchups.map((matchup) =>
        bulkMovePanel(matchup, bulkPanelKey(matchup))),
      relatedForms,
      analysis: "bulk",
    }, cardKey);
  });
}

function bulkPanelKey({ scenario }) {
  return `bulk:${normalizeId(scenario.threat.pokemon.id)}:${normalizeId(scenario.move.id)}`;
}

function coverageSection(forms, status, analysis, renderCards) {
  const collapsible = status !== "possible";
  const panelKey = `${analysis}:coverage:${status}`;
  const matchupCount = forms.reduce((count, form) =>
    count + (analysis === "bulk" ? form.matchups.length : form.analyses.length), 0);
  const section = document.createElement(collapsible ? "details" : "section");
  section.className = `builder-coverage-section ${status}`;
  section.dataset.analysisPanelKey = panelKey;
  if (collapsible) {
    section.classList.add("builder-more-detail");
    section.open = openAnalysisPanels.has(panelKey);
  }
  const heading = document.createElement(collapsible ? "summary" : "div");
  heading.className = "builder-coverage-heading";
  heading.append(
    textSpan(t(`builder.coverage.${status}`), "builder-coverage-title"),
    textSpan(t("builder.coverageCount", {
      cards: forms.length,
      matchups: matchupCount,
    }), "builder-coverage-count"),
  );
  const cards = document.createElement("div");
  cards.className = "builder-analysis-grid";
  cards.append(...renderCards(forms));
  if (collapsible) {
    section.addEventListener("toggle", () => setPanelOpen(panelKey, section.open));
  }
  section.append(heading, cards);
  return section;
}

function bulkMovePanel(
  { scenario, baselineDamage, baselinePoints, damage, points, covered },
  panelKey,
) {
  const defenseStat = scenario.move.overrideDefensiveStat ??
    (scenario.move.category === "Physical" ? "def" : "spd");
  return analysisMovePanel({
    panelKey,
    move: scenario.move,
    damage,
    defensive: true,
    covered,
    emptyMessage: t("builder.noSurvival"),
    loadContext: () => bulkMoveContext({
      baselineDamage,
      baselinePoints,
      damage,
      defenseStat,
    }),
    loadChoices: () => points.map((point) => spreadChoice({
      label: t("builder.totalSp", { count: point.totalSp }),
      stats: [
        ["HP", point.hpSp],
        [localizedTerm("stat", STAT_LABELS[defenseStat]), point.defSp],
      ],
      fromKoText: point.fromKoText,
      toKoText: point.koText,
      damageText: t("builder.maxDamage", { value: point.maxPct }),
      canApply: canApplySpTargets(state.user.sp, {
        hp: point.hpSp,
        [defenseStat]: point.defSp,
      }),
      onSelect: () => {
        resetUserSetupDraft();
        updatePage(() => {
          state = {
            ...state,
            user: {
              ...state.user,
              sp: {
                ...state.user.sp,
                hp: point.hpSp,
                [defenseStat]: point.defSp,
              },
            },
          };
        }, { refreshMoves: true });
      },
    })),
  });
}

function bulkMoveContext({ baselineDamage, baselinePoints, damage, defenseStat }) {
  const context = document.createElement("div");
  context.className = "builder-bulk-context";
  const comparison = document.createElement("div");
  comparison.className = "builder-bulk-comparison";
  comparison.append(
    bulkDamageComparison(t("builder.zeroBulk"), baselineDamage),
    bulkDamageComparison(t("builder.currentSpread"), damage),
  );
  context.append(comparison);

  const currentHits = koHitCount(damage.koText);
  const coveredPoint = baselinePoints.find((point) =>
    koHitCount(point.koText) <= currentHits);
  if (coveredPoint) {
    const frontier = document.createElement("div");
    frontier.className = "builder-covered-frontier";
    const heading = document.createElement("div");
    heading.className = "builder-spread-heading";
    heading.append(
      textSpan(t("builder.coveredThreshold"), "builder-spread-label"),
      textSpan(t("builder.totalSp", { count: coveredPoint.totalSp }), "builder-coverage-count"),
    );
    const stats = document.createElement("div");
    stats.className = "builder-spread-stats";
    stats.append(
      statChip("HP", coveredPoint.hpSp),
      statChip(localizedTerm("stat", STAT_LABELS[defenseStat]), coveredPoint.defSp),
    );
    const shift = document.createElement("div");
    shift.className = "builder-tier-shift";
    shift.append(
      koBadge(formatKoText(baselineDamage.koText, getLocale()), { muted: true }),
      textSpan("→", "builder-tier-arrow"),
      koBadge(formatKoText(coveredPoint.koText, getLocale())),
    );
    frontier.append(heading, stats, shift);
    context.append(frontier);
  }
  return context;
}

function bulkDamageComparison(label, damage) {
  const row = document.createElement("div");
  row.className = "builder-bulk-comparison-row";
  row.append(
    textSpan(label, "builder-bulk-comparison-label"),
    textSpan(`${damage.minPct}–${damage.maxPct}%`, "builder-damage-percent"),
    koBadge(formatKoText(damage.koText, getLocale())),
  );
  return row;
}

function statChip(stat, value) {
  const chip = document.createElement("span");
  chip.append(textSpan(stat, "builder-spread-stat-name"), document.createTextNode(` ${value}`));
  return chip;
}

function renderBreakPoints(inputs) {
  const { threats, breakMoves: moves } = inputs;
  const renderKey = analysisRenderKey({
    context: inputs.breakContext,
    threatKeys: inputs.breakThreatKeys,
    sort: state.analysisSort,
    locale: getLocale(),
  });
  if (renderedAnalysisKeys.break === renderKey) return;
  renderedAnalysisKeys.break = renderKey;
  if (threats.length === 0) {
    elements.breakPoints.replaceChildren(emptyText(t("builder.addThreat")));
    return;
  }
  if (moves.length === 0) {
    elements.breakPoints.replaceChildren(emptyText(t("builder.chooseDamageMove")));
    return;
  }

  const groups = threatFamilies(threats).map((family) => ({
    ...family,
    forms: family.forms.map((threat) => ({
      threat,
      ...breakThreatResult(inputs, threat, inputs.breakThreatKeys[threats.indexOf(threat)]),
    })),
  }));
  const detachedForms = detachFamilyForms(groups);
  const orderedForms = state.analysisSort === "breakpoint"
    ? rankBreakPointPokemonGroups(detachedForms)
    : detachedForms;
  const sections = partitionBulkCoverageGroups(orderedForms);
  elements.breakPoints.replaceChildren(
    ...["possible", "covered", "unreachable"]
      .filter((status) => sections[status].length > 0)
      .map((status) => coverageSection(sections[status], status, "break", breakThreatCards)),
  );
}

// One threat's offensive analyses and coverage, memoized by the break context and threat.
function breakThreatResult(inputs, threat, threatKey) {
  const { user: setup, field, breakMoves: moves } = inputs;
  return breakMemo.get(inputs.breakContext, threatKey, () => {
    const scenarios = moves.map((move) => ({
      threat, field, critical: Boolean(setup.critMoves?.[move.slotIndex]),
      moveOptions: moveOptionsForSlot(setup, move.slotIndex, move),
    }));
    const analyses = moves.map((move, index) => ({
      move,
      ...yourDamageAnalysis(setup, move, scenarios[index]),
      points: breakPoints(setup, move, scenarios[index]),
    }));
    return { analyses, coverage: breakCoverage(setup, analyses) };
  });
}

function breakThreatCards(forms) {
  return forms.map(({ threat, analyses, relatedForms }) => {
    const threatId = normalizeId(threat.pokemon.id);
    const cardKey = `break:${threatId}`;
    return analysisCard({
      threat,
      renderMovePanels: () => analyses.map((analysis, index) => {
        const panelKey = `${cardKey}:${threatId}:${normalizeId(analysis.move.id)}:${index}`;
        return breakMovePanel(analysis, threat, panelKey);
      }),
      relatedForms,
      analysis: "break",
    }, cardKey);
  });
}

function breakMovePanel({ move, damage, points, attackStat }, threat, panelKey) {
  attackStat ??= move.overrideOffensiveStat ?? (move.category === "Physical" ? "atk" : "spa");
  return analysisMovePanel({
    panelKey,
    move,
    damage,
    emptyMessage: t("builder.noHigherKo"),
    loadChoices: () => significantBreakPoints(
      damage.koText,
      points,
    ).map((point) => {
      const nature = point.requiresPlusNature
        ? attackStat === "atk" ? "Adamant" : "Modest"
        : state.user.nature;
      return spreadChoice({
        label: point.requiresPlusNature
          ? `${localizedTerm("nature", nature)}${getLocale() === "zh-TW" ? "性格" : " nature"}`
          : `${point.sp} ${localizedTerm("stat", STAT_LABELS[attackStat])} SP`,
        stats: [
          [t("label.nature"), localizedTerm("nature", nature)],
          [localizedTerm("stat", STAT_LABELS[attackStat]), point.sp],
        ],
        fromKoText: damage.koText,
        toKoText: point.achieves,
        damageText: t("builder.damage", { min: point.minPct, max: point.maxPct }),
        canApply: canApplySpTargets(state.user.sp, { [attackStat]: point.sp }),
        onSelect: () => {
          resetUserSetupDraft();
          updatePage(() => {
            state = {
              ...state,
              user: {
                ...state.user,
                nature,
                sp: { ...state.user.sp, [attackStat]: point.sp },
              },
            };
          }, { refreshMoves: true });
        },
      });
    }),
  });
}

function analysisCard({ threat, renderMovePanels, relatedForms, analysis }, cardKey) {
  const movePanels = renderMovePanels();
  const expanded = expandedCards.has(cardKey);
  const card = document.createElement("article");
  card.className = "builder-analysis-card";
  card.id = analysisCardId(analysis, threat.pokemon);
  card.tabIndex = -1;
  card.dataset.analysisCardKey = cardKey;
  card.classList.toggle("build-open", expanded);
  const heading = document.createElement("button");
  heading.type = "button";
  heading.className = "builder-analysis-heading";
  heading.setAttribute("aria-expanded", String(expanded));
  const meta = document.createElement("span");
  meta.className = "builder-analysis-meta";
  meta.append(
    textSpan(t("builder.moveCount", { count: movePanels.length }), "builder-analysis-count"),
    textSpan(t("builder.editBuild"), "builder-analysis-edit"),
  );
  heading.append(
    pokemonLabel(threat.pokemon),
    meta,
  );
  const editor = expanded ? threatBuildEditor(threat, cardKey) : null;
  const formLinks = relatedForms.length > 1
    ? analysisFormLinks(relatedForms, analysis, threat)
    : null;
  const moves = document.createElement("div");
  moves.className = "builder-analysis-moves";
  moves.append(...movePanels);
  // Expanding only adds or removes this card's build editor; analyses are not recomputed.
  heading.addEventListener("click", () => {
    const nextExpanded = !expandedCards.has(cardKey);
    if (nextExpanded) expandedCards.add(cardKey);
    else expandedCards.delete(cardKey);
    card.classList.toggle("build-open", nextExpanded);
    heading.setAttribute("aria-expanded", String(nextExpanded));
    card.querySelector(":scope > .builder-threat-build")?.remove();
    if (nextExpanded) moves.before(threatBuildEditor(threat, cardKey));
  });
  card.append(heading, ...(formLinks ? [formLinks] : []), ...(editor ? [editor] : []), moves);
  return card;
}

function analysisFormLinks(forms, analysis, activeThreat) {
  const links = document.createElement("nav");
  links.className = "builder-form-links";
  links.setAttribute("aria-label", t("builder.relatedForms", {
    name: localizedName(forms[0].threat.pokemon),
  }));
  links.append(...forms.map(({ threat, coverage }) => {
    const formId = normalizeId(threat.pokemon.id);
    const selected = formId === normalizeId(activeThreat.pokemon.id);
    const targetId = analysisCardId(analysis, threat.pokemon);
    const link = document.createElement("a");
    link.className = "builder-form-link";
    link.href = `#${targetId}`;
    if (selected) link.setAttribute("aria-current", "true");
    link.append(pokemonLabel(threat.pokemon, { compact: true }));
    if (coverage) {
      link.append(textSpan(
        t(`builder.coverage.${coverage.status}`),
        `builder-form-status ${coverage.status}`,
      ));
    }
    link.addEventListener("click", (event) => {
      jumpToAnalysisCard(event, targetId);
    });
    return link;
  }));
  return links;
}

function analysisCardId(analysis, pokemon) {
  return `builder-${analysis}-form-${normalizeId(pokemon.id)}`;
}

function jumpToAnalysisCard(event, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  event.preventDefault();
  const coverageSection = target.closest("details.builder-coverage-section");
  if (coverageSection && !coverageSection.open) {
    openAnalysisPanels.add(coverageSection.dataset.analysisPanelKey);
    coverageSection.open = true;
  }
  target.scrollIntoView({ block: "center", inline: "nearest" });
  target.focus({ preventScroll: true });
}

function threatBuildEditor(threat, cardKey) {
  const editor = document.createElement("section");
  editor.className = "builder-threat-build";
  editor.setAttribute("aria-label", t("builder.threatBuild", { name: localizedName(threat.pokemon) }));
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "builder-apply-button";
  apply.textContent = t("builder.apply");
  apply.disabled = true;
  const applyFocusKey = `${cardKey}:apply`;
  apply.dataset.liveKey = applyFocusKey;
  const draft = createDeferredUpdater(threat, (nextThreat) => {
    commitThreatBuild(nextThreat, { cardKey, focusKey: applyFocusKey });
  });
  const stageThreatControl = (control) => {
    draft.stage((current) => applyThreatControl(current, control));
    apply.disabled = false;
  };

  const picks = document.createElement("div");
  picks.className = "builder-threat-build-picks";
  picks.append(
    threatSelect(t("label.nature"), Object.keys(NATURES).map((nature) => ({
      value: nature,
      label: localizedNatureDropdownLabel(nature),
    })), threat.nature, (value) => stageThreatControl(
      { kind: "nature", value },
    )),
    threatSelect(t("label.ability"), [
      { value: "", label: t("builder.noAbility") },
      ...rankByUsage(
        resolvePokemonAbilities(threat.pokemon, catalogs.abilityLookup),
        threat.pokemon.champions?.usage?.abilities,
      ).map((ability) => ({ value: ability.id, label: localizedName(ability) })),
    ], threat.ability?.id ?? "", (value) => stageThreatControl(
      {
        kind: "ability",
        value: catalogs.abilityLookup.get(normalizeId(value)) ?? null,
      },
    )),
    threatSelect(t("label.item"), [
      { value: "", label: t("builder.noItem") },
      ...rankByUsage(catalogs.items, threat.pokemon.champions?.usage?.items)
        .map((item) => ({ value: item.id, label: localizedName(item) })),
    ], threat.item?.id ?? "", (value) => stageThreatControl(
      {
        kind: "item",
        value: catalogs.itemLookup.get(normalizeId(value)) ?? null,
      },
    )),
  );

  const spread = document.createElement("fieldset");
  spread.className = "builder-threat-spread";
  const spreadLegend = document.createElement("legend");
  spreadLegend.textContent = "SP";
  spread.append(spreadLegend, ...["hp", "atk", "def", "spa", "spd"].map((stat) => {
    const group = stat === "atk" || stat === "spa" ? "offense" : "bulk";
    const label = document.createElement("label");
    label.textContent = localizedTerm("stat", STAT_LABELS[stat]);
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.max = "32";
    input.step = "1";
    input.value = String(threat.spPresets?.[group]?.[stat] ?? 0);
    input.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} SP`);
    input.addEventListener("input", () => stageThreatControl(
      { kind: "sp", stat, value: input.value },
    ));
    label.append(input);
    return label;
  }));

  const moveOptions = rankByUsage(
    resolveChampionsPokemonMoves(threat.pokemon, catalogs.moveLookup),
    threat.pokemon.champions?.usage?.moves,
  ).filter(({ category }) => category === "Physical" || category === "Special");
  const moves = document.createElement("fieldset");
  moves.className = "builder-threat-moves";
  const movesLegend = document.createElement("legend");
  movesLegend.textContent = t("builder.bulkMoves");
  moves.append(movesLegend, ...threat.moves.slice(0, 2).map((move, index) => {
    return threatSelect(t("battle.moveNumber", { number: index + 1 }), moveOptions.map((option) => ({
      value: option.id,
      label: localizedName(option),
    })), move.id, (value) => stageThreatControl(
      {
        kind: "move",
        index,
        value: catalogs.moveLookup.get(normalizeId(value)) ?? move,
      },
    ));
  }));

  apply.addEventListener("click", () => draft.apply());
  editor.append(picks, spread, moves, apply);
  return editor;
}

function threatSelect(labelText, options, selectedValue, onChange) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.replaceChildren(...options.map(({ value, label: optionLabel }) =>
    optionElement(value, optionLabel)));
  select.value = selectedValue;
  select.addEventListener("input", () => onChange(select.value));
  label.append(select);
  return label;
}

function commitThreatBuild(threat, { cardKey, focusKey }) {
  updatePage(() => {
    const threatId = normalizeId(threat.pokemon.id);
    threatOverrides.set(threatId, threat);
    expandedCards.add(cardKey);
  }, { focusKey });
}

function analysisMovePanel({
  panelKey,
  move,
  damage,
  defensive = false,
  covered = false,
  choices,
  loadContext,
  loadChoices,
  emptyMessage,
}) {
  const collapsible = typeof loadChoices === "function";
  const panel = document.createElement(collapsible ? "details" : "section");
  panel.className = "builder-analysis-move";
  panel.classList.toggle("covered", covered);
  if (panelKey) panel.dataset.analysisPanelKey = panelKey;
  const heading = document.createElement("div");
  heading.className = "builder-analysis-move-heading";
  const name = document.createElement("strong");
  name.textContent = localizedName(move);
  heading.append(name, koBadge(formatKoText(damage.koText, getLocale())));
  const range = document.createElement("div");
  range.className = "builder-damage-range";
  range.append(
    textSpan(`${damage.minPct}–${damage.maxPct}%`, "builder-damage-percent"),
    damageMeter(damage.minPct, damage.maxPct, { defensive }),
  );
  const list = document.createElement("div");
  list.className = "builder-spread-grid";
  if (!collapsible) {
    renderSpreadChoices(list, choices, emptyMessage);
    panel.append(heading, range, list);
    return panel;
  }

  const summary = document.createElement("summary");
  summary.className = "builder-analysis-move-summary";
  const prompt = textSpan(
    t(covered ? "builder.coveredPrompt" : "builder.viewThresholds"),
    `builder-spread-prompt${covered ? " covered" : ""}`,
  );
  summary.append(heading, range, prompt);
  panel.append(summary, list);
  let context = null;
  let loadedOpen = false;
  // Thresholds load lazily from the already computed analysis when the panel opens.
  const syncOpenContent = () => {
    if (panel.open === loadedOpen) return;
    loadedOpen = panel.open;
    context?.remove();
    context = null;
    if (!panel.open) {
      list.replaceChildren();
      prompt.textContent = t(covered ? "builder.coveredPrompt" : "builder.viewThresholds");
      return;
    }
    context = loadContext ? loadContext() : null;
    if (context) summary.after(context);
    const loadedChoices = loadChoices();
    renderSpreadChoices(list, loadedChoices, emptyMessage);
    prompt.textContent = t("builder.thresholdCount", { count: loadedChoices.length });
  };
  panel.open = openAnalysisPanels.has(panelKey);
  syncOpenContent();
  panel.addEventListener("toggle", () => {
    setPanelOpen(panelKey, panel.open);
    syncOpenContent();
  });
  return panel;
}

// Disclosure state is DOM state plus this set (so rebuilt panels reopen); no re-render needed.
function setPanelOpen(panelKey, open) {
  if (!panelKey) return;
  if (open) openAnalysisPanels.add(panelKey);
  else openAnalysisPanels.delete(panelKey);
}

function deletePanelKeysForPokemon(keys, pokemonId) {
  for (const key of keys) {
    if (key.split(":").includes(pokemonId)) keys.delete(key);
  }
}

function renderSpreadChoices(list, choices, emptyMessage) {
  list.replaceChildren(...(choices.length > 0 ? choices : [emptyText(emptyMessage)]));
}

function spreadChoice({ label, stats, fromKoText, toKoText, damageText, canApply, onSelect }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "builder-spread-choice";
  button.disabled = !canApply;
  const heading = document.createElement("span");
  heading.className = "builder-spread-heading";
  heading.append(
    textSpan(label, "builder-spread-label"),
    textSpan(
      t(canApply ? "builder.apply" : "builder.notEnoughSp"),
      canApply ? "builder-spread-apply" : "builder-spread-unavailable",
    ),
  );
  const statList = document.createElement("span");
  statList.className = "builder-spread-stats";
  statList.append(...stats.map(([stat, value]) => {
    const chip = document.createElement("span");
    chip.append(textSpan(stat, "builder-spread-stat-name"), document.createTextNode(` ${value}`));
    return chip;
  }));
  const shift = document.createElement("span");
  shift.className = "builder-tier-shift";
  shift.append(
    koBadge(formatKoText(fromKoText, getLocale()), { muted: true }),
    textSpan("→", "builder-tier-arrow"),
    koBadge(formatKoText(toKoText, getLocale())),
  );
  button.append(heading, statList, shift, textSpan(damageText, "builder-spread-damage"));
  if (canApply) button.addEventListener("click", onSelect);
  return button;
}

function koBadge(koText, { muted = false } = {}) {
  const badge = textSpan(koText, "builder-ko-badge");
  if (muted) badge.classList.add("muted");
  else if (/OHKO|一擊倒下/i.test(koText)) badge.classList.add("danger");
  else if (/2HKO|兩擊倒下/i.test(koText)) badge.classList.add("warning");
  else badge.classList.add("safe");
  return badge;
}

function damageMeter(minPct, maxPct, { defensive = false } = {}) {
  const meter = document.createElement("span");
  meter.className = "builder-damage-meter";
  const fill = document.createElement("span");
  const average = (Number(minPct) + Number(maxPct)) / 2;
  fill.style.width = `${Math.max(0, Math.min(100, average))}%`;
  fill.style.background = defensive
    ? damagePercentColor(100 - Number(maxPct), 100 - Number(minPct))
    : damagePercentColor(minPct, maxPct);
  meter.append(fill);
  return meter;
}

function pokemonLabel(pokemon, { compact = false } = {}) {
  const label = document.createElement("span");
  label.className = `builder-pokemon-label${compact ? " compact" : ""}`;
  label.append(pokemonMiniSprite(pokemon));
  const name = document.createElement("span");
  name.textContent = localizedName(pokemon);
  label.append(name);
  return label;
}

function textSpan(text, className) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function emptyText(text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  return paragraph;
}

import {
  filterMoves,
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
} from "../data/catalog.js";
import {
  activeSetFromState,
  applyActiveSet,
  createActiveSetStore,
} from "../data/active-set.js";
import { breakPoints, yourDamage } from "../data/break-points.js";
import { bulkPointMatchups } from "../data/bulk-points.js";
import { searchPokemon } from "../data/pokemon.js";
import { mergeThreatLists, threatForPokemon, threatList } from "../data/threats.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { STAT_KEYS } from "../engine/constants.js";
import { NATURES, natureOptionLabel } from "../engine/natures.js";
import { TYPE_EFFECTIVENESS } from "../engine/type-chart.js";
import {
  applyDocumentTranslations,
  getLocale,
  initI18n,
  localizedName,
  localizedNatureOptionLabel,
  localizedTerm,
  onLocaleChange,
  t,
} from "../i18n.js";
import { formatKoText } from "../i18n-formatters.js";
import { applyControl } from "./battle-state.js";
import { catalogLoadedStatus, loadCatalogs, rankByUsage } from "./bootstrap.js";
import {
  applyThreatControl,
  createBuilderState,
  finalStats,
  normalizeThreatCount,
  partitionBulkMatchups,
  selectBuilderAnalysis,
  significantBreakPoints,
} from "./builder-state.js";
import {
  attachCombobox,
  damagePercentColor,
  ensureRenderedRows,
  optionElement,
  pokemonSpriteUrls,
  searchResultButton,
  STAT_LABELS,
} from "./components.js";
import { createLiveUpdater } from "./live-update.js";

const elements = {
  source: document.querySelector("#builder-source"),
  summary: document.querySelector("#builder-summary"),
  pokemonSearch: document.querySelector("#builder-pokemon-search"),
  pokemonResults: document.querySelector("#builder-pokemon-results"),
  nature: document.querySelector("#builder-nature"),
  ability: document.querySelector("#builder-ability"),
  item: document.querySelector("#builder-item"),
  tera: document.querySelector("#builder-tera"),
  stats: document.querySelector("#builder-stats"),
  spBudget: document.querySelector("#builder-sp-budget"),
  movePicks: document.querySelector("#builder-move-picks"),
  threatCount: document.querySelector("#builder-threat-count"),
  threatSearch: document.querySelector("#builder-threat-search"),
  threatResults: document.querySelector("#builder-threat-results"),
  threatSummary: document.querySelector("#builder-threat-summary"),
  customThreats: document.querySelector("#builder-custom-threats"),
  speedLink: document.querySelector("#builder-speed-link"),
  analysisTabs: [...document.querySelectorAll("[data-builder-analysis]")],
  bulkPanel: document.querySelector("#builder-bulk-panel"),
  breakPanel: document.querySelector("#builder-break-panel"),
  bulkCount: document.querySelector("#bulk-count"),
  bulkPoints: document.querySelector("#bulk-points"),
  breakCount: document.querySelector("#break-count"),
  breakPoints: document.querySelector("#break-points"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let state = createBuilderState();
const activeSetStore = createActiveSetStore(browserStorage());
let moveComboboxCleanups = [];
let customThreats = [];
const threatOverrides = new Map();
const expandedCards = new Set();
const openAnalysisPanels = new Set();
const updatePage = createLiveUpdater(render);

initI18n();
initializeAnalysisTabs();
initialize();

onLocaleChange(() => {
  if (!catalogs) return;
  elements.status.textContent = catalogLoadedStatus(catalogs);
  renderLocaleOptions();
  if (state.user) {
    renderPicks();
    render();
  }
});

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;

  renderLocaleOptions();

  attachCombobox({
    input: elements.pokemonSearch,
    resultsEl: elements.pokemonResults,
    getMatches: pokemonMatches,
    onSelect: seedPokemon,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });
  attachCombobox({
    input: elements.threatSearch,
    resultsEl: elements.threatResults,
    getMatches: pokemonMatches,
    onSelect: addCustomThreat,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });

  for (const control of [elements.nature, elements.ability, elements.item, elements.tera]) {
    control.addEventListener("input", handlePick);
  }
  elements.stats.addEventListener("input", handleSpInput);
  elements.threatCount.addEventListener("input", handleThreatCount);
  elements.threatCount.addEventListener("change", handleThreatCount);

  const requestedId = new URLSearchParams(globalThis.location?.search ?? "").get("pokemon");
  const requested = catalogs.pokemon.find(({ id }) => normalizeId(id) === normalizeId(requestedId));
  const activeSet = activeSetStore.readSet();
  const activePokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === activeSet?.pokemonId);
  const defaultThreat = threatList(catalogs.pokemon, { count: 1, moveLookup: catalogs.moveLookup })[0];
  const initialPokemon = requested ?? activePokemon ?? defaultThreat?.pokemon ?? catalogs.pokemon[0];
  seedPokemon(initialPokemon, {
    activeSet: activeSet?.pokemonId === normalizeId(initialPokemon?.id) ? activeSet : null,
  });
}

function initializeAnalysisTabs() {
  for (const tab of elements.analysisTabs) {
    tab.addEventListener("click", () => activateAnalysisTab(tab.dataset.builderAnalysis));
    tab.addEventListener("keydown", handleAnalysisTabKeydown);
  }
  renderAnalysisTabs();
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
  for (const tab of elements.analysisTabs) {
    const selected = tab.dataset.builderAnalysis === state.analysisTab;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  elements.bulkPanel.hidden = state.analysisTab !== "bulk";
  elements.breakPanel.hidden = state.analysisTab !== "break";
}

function renderLocaleOptions() {
  elements.nature.replaceChildren(
    ...Object.keys(NATURES).map((nature) => optionElement(
      nature,
      getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature),
    )),
  );
  elements.tera.replaceChildren(
    optionElement("", t("builder.noTera")),
    ...Object.keys(TYPE_EFFECTIVENESS).map((type) => optionElement(type, localizedTerm("type", type))),
  );
}

function pokemonMatches(query) {
  return searchPokemon(catalogs.pokemon, query, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    itemLookup: catalogs.itemLookup,
    limit: 8,
  });
}

function seedPokemon(pokemon, { activeSet = null } = {}) {
  if (!pokemon) return;
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    items: catalogs.items,
  });
  updatePage(() => {
    state = createBuilderState(pokemon, defaults, {
      threatCount: state.threatCount,
      analysisTab: state.analysisTab,
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

function renderPicks() {
  const user = state.user;
  const usage = user.pokemon.champions?.usage;
  const abilities = rankByUsage(
    resolvePokemonAbilities(user.pokemon, catalogs.abilityLookup),
    usage?.abilities,
  );
  const items = rankByUsage(catalogs.items, usage?.items);

  elements.ability.replaceChildren(
    optionElement("", t("builder.noAbility")),
    ...abilities.map((ability) => optionElement(ability.id, localizedName(ability))),
  );
  elements.item.replaceChildren(
    optionElement("", t("builder.noItem")),
    ...items.map((item) => optionElement(item.id, localizedName(item))),
  );
  elements.nature.value = user.nature;
  elements.ability.value = user.ability?.id ?? "";
  elements.item.value = user.item?.id ?? "";
  elements.tera.value = user.teraType ?? "";
  renderMovePicks();
}

function handlePick(event) {
  if (!state.user) return;
  const { id, value } = event.target;
  updatePage(() => {
    if (id === "builder-nature") state = { ...state, user: applyControl(state.user, { kind: "nature", value }) };
    if (id === "builder-ability") {
      state = { ...state, user: applyControl(state.user, {
        kind: "ability",
        value: catalogs.abilityLookup.get(normalizeId(value)) ?? null,
      }) };
    }
    if (id === "builder-item") {
      state = { ...state, user: applyControl(state.user, {
        kind: "item",
        value: catalogs.itemLookup.get(normalizeId(value)) ?? null,
      }) };
    }
    if (id === "builder-tera") state = { ...state, user: { ...state.user, teraType: value } };
  });
}

function handleSpInput(event) {
  if (event.target.dataset.kind !== "builder-sp" || !state.user) return;
  const stat = event.target.dataset.stat;
  updatePage(() => {
    state = { ...state, user: applyControl(state.user, { kind: "sp", stat, value: event.target.value }) };
  });
  event.target.value = String(state.user.sp[stat]);
}

function handleThreatCount(event) {
  if (event.type === "input" && event.target.value.trim() === "") return;
  const threatCount = normalizeThreatCount(event.target.value);
  updatePage(() => {
    state = { ...state, threatCount };
  });
  event.target.value = String(threatCount);
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
  if (refreshPicks) renderPicks();
  else if (refreshMoves) renderMovePicks();
  activeSetStore.writeSet(activeSetFromState(user));
  const stats = finalStats(state);
  elements.pokemonSearch.value = localizedName(user.pokemon);
  elements.nature.value = user.nature;
  elements.ability.value = user.ability?.id ?? "";
  elements.item.value = user.item?.id ?? "";
  elements.tera.value = user.teraType ?? "";
  elements.threatCount.value = String(state.threatCount);
  elements.summary.textContent = t("builder.summary", {
    nature: localizedTerm("nature", user.nature),
    tera: user.teraType ? t("builder.tera", { type: localizedTerm("type", user.teraType) }) : t("builder.noTera"),
  });
  elements.threatSummary.textContent = t("builder.topCustom", { top: state.threatCount, custom: customThreats.length });
  elements.source.textContent = t("builder.source", { top: state.threatCount, custom: customThreats.length });
  elements.speedLink.href = `./speed.html?pokemon=${encodeURIComponent(user.pokemon.id)}`;
  renderAnalysisTabs();

  renderStats(user, stats);
  const spent = STAT_KEYS.reduce((total, stat) => total + (user.sp[stat] ?? 0), 0);
  // TODO(P5-04): show a remaining-SP budget only after an authoritative Champions rule
  // source establishes a total cap; current usage-backed spreads can exceed 64 assigned SP.
  elements.spBudget.textContent = t("builder.spAssigned", { count: spent });
  renderCustomThreats();
  const threats = selectedThreats();
  renderBulkPoints(threats);
  renderBreakPoints(threats);
  applyDocumentTranslations();
  restoreLiveFocus(focusKey);
  if (focusAnalysisTab) {
    elements.analysisTabs.find((tab) => tab.dataset.builderAnalysis === state.analysisTab)?.focus();
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function renderStats(user, stats) {
  const rows = ensureRenderedRows(
    elements.stats,
    ".builder-stat-row",
    () => STAT_KEYS.map((stat) => statRow(stat, user, stats)),
    getLocale(),
  );
  for (const [index, stat] of STAT_KEYS.entries()) {
    const row = rows[index];
    row.querySelector(".builder-stat-base").textContent = String(user.pokemon.baseStats[stat]);
    row.querySelector("input").value = String(user.sp[stat] ?? 0);
    row.querySelector(".builder-stat-final").textContent = String(stats[stat]);
  }
}

function statRow(stat, user, stats) {
  const row = document.createElement("div");
  row.className = "builder-stat-row";

  const label = document.createElement("span");
  label.textContent = localizedTerm("stat", STAT_LABELS[stat]);
  const base = document.createElement("span");
  base.className = "builder-stat-base";
  base.textContent = String(user.pokemon.baseStats[stat]);
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "32";
  input.step = "1";
  input.value = String(user.sp[stat] ?? 0);
  input.dataset.kind = "builder-sp";
  input.dataset.stat = stat;
  input.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} SP`);
  const final = document.createElement("strong");
  final.className = "builder-stat-final";
  final.textContent = String(stats[stat]);

  row.append(label, base, input, final);
  return row;
}

function renderMovePicks() {
  for (const cleanup of moveComboboxCleanups) cleanup();
  moveComboboxCleanups = [];
  const moves = builderMoves();

  elements.movePicks.replaceChildren(...[0, 1, 2, 3].map((index) => {
    const row = document.createElement("div");
    row.className = "builder-move-row";
    const selectedId = state.user.selectedMoveIds[index] ?? "";
    const selected = moves.find((move) => normalizeId(move.id) === normalizeId(selectedId));
    const label = document.createElement("span");
    label.textContent = String(index + 1);
    const input = document.createElement("input");
    input.type = "search";
    input.autocomplete = "off";
    input.role = "combobox";
    input.value = selected ? localizedName(selected) : "";
    input.placeholder = t("label.chooseMove");
    const results = document.createElement("div");
    results.className = "search-results move-search-results";
    results.hidden = true;
    const combobox = document.createElement("div");
    combobox.className = "move-combobox";
    combobox.append(input, results);
    const attached = attachCombobox({
      input,
      resultsEl: results,
      getMatches: (query) => filterMoves(moves, { query }).slice(0, 12),
      onSelect: (move) => {
        updatePage(() => {
          state = { ...state, user: applyControl(state.user, { kind: "move", index, value: move.id }) };
        }, { refreshMoves: true });
      },
      renderRow: (move, onSelect) => searchResultButton(move, onSelect, {
        preventBlur: true,
        small: `${localizedTerm("type", move.type) ?? "—"} · ${localizedTerm("category", move.category) ?? "—"}`,
        strong: move.basePower ?? "—",
      }),
    });
    moveComboboxCleanups.push(attached.destroy);
    row.append(label, combobox);
    return row;
  }));
}

function builderMoves() {
  return rankByUsage(
    resolveChampionsPokemonMoves(state.user.pokemon, catalogs.moveLookup),
    state.user.pokemon.champions?.usage?.moves,
  );
}

function selectedMoves() {
  const lookup = new Map(builderMoves().map((move) => [normalizeId(move.id), move]));
  return state.user.selectedMoveIds.map((id) => lookup.get(normalizeId(id))).filter(Boolean);
}

function selectedThreats() {
  const popularThreats = threatList(catalogs.pokemon, {
    count: state.threatCount,
    abilityLookup: catalogs.abilityLookup,
    includeMegas: true,
    items: catalogs.items,
    moveLookup: catalogs.moveLookup,
  });
  return mergeThreatLists(popularThreats, customThreats).map((threat) =>
    threatOverrides.get(normalizeId(threat.pokemon.id)) ?? threat);
}

function renderCustomThreats() {
  elements.customThreats.replaceChildren(...customThreats.map(({ pokemon }) => {
    const chip = document.createElement("span");
    chip.className = "builder-threat-chip";
    chip.append(pokemonSprite(pokemon));
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

function renderBulkPoints(threats) {
  const matchups = bulkPointMatchups(state.user, threats);
  const spreadCount = matchups.reduce((total, { points }) => total + points.length, 0);
  const { primary, detail } = partitionBulkMatchups(matchups);

  elements.bulkCount.textContent = t("builder.bulkCount", { spreads: spreadCount, matchups: matchups.length });
  elements.bulkPoints.replaceChildren(
    ...(matchups.length === 0
      ? [emptyText(t("builder.noThreatMoves"))]
      : [
          ...bulkThreatCards(primary, "primary"),
          ...(detail.length > 0 ? [bulkDetailDisclosure(detail)] : []),
        ]),
  );
}

function bulkThreatCards(matchups, section) {
  const groups = new Map();
  for (const matchup of matchups) {
    const id = normalizeId(matchup.scenario.threat.pokemon.id);
    if (!groups.has(id)) groups.set(id, { threat: matchup.scenario.threat, matchups: [] });
    groups.get(id).matchups.push(matchup);
  }
  return [...groups.values()].map(({ threat, matchups: threatMatchups }) => {
    const threatId = normalizeId(threat.pokemon.id);
    const cardKey = `bulk:${section}:${threatId}`;
    return analysisCard(threat, threatMatchups.map((matchup) =>
      bulkMovePanel(matchup, bulkPanelKey(matchup))), cardKey);
  });
}

function bulkPanelKey({ scenario }) {
  return `bulk:${normalizeId(scenario.threat.pokemon.id)}:${normalizeId(scenario.move.id)}`;
}

function bulkDetailDisclosure(matchups) {
  const panelKey = "bulk:more-detail";
  const details = document.createElement("details");
  details.className = "builder-more-detail";
  details.open = openAnalysisPanels.has(panelKey) ||
    matchups.some((matchup) => openAnalysisPanels.has(bulkPanelKey(matchup)));
  const summary = document.createElement("summary");
  summary.append(
    textSpan(t("builder.moreDetail"), "builder-more-detail-title"),
    textSpan(t("builder.longMatchups", { count: matchups.length }), "builder-more-detail-count"),
  );
  const cards = document.createElement("div");
  cards.className = "builder-analysis-grid";
  cards.append(...bulkThreatCards(matchups, "detail"));
  details.addEventListener("toggle", () => setPanelOpen(panelKey, details.open));
  details.append(summary, cards);
  return details;
}

function bulkMovePanel({ scenario, damage, points }, panelKey) {
  const defenseStat = scenario.move.overrideDefensiveStat ??
    (scenario.move.category === "Physical" ? "def" : "spd");
  return analysisMovePanel({
    panelKey,
    move: scenario.move,
    damage,
    defensive: true,
    emptyMessage: t("builder.noSurvival"),
    loadChoices: () => points.map((point) => spreadChoice({
      label: t("builder.totalSp", { count: point.totalSp }),
      stats: [
        ["HP", point.hpSp],
        [localizedTerm("stat", STAT_LABELS[defenseStat]), point.defSp],
      ],
      fromKoText: point.fromKoText,
      toKoText: point.koText,
      damageText: t("builder.maxDamage", { value: point.maxPct }),
      onSelect: () => {
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
        });
      },
    })),
  });
}

function renderBreakPoints(threats) {
  const moves = selectedMoves().filter(({ category }) => category === "Physical" || category === "Special");
  elements.breakCount.textContent = t("builder.breakCount", { pokemon: threats.length, moves: moves.length });
  if (threats.length === 0) {
    elements.breakPoints.replaceChildren(emptyText(t("builder.addThreat")));
    return;
  }
  if (moves.length === 0) {
    elements.breakPoints.replaceChildren(emptyText(t("builder.chooseDamageMove")));
    return;
  }

  const cards = document.createElement("div");
  cards.className = "builder-analysis-grid";
  cards.append(...threats.map((threat) => {
    const threatId = normalizeId(threat.pokemon.id);
    const cardKey = `break:${threatId}`;
    return analysisCard(threat, moves.map((move, index) =>
      breakMovePanel(move, threat, `${cardKey}:${normalizeId(move.id)}:${index}`)), cardKey);
  }));
  elements.breakPoints.replaceChildren(cards);
}

function breakMovePanel(move, threat, panelKey) {
  const damage = yourDamage(state.user, move, { threat });
  const attackStat = move.overrideOffensiveStat ?? (move.category === "Physical" ? "atk" : "spa");
  return analysisMovePanel({
    panelKey,
    move,
    damage,
    emptyMessage: t("builder.noHigherKo"),
    loadChoices: () => significantBreakPoints(
      damage.koText,
      breakPoints(state.user, move, { threat }),
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
        onSelect: () => {
          updatePage(() => {
            state = {
              ...state,
              user: {
                ...state.user,
                nature,
                sp: { ...state.user.sp, [attackStat]: point.sp },
              },
            };
          });
        },
      });
    }),
  });
}

function analysisCard(threat, movePanels, cardKey) {
  const expanded = expandedCards.has(cardKey);
  const card = document.createElement("article");
  card.className = "builder-analysis-card";
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
  const moves = document.createElement("div");
  moves.className = "builder-analysis-moves";
  moves.append(...movePanels);
  heading.addEventListener("click", () => {
    updatePage(() => {
      if (expandedCards.has(cardKey)) expandedCards.delete(cardKey);
      else expandedCards.add(cardKey);
    });
  });
  card.append(heading, ...(editor ? [editor] : []), moves);
  return card;
}

function threatBuildEditor(threat, cardKey) {
  const editor = document.createElement("section");
  editor.className = "builder-threat-build";
  editor.setAttribute("aria-label", t("builder.threatBuild", { name: localizedName(threat.pokemon) }));

  const picks = document.createElement("div");
  picks.className = "builder-threat-build-picks";
  picks.append(
    threatSelect(t("label.nature"), Object.keys(NATURES).map((nature) => ({
      value: nature,
      label: getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature),
    })), threat.nature, (value, focusKey) => updateThreatBuild(
      threat,
      { kind: "nature", value },
      { cardKey, focusKey },
    ), `${cardKey}:nature`),
    threatSelect(t("label.ability"), [
      { value: "", label: t("builder.noAbility") },
      ...rankByUsage(
        resolvePokemonAbilities(threat.pokemon, catalogs.abilityLookup),
        threat.pokemon.champions?.usage?.abilities,
      ).map((ability) => ({ value: ability.id, label: localizedName(ability) })),
    ], threat.ability?.id ?? "", (value, focusKey) => updateThreatBuild(
      threat,
      {
        kind: "ability",
        value: catalogs.abilityLookup.get(normalizeId(value)) ?? null,
      },
      { cardKey, focusKey },
    ), `${cardKey}:ability`),
    threatSelect(t("label.item"), [
      { value: "", label: t("builder.noItem") },
      ...rankByUsage(catalogs.items, threat.pokemon.champions?.usage?.items)
        .map((item) => ({ value: item.id, label: localizedName(item) })),
    ], threat.item?.id ?? "", (value, focusKey) => updateThreatBuild(
      threat,
      {
        kind: "item",
        value: catalogs.itemLookup.get(normalizeId(value)) ?? null,
      },
      { cardKey, focusKey },
    ), `${cardKey}:item`),
    threatSelect(t("label.tera"), [
      { value: "", label: t("builder.noTera") },
      ...Object.keys(TYPE_EFFECTIVENESS)
        .map((type) => ({ value: type, label: localizedTerm("type", type) })),
    ], threat.teraType ?? "", (value, focusKey) => updateThreatBuild(
      threat,
      { kind: "teraType", value },
      { cardKey, focusKey },
    ), `${cardKey}:tera`),
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
    const focusKey = `${cardKey}:sp:${stat}`;
    input.dataset.liveKey = focusKey;
    input.setAttribute("aria-label", `${localizedTerm("stat", STAT_LABELS[stat])} SP`);
    input.addEventListener("input", () => updateThreatBuild(
      threat,
      { kind: "sp", stat, value: input.value },
      { cardKey, focusKey },
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
    const focusKey = `${cardKey}:move:${index}`;
    return threatSelect(t("battle.moveNumber", { number: index + 1 }), moveOptions.map((option) => ({
      value: option.id,
      label: localizedName(option),
    })), move.id, (value, selectedFocusKey) => updateThreatBuild(
      threat,
      {
        kind: "move",
        index,
        value: catalogs.moveLookup.get(normalizeId(value)) ?? move,
      },
      { cardKey, focusKey: selectedFocusKey },
    ), focusKey);
  }));

  editor.append(picks, spread, moves);
  return editor;
}

function threatSelect(labelText, options, selectedValue, onChange, focusKey) {
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  select.replaceChildren(...options.map(({ value, label: optionLabel }) =>
    optionElement(value, optionLabel)));
  select.value = selectedValue;
  select.dataset.liveKey = focusKey;
  select.addEventListener("input", () => onChange(select.value, focusKey));
  label.append(select);
  return label;
}

function updateThreatBuild(threat, control, { cardKey, focusKey }) {
  updatePage(() => {
    const threatId = normalizeId(threat.pokemon.id);
    const current = threatOverrides.get(threatId) ?? threat;
    threatOverrides.set(threatId, applyThreatControl(current, control));
    expandedCards.add(cardKey);
  }, { focusKey });
}

function analysisMovePanel({ panelKey, move, damage, defensive = false, choices, loadChoices, emptyMessage }) {
  const collapsible = typeof loadChoices === "function";
  const panel = document.createElement(collapsible ? "details" : "section");
  panel.className = "builder-analysis-move";
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
  const prompt = textSpan(t("builder.viewThresholds"), "builder-spread-prompt");
  summary.append(heading, range, prompt);
  panel.open = openAnalysisPanels.has(panelKey);
  if (panel.open) {
    const loadedChoices = loadChoices();
    renderSpreadChoices(list, loadedChoices, emptyMessage);
    prompt.textContent = t("builder.thresholdCount", { count: loadedChoices.length });
  }
  panel.addEventListener("toggle", () => {
    setPanelOpen(panelKey, panel.open);
  });
  panel.append(summary, list);
  return panel;
}

function setPanelOpen(panelKey, open) {
  if (!panelKey || openAnalysisPanels.has(panelKey) === open) return;
  updatePage(() => {
    if (open) openAnalysisPanels.add(panelKey);
    else openAnalysisPanels.delete(panelKey);
  });
}

function restoreLiveFocus(focusKey) {
  if (!focusKey) return;
  const panel = state.analysisTab === "bulk" ? elements.bulkPanel : elements.breakPanel;
  const control = [...panel.querySelectorAll("[data-live-key]")]
    .find(({ dataset }) => dataset.liveKey === focusKey);
  control?.focus({ preventScroll: true });
}

function deletePanelKeysForPokemon(keys, pokemonId) {
  for (const key of keys) {
    if (key.split(":").includes(pokemonId)) keys.delete(key);
  }
}

function renderSpreadChoices(list, choices, emptyMessage) {
  list.replaceChildren(...(choices.length > 0 ? choices : [emptyText(emptyMessage)]));
}

function spreadChoice({ label, stats, fromKoText, toKoText, damageText, onSelect }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "builder-spread-choice";
  const heading = document.createElement("span");
  heading.className = "builder-spread-heading";
  heading.append(
    textSpan(label, "builder-spread-label"),
    textSpan(t("builder.apply"), "builder-spread-apply"),
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
  button.addEventListener("click", onSelect);
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
  label.append(pokemonSprite(pokemon));
  const name = document.createElement("span");
  name.textContent = localizedName(pokemon);
  label.append(name);
  return label;
}

function pokemonSprite(pokemon) {
  const wrap = document.createElement("span");
  wrap.className = "pokemon-minisprite";
  const image = document.createElement("img");
  image.loading = "lazy";
  image.alt = localizedName(pokemon);
  const [source, fallbackSource] = pokemonSpriteUrls(pokemon);
  image.src = source;
  const fallback = document.createElement("span");
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
  wrap.append(image, fallback);
  return wrap;
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

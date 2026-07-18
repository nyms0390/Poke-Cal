import {
  filterMoves,
  formatMoveAccuracy,
  formatMovePower,
  moveEffect,
  resolvePokemonAbilities,
  resolveChampionsPokemonMoves,
} from "../data/catalog.js";
import { megaFamily, searchPokemon } from "../data/pokemon.js";
import { speedTierSummary, threatList } from "../data/threats.js";
import { championsDefaultsForPokemon, topUsageEntry } from "../data/usage-defaults.js";
import { totalBaseStats } from "../engine/stats.js";
import { defensiveMatchups } from "../engine/type-chart.js";
import {
  applyDocumentTranslations,
  getLocale,
  initI18n,
  localizedName,
  localizedSpreadName,
  localizedTerm,
  onLocaleChange,
  t,
  toTraditionalChinese,
} from "../i18n.js";
import { formatChampionsUsage } from "../i18n-formatters.js";
import { catalogLoadedStatus, loadCatalogs, rankByUsage } from "./bootstrap.js";
import {
  FULL_STAT_LABELS,
  moveNameCell,
  optionElement,
  searchResultButton,
  textCell,
  typeBadge,
  updateSelectOptions,
} from "./components.js";

const elements = {
  search: document.querySelector("#pokemon-search"),
  results: document.querySelector("#search-results"),
  selectedName: document.querySelector("#selected-name"),
  selectedTypes: document.querySelector("#selected-types"),
  selectedAlias: document.querySelector("#selected-alias"),
  baseStats: document.querySelector("#base-stats"),
  baseStatTotal: document.querySelector("#base-stat-total"),
  formField: document.querySelector("#form-field"),
  form: document.querySelector("#form"),
  usageSource: document.querySelector("#usage-source"),
  commonBuildCard: document.querySelector("#common-build-card"),
  commonBuildHeadline: document.querySelector("#common-build-headline"),
  commonBuildSource: document.querySelector("#common-build-source"),
  commonBuildFacts: document.querySelector("#common-build-facts"),
  commonBuildCalculator: document.querySelector("#common-build-calculator"),
  typeMatchupCard: document.querySelector("#type-matchup-card"),
  typeMatchupList: document.querySelector("#type-matchup-list"),
  typeMatchupNote: document.querySelector("#type-matchup-note"),
  speedTierCard: document.querySelector("#speed-tier-card"),
  speedTierList: document.querySelector("#speed-tier-list"),
  playstyleSummary: document.querySelector("#playstyle-summary"),
  spreadCount: document.querySelector("#spread-count"),
  spreadList: document.querySelector("#spread-list"),
  abilityCount: document.querySelector("#ability-count"),
  abilityList: document.querySelector("#ability-list"),
  itemCount: document.querySelector("#item-count"),
  itemList: document.querySelector("#item-list"),
  moveCount: document.querySelector("#move-count"),
  moveSearch: document.querySelector("#move-search"),
  moveType: document.querySelector("#move-type"),
  moveCategory: document.querySelector("#move-category"),
  moveList: document.querySelector("#move-list"),
  status: document.querySelector("#status"),
};

let pokemon = [];
let abilityLookup = new Map();
let moveLookup = new Map();
let itemLookup = new Map();
let items = [];
let threats = [];
let selectedPokemon = null;
let selectedFamily = [];
let selectedMoves = [];
let catalogs = null;

initI18n();
initialize();

onLocaleChange(() => {
  if (catalogs) elements.status.textContent = catalogLoadedStatus(catalogs);
  if (!selectedPokemon) return;
  renderFormOptions();
  renderFamilyStats();
  selectForm(selectedPokemon);
});

async function initialize() {
  const data = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!data) return;
  catalogs = data;
  pokemon = data.pokemon;
  abilityLookup = data.abilityLookup;
  moveLookup = data.moveLookup;
  itemLookup = data.itemLookup;
  items = data.items;
  threats = threatList(pokemon, { count: 10, moveLookup });
  selectPokemon(pokemon.find(({ id }) => id === "pikachu") ?? pokemon[0], {
    syncSearch: false,
  });
}

elements.search.addEventListener("input", () => {
  renderSearchResults(searchPokemon(pokemon, elements.search.value, searchOptions()));
});

elements.search.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const [firstResult] = searchPokemon(pokemon, elements.search.value, {
    ...searchOptions(),
    limit: 1,
  });
  if (firstResult) selectPokemon(firstResult);
});

elements.form.addEventListener("input", () => {
  const form = selectedFamily.find(({ id }) => id === elements.form.value);
  if (form) selectForm(form);
});

for (const control of [elements.moveSearch, elements.moveType, elements.moveCategory]) {
  control.addEventListener("input", renderMoveList);
}

function searchOptions() {
  return { abilityLookup, moveLookup, itemLookup };
}

function renderSearchResults(results) {
  elements.results.replaceChildren(
    ...results.map((entry) => searchResultButton(entry, selectPokemon)),
  );
  elements.results.hidden = results.length === 0;
}

function selectPokemon(entry, options = {}) {
  if (!entry) return;
  selectedFamily = megaFamily(pokemon, entry);
  renderFormOptions();
  renderFamilyStats();
  selectForm(entry, options);
  elements.results.hidden = true;
}

function renderFormOptions() {
  elements.form.replaceChildren(
    ...selectedFamily.map((entry) => optionElement(entry.id, localizedName(entry))),
  );
  elements.formField.hidden = selectedFamily.length === 1;
}

function renderFamilyStats() {
  elements.baseStats.replaceChildren(
    ...selectedFamily.map((entry) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "form-card";
      card.dataset.formId = entry.id;
      const abilities = resolvePokemonAbilities(entry, abilityLookup)
        .map((ability) => localizedName(ability))
        .join(" · ");
      card.innerHTML = `
        <span class="form-card-heading">
          <strong>${localizedName(entry)}</strong>
          <small>BST ${totalBaseStats(entry.baseStats)}</small>
        </span>
        <span class="form-card-abilities">
          <small>Abilities</small>
          <strong>${abilities || "—"}</strong>
        </span>
        <span class="form-card-stats">
          ${Object.entries(FULL_STAT_LABELS)
            .map(
              ([key, label]) => `
                <span class="${key === "spe" ? "speed-stat" : ""}">
                  <small>${localizedTerm("stat", label)}</small>
                  <strong>${entry.baseStats[key]}</strong>
                </span>
              `,
            )
            .join("")}
        </span>
      `;
      card.addEventListener("click", () => selectForm(entry));
      return card;
    }),
  );
}

function selectForm(entry, options = {}) {
  selectedPokemon = entry;
  if (options.syncSearch !== false) elements.search.value = localizedName(entry);
  elements.selectedName.textContent = localizedName(entry);
  elements.selectedTypes.replaceChildren(...(entry.types ?? []).map(typeBadge));
  elements.selectedAlias.textContent = getLocale() === "zh-TW"
    ? entry.name
    : entry.aliases.map(toTraditionalChinese).join(" · ") || entry.baseSpecies;
  elements.baseStatTotal.textContent = totalBaseStats(entry.baseStats);
  elements.form.value = entry.id;

  for (const card of elements.baseStats.querySelectorAll(".form-card")) {
    card.classList.toggle("active", card.dataset.formId === entry.id);
  }
  renderCatalog();
}

function renderCatalog() {
  renderUsageSource();
  renderCommonBuild();
  renderDefensiveMatchups();
  renderSpeedTiers();

  const usage = selectedPokemon?.champions?.usage;
  const abilities = rankByUsage(resolvePokemonAbilities(selectedPokemon, abilityLookup), usage?.abilities);
  const rankedItems = rankByUsage(items, usage?.items);
  selectedMoves = rankByUsage(resolveChampionsPokemonMoves(selectedPokemon, moveLookup), usage?.moves);

  renderPlaystyle(abilities, rankedItems);
  renderSpreads();
  renderAbilities(abilities);
  renderItems(rankedItems);
  renderMoveFilterOptions();
  renderMoveList();
  applyDocumentTranslations();
}

function renderUsageSource() {
  elements.usageSource.textContent = t("lookup.usageSource");
}

function renderCommonBuild() {
  const champions = selectedPokemon?.champions;
  const usage = champions?.usage;
  if (!usage || !Number.isFinite(champions.usageCount)) {
    elements.commonBuildCard.hidden = true;
    elements.commonBuildFacts.replaceChildren();
    return;
  }

  const defaults = championsDefaultsForPokemon(selectedPokemon, {
    abilityLookup,
    moveLookup,
    items,
  });
  const nature = topUsageEntry(usage.natures);
  const tera = topUsageEntry(usage.teras);
  const moves = defaults.moves.slice(0, 4);

  elements.commonBuildHeadline.textContent = t("lookup.commonHeadline", {
    usage: formatUsagePercent(champions.usagePercent),
    samples: champions.usageCount.toLocaleString(getLocale()),
  });
  elements.commonBuildSource.textContent = t("lookup.commonSource");
  elements.commonBuildFacts.replaceChildren(
    commonBuildFact(t("label.ability"), defaults.ability),
    commonBuildFact(t("label.item"), defaults.item),
    commonBuildFact(t("label.nature"), nature ?? { name: defaults.nature }),
    commonBuildFact(t("label.tera"), tera ?? { name: defaults.teraType || "—" }),
    commonBuildMoves(moves),
  );
  elements.commonBuildCalculator.href =
    `./battle.html?left=${encodeURIComponent(selectedPokemon.id)}`;
  elements.commonBuildCard.hidden = false;
}

function commonBuildFact(labelText, entry) {
  const row = document.createElement("div");
  row.className = "common-build-fact";

  const label = document.createElement("span");
  label.textContent = labelText;
  const value = document.createElement("strong");
  const rawName = entry?.name;
  value.textContent = !entry ? "—"
    : labelText === t("label.nature") ? localizedTerm("nature", rawName)
    : labelText === t("label.tera") ? localizedTerm("type", rawName)
    : localizedName(entry);
  if (Number.isFinite(entry?.usagePercent)) {
    const usage = document.createElement("small");
    usage.textContent = formatUsagePercent(entry.usagePercent);
    value.append(usage);
  }
  row.append(label, value);
  return row;
}

function commonBuildMoves(moves) {
  const row = document.createElement("div");
  row.className = "common-build-fact common-build-moves";
  const label = document.createElement("span");
  label.textContent = t("label.moves");
  const list = document.createElement("div");
  list.className = "common-build-move-list";
  list.append(
    ...moves.map((move) => {
      const item = document.createElement("span");
      item.textContent = localizedName(move);
      if (Number.isFinite(move.usagePercent)) {
        const usage = document.createElement("small");
        usage.textContent = formatUsagePercent(move.usagePercent);
        item.append(usage);
      }
      return item;
    }),
  );
  row.append(label, list);
  return row;
}

function formatUsagePercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
}

function renderDefensiveMatchups() {
  const types = selectedPokemon?.types ?? [];
  if (types.length === 0) {
    elements.typeMatchupCard.hidden = true;
    return;
  }

  const labels = {
    x4: "4×",
    x2: "2×",
    x1: "1×",
    x05: "½×",
    x025: "¼×",
    x0: "0×",
  };
  const matchups = defensiveMatchups(types);
  elements.typeMatchupList.replaceChildren(
    ...Object.entries(matchups)
      .filter(([, entries]) => entries.length > 0)
      .map(([bucket, entries]) => matchupRow(labels[bucket], entries)),
  );

  const hasLevitate = resolvePokemonAbilities(selectedPokemon, abilityLookup)
    .some(({ name }) => name === "Levitate");
  elements.typeMatchupNote.textContent = hasLevitate ? t("lookup.levitate") : "";
  elements.typeMatchupNote.hidden = !hasLevitate;
  elements.typeMatchupCard.hidden = false;
}

function matchupRow(labelText, types) {
  const row = document.createElement("div");
  row.className = "type-matchup-row";
  const label = document.createElement("strong");
  label.textContent = labelText;
  const badges = document.createElement("div");
  badges.className = "type-badges";
  badges.append(...types.map(typeBadge));
  row.append(label, badges);
  return row;
}

function renderSpeedTiers() {
  const summary = speedTierSummary(selectedPokemon, threats);
  if (summary.length === 0) {
    elements.speedTierCard.hidden = true;
    elements.speedTierList.replaceChildren();
    return;
  }

  elements.speedTierList.replaceChildren(...summary.map(speedTierRow));
  elements.speedTierCard.hidden = false;
}

function speedTierRow(entry) {
  const details = document.createElement("details");
  details.className = "speed-tier-row";
  const summary = document.createElement("summary");
  const label = document.createElement("span");
  label.textContent = localizedSpeedTierLabel(entry.label);
  const speed = document.createElement("strong");
  speed.textContent = String(entry.value);
  const count = document.createElement("span");
  count.textContent = t("lookup.outspeeds", { count: entry.outspeedCount, total: entry.threatCount });
  count.title = localizedPokemonNames(entry.outspeedNames).join(", ") || t("lookup.noThreats");
  summary.append(label, speed, count);

  const names = document.createElement("p");
  names.textContent = entry.outspeedNames.length > 0
    ? localizedPokemonNames(entry.outspeedNames).join(" · ")
    : t("lookup.noThreatsAtSpeed");
  details.append(summary, names);
  return details;
}

function renderPlaystyle(abilities, rankedItems) {
  const ability = topName(abilities, "ability");
  const item = topName(rankedItems, "item");
  const moves = selectedMoves
    .slice(0, 4)
    .map((move) => localizedName(move))
    .join(", ");

  elements.playstyleSummary.textContent = t("lookup.playstyle", {
    pokemon: localizedName(selectedPokemon),
    ability,
    item,
    moves: moves || t("lookup.noRankedMoves"),
  });
}

function topName(entries, fallback) {
  const [entry] = rankByUsage(entries);
  if (entry) return localizedName(entry);
  return t(fallback === "ability" ? "lookup.noCommonAbility" : "lookup.noCommonItem");
}

function renderSpreads() {
  const usageSpreads = selectedPokemon?.champions?.usage?.spreads ?? [];
  const ncpSets = selectedPokemon?.champions?.ncp?.sets ?? [];
  elements.spreadCount.textContent = String(usageSpreads.length + ncpSets.length);

  if (usageSpreads.length === 0 && ncpSets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-catalog";
    empty.textContent = t("lookup.noSpreads");
    elements.spreadList.replaceChildren(empty);
    return;
  }

  elements.spreadList.replaceChildren(
    ...usageSpreads.map(renderUsageSpreadRow),
    ...ncpSets.map(renderNcpSetCard),
    renderSpreadSource(usageSpreads.length > 0, ncpSets.length > 0),
  );
}

function renderUsageSpreadRow(spread) {
  const row = document.createElement("div");
  row.className = "spread-row";

  const name = document.createElement("strong");
  name.textContent = localizedSpreadName(spread.name);

  const usage = document.createElement("span");
  usage.textContent = Number.isFinite(spread.usagePercent) ? `${spread.usagePercent}%` : "—";

  row.append(name, usage);
  return row;
}

function renderNcpSetCard(set) {
  const card = document.createElement("article");
  card.className = "spread-card";

  const heading = document.createElement("div");
  heading.className = "spread-card-heading";
  const name = document.createElement("strong");
  name.textContent = set.name;
  const spread = document.createElement("span");
  spread.textContent = localizedSpreadName(set.spreadName);
  heading.append(name, spread);

  const build = document.createElement("p");
  build.textContent = [
    localizedCatalogValue(set.ability, abilityLookup),
    localizedCatalogValue(set.item, itemLookup),
  ].filter(Boolean).join(" · ") || "—";

  const moves = document.createElement("p");
  moves.textContent = set.moves.map((move) => localizedCatalogValue(move, moveLookup)).join(" / ");

  card.append(heading, build, moves);
  return card;
}

function renderSpreadSource(hasUsageSpreads, hasNcpSets) {
  const meta = selectedPokemon?.champions?.spreadsMeta;
  const source = document.createElement("p");
  source.className = "usage-source spread-source";
  source.textContent = [
    hasUsageSpreads && t("lookup.smogonSpreadSource", { month: meta?.month, cutoff: meta?.cutoff }),
    hasNcpSets && t("lookup.ncpSpreadSource"),
  ]
    .filter(Boolean)
    .join(" · ");
  return source;
}

function renderAbilities(abilities) {
  elements.abilityCount.textContent = String(abilities.length);
  elements.abilityList.replaceChildren(
    ...abilities.map((ability) => {
      const card = document.createElement("article");
      card.className = "ability-card";

      const heading = document.createElement("div");
      heading.className = "ability-heading";

      const name = document.createElement("strong");
      name.textContent = localizedName(ability);
      heading.append(name);

      if (ability.rating !== undefined) {
        const rating = document.createElement("span");
        rating.textContent = t("lookup.rating", { value: ability.rating });
        heading.append(rating);
      }

      const usage = document.createElement("span");
      usage.textContent = formatChampionsUsage(ability, getLocale());
      heading.append(usage);

      const description = document.createElement("p");
      description.textContent = ability.shortDesc || ability.desc || "—";
      description.lang = "en";

      card.append(heading, description);
      return card;
    }),
  );
}

function renderItems(items) {
  elements.itemCount.textContent = String(items.length);

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-catalog";
    empty.textContent = t("lookup.noItems");
    elements.itemList.replaceChildren(empty);
    return;
  }

  elements.itemList.replaceChildren(
    ...items.map((item) => {
      const card = document.createElement("article");
      card.className = "item-card";

      const heading = document.createElement("div");
      heading.className = "item-heading";

      const name = document.createElement("strong");
      name.textContent = localizedName(item);
      const usage = document.createElement("span");
      usage.textContent = formatChampionsUsage(item, getLocale());
      heading.append(name, usage);

      const description = document.createElement("p");
      description.textContent = item.shortDesc || item.desc || "—";
      description.lang = "en";

      card.append(heading, description);
      return card;
    }),
  );
}

function renderMoveFilterOptions() {
  updateSelectOptions(elements.moveType, t("label.allTypes"), [
    ...new Set(selectedMoves.map(({ type }) => type).filter(Boolean)),
  ], (value) => localizedTerm("type", value));
  updateSelectOptions(elements.moveCategory, t("label.allCategories"), [
    ...new Set(selectedMoves.map(({ category }) => category).filter(Boolean)),
  ], (value) => localizedTerm("category", value));
}

function renderMoveList() {
  const moves = filterMoves(selectedMoves, {
    query: elements.moveSearch.value,
    type: elements.moveType.value,
    category: elements.moveCategory.value,
  });
  elements.moveCount.textContent = `${moves.length} / ${selectedMoves.length}`;

  if (moves.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.className = "empty-moves";
    cell.textContent = t("lookup.noMoveMatches");
    row.append(cell);
    elements.moveList.replaceChildren(row);
    return;
  }

  elements.moveList.replaceChildren(...moves.map(renderMoveRow));
}

function renderMoveRow(move) {
  const row = document.createElement("tr");
  row.append(
    moveNameCell(move),
    textCell(formatChampionsUsage(move, getLocale()), "numeric-cell", t("label.champions")),
    textCell(localizedTerm("category", move.category) || "—", "", t("label.category")),
    textCell(formatMovePower(move.basePower), "numeric-cell", t("label.power")),
    textCell(formatMoveAccuracy(move.accuracy), "numeric-cell", t("label.accuracy")),
    textCell(String(move.pp ?? "—"), "numeric-cell", "PP"),
    textCell(moveEffect(move), "effect-cell", t("label.effect")),
  );
  if (getLocale() === "zh-TW") row.querySelector(".effect-cell").lang = "en";
  return row;
}

function localizedPokemonNames(names) {
  const byName = new Map(pokemon.map((entry) => [entry.name, entry]));
  return names.map((name) => localizedName(byName.get(name) ?? { name }));
}

function localizedCatalogValue(value, lookup) {
  if (!value) return "";
  const entry = lookup.get(String(value).toLowerCase().replace(/[^a-z0-9]/g, ""));
  return localizedName(entry ?? { name: value });
}

function localizedSpeedTierLabel(label) {
  if (getLocale() !== "zh-TW") return label;
  const match = /^(Max|Fast|Uninvested|Min) \(([^,]+), (\d+) SP\)$/.exec(label);
  if (!match) return label;
  const preset = { Max: "極速", Fast: "高速", Uninvested: "無投資", Min: "最慢" }[match[1]];
  const nature = match[2].replace("+Spe", "+速度").replace("−Spe", "−速度").replace("neutral", "無性格修正");
  return `${preset}（${nature}, ${match[3]} SP）`;
}

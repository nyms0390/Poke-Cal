import {
  filterMoves,
  normalizeId,
  resolveChampionsPokemonMoves,
  resolvePokemonAbilities,
} from "../data/catalog.js";
import { breakPoints, yourDamage } from "../data/break-points.js";
import { bulkPointMatchups } from "../data/bulk-points.js";
import { searchPokemon } from "../data/pokemon.js";
import { threatList } from "../data/threats.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { STAT_KEYS } from "../engine/constants.js";
import { NATURES, natureOptionLabel } from "../engine/natures.js";
import { TYPE_EFFECTIVENESS } from "../engine/type-chart.js";
import { applyControl } from "./battle-state.js";
import { loadCatalogs, rankByUsage } from "./bootstrap.js";
import {
  createBuilderState,
  finalStats,
  partitionBulkMatchups,
  significantBreakPoints,
} from "./builder-state.js";
import {
  attachCombobox,
  damagePercentColor,
  optionElement,
  pokemonSpriteUrls,
  searchResultButton,
  STAT_LABELS,
} from "./components.js";

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
  speedLink: document.querySelector("#builder-speed-link"),
  bulkCount: document.querySelector("#bulk-count"),
  bulkPoints: document.querySelector("#bulk-points"),
  breakCount: document.querySelector("#break-count"),
  breakPoints: document.querySelector("#break-points"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let state = createBuilderState();
let moveComboboxCleanups = [];
let threats = [];

initialize();

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;

  elements.nature.replaceChildren(
    ...Object.keys(NATURES).map((nature) => optionElement(nature, natureOptionLabel(nature))),
  );
  elements.tera.replaceChildren(
    optionElement("", "No Tera"),
    ...Object.keys(TYPE_EFFECTIVENESS).map((type) => optionElement(type, type)),
  );

  attachCombobox({
    input: elements.pokemonSearch,
    resultsEl: elements.pokemonResults,
    getMatches: (query) => searchPokemon(catalogs.pokemon, query, {
      abilityLookup: catalogs.abilityLookup,
      moveLookup: catalogs.moveLookup,
      itemLookup: catalogs.itemLookup,
      limit: 8,
    }),
    onSelect: seedPokemon,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });

  for (const control of [elements.nature, elements.ability, elements.item, elements.tera]) {
    control.addEventListener("input", handlePick);
  }
  elements.stats.addEventListener("input", handleSpInput);

  threats = threatList(catalogs.pokemon, {
    count: state.threatCount,
    abilityLookup: catalogs.abilityLookup,
    includeMegas: true,
    moveLookup: catalogs.moveLookup,
  });

  const requestedId = new URLSearchParams(globalThis.location?.search ?? "").get("pokemon");
  const requested = catalogs.pokemon.find(({ id }) => normalizeId(id) === normalizeId(requestedId));
  const defaultThreat = threatList(catalogs.pokemon, { count: 1, moveLookup: catalogs.moveLookup })[0];
  seedPokemon(requested ?? defaultThreat?.pokemon ?? catalogs.pokemon[0]);
}

function seedPokemon(pokemon) {
  if (!pokemon) return;
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    items: catalogs.items,
  });
  state = createBuilderState(pokemon, defaults, { threatCount: state.threatCount });
  renderPicks();
  render();
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
    optionElement("", "No ability"),
    ...abilities.map((ability) => optionElement(ability.id, ability.name)),
  );
  elements.item.replaceChildren(
    optionElement("", "No item"),
    ...items.map((item) => optionElement(item.id, item.name)),
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
  render();
}

function handleSpInput(event) {
  if (event.target.dataset.kind !== "builder-sp" || !state.user) return;
  const stat = event.target.dataset.stat;
  state = { ...state, user: applyControl(state.user, { kind: "sp", stat, value: event.target.value }) };
  event.target.value = String(state.user.sp[stat]);
  render();
}

function render() {
  const user = state.user;
  if (!user) return;
  const stats = finalStats(state);
  elements.pokemonSearch.value = user.pokemon.name;
  elements.nature.value = user.nature;
  elements.ability.value = user.ability?.id ?? "";
  elements.item.value = user.item?.id ?? "";
  elements.tera.value = user.teraType ?? "";
  elements.summary.textContent = `${user.nature} · ${user.teraType ? `Tera ${user.teraType}` : "No Tera"}`;
  elements.source.textContent =
    `Limitless Champions defaults · top-${state.threatCount} threats + legal Mega forms · no active Tera`;
  elements.speedLink.href = `./speed.html?pokemon=${encodeURIComponent(user.pokemon.id)}`;

  elements.stats.replaceChildren(...STAT_KEYS.map((stat) => statRow(stat, user, stats)));
  const spent = STAT_KEYS.reduce((total, stat) => total + (user.sp[stat] ?? 0), 0);
  // TODO(P5-04): show a remaining-SP budget only after an authoritative Champions rule
  // source establishes a total cap; current usage-backed spreads can exceed 64 assigned SP.
  elements.spBudget.textContent = `${spent} SP assigned`;
  renderBulkPoints();
  renderBreakPoints();
}

function statRow(stat, user, stats) {
  const row = document.createElement("div");
  row.className = "builder-stat-row";

  const label = document.createElement("span");
  label.textContent = STAT_LABELS[stat];
  const base = document.createElement("span");
  base.textContent = String(user.pokemon.baseStats[stat]);
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.max = "32";
  input.step = "1";
  input.value = String(user.sp[stat] ?? 0);
  input.dataset.kind = "builder-sp";
  input.dataset.stat = stat;
  input.setAttribute("aria-label", `${STAT_LABELS[stat]} SP`);
  const final = document.createElement("strong");
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
    input.value = selected?.name ?? "";
    input.placeholder = "Choose a move";
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
        state = { ...state, user: applyControl(state.user, { kind: "move", index, value: move.id }) };
        renderMovePicks();
        render();
      },
      renderRow: (move, onSelect) => searchResultButton(move, onSelect, {
        preventBlur: true,
        small: `${move.type ?? "—"} · ${move.category ?? "—"}`,
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

function renderBulkPoints() {
  const matchups = bulkPointMatchups(state.user, threats);
  const spreadCount = matchups.reduce((total, { points }) => total + points.length, 0);
  const { primary, detail } = partitionBulkMatchups(matchups);

  elements.bulkCount.textContent = `${spreadCount} spreads · ${matchups.length} matchups`;
  elements.bulkPoints.replaceChildren(
    ...(matchups.length === 0
      ? [emptyText("No supported threat moves are available.")]
      : [
          ...bulkThreatCards(primary),
          ...(detail.length > 0 ? [bulkDetailDisclosure(detail)] : []),
        ]),
  );
}

function bulkThreatCards(matchups) {
  const groups = new Map();
  for (const matchup of matchups) {
    const id = normalizeId(matchup.scenario.threat.pokemon.id);
    if (!groups.has(id)) groups.set(id, { threat: matchup.scenario.threat, matchups: [] });
    groups.get(id).matchups.push(matchup);
  }
  return [...groups.values()].map(({ threat, matchups: threatMatchups }) =>
    analysisCard(threat, threatMatchups.map(bulkMovePanel)));
}

function bulkDetailDisclosure(matchups) {
  const details = document.createElement("details");
  details.className = "builder-more-detail";
  const summary = document.createElement("summary");
  summary.append(
    textSpan("More detail", "builder-more-detail-title"),
    textSpan(`${matchups.length} matchups at 3HKO or longer`, "builder-more-detail-count"),
  );
  const cards = document.createElement("div");
  cards.className = "builder-analysis-grid";
  cards.append(...bulkThreatCards(matchups));
  details.append(summary, cards);
  return details;
}

function bulkMovePanel({ scenario, damage, points }) {
  const defenseStat = scenario.move.overrideDefensiveStat ??
    (scenario.move.category === "Physical" ? "def" : "spd");
  return analysisMovePanel({
    move: scenario.move,
    damage,
    defensive: true,
    emptyMessage: "No better survival tier is reachable within 64 SP.",
    choices: points.map((point) => spreadChoice({
      label: `${point.totalSp} total SP`,
      stats: [
        ["HP", point.hpSp],
        [STAT_LABELS[defenseStat], point.defSp],
      ],
      fromKoText: point.fromKoText,
      toKoText: point.koText,
      damageText: `Max damage ${point.maxPct}%`,
      onSelect: () => {
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
        render();
      },
    })),
  });
}

function renderBreakPoints() {
  const moves = selectedMoves().filter(({ category }) => category === "Physical" || category === "Special");
  elements.breakCount.textContent = `${threats.length} Pokémon · ${moves.length} moves`;
  if (moves.length === 0 || threats.length === 0) {
    elements.breakPoints.replaceChildren(emptyText("Choose at least one damaging move."));
    return;
  }

  const cards = document.createElement("div");
  cards.className = "builder-analysis-grid";
  cards.append(...threats.map((threat) =>
    analysisCard(threat, moves.map((move) => breakMovePanel(move, threat)))));
  elements.breakPoints.replaceChildren(cards);
}

function breakMovePanel(move, threat) {
  const damage = yourDamage(state.user, move, { threat });
  const attackStat = move.overrideOffensiveStat ?? (move.category === "Physical" ? "atk" : "spa");
  return analysisMovePanel({
    move,
    damage,
    emptyMessage: "No higher KO tier is reachable with this nature.",
    loadChoices: () => significantBreakPoints(
      damage.koText,
      breakPoints(state.user, move, { threat }),
    ).map((point) => {
      const nature = point.requiresPlusNature
        ? attackStat === "atk" ? "Adamant" : "Modest"
        : state.user.nature;
      return spreadChoice({
        label: point.requiresPlusNature ? `${nature} nature` : `${point.sp} ${STAT_LABELS[attackStat]} SP`,
        stats: [
          ["Nature", nature],
          [STAT_LABELS[attackStat], point.sp],
        ],
        fromKoText: damage.koText,
        toKoText: point.achieves,
        damageText: `${point.minPct}–${point.maxPct}% damage`,
        onSelect: () => {
          state = {
            ...state,
            user: {
              ...state.user,
              nature,
              sp: { ...state.user.sp, [attackStat]: point.sp },
            },
          };
          render();
        },
      });
    }),
  });
}

function analysisCard(threat, movePanels) {
  const card = document.createElement("article");
  card.className = "builder-analysis-card";
  const heading = document.createElement("header");
  heading.className = "builder-analysis-heading";
  heading.append(
    pokemonLabel(threat.pokemon),
    textSpan(`${movePanels.length} ${movePanels.length === 1 ? "move" : "moves"}`, "builder-analysis-count"),
  );
  const moves = document.createElement("div");
  moves.className = "builder-analysis-moves";
  moves.append(...movePanels);
  card.append(heading, moves);
  return card;
}

function analysisMovePanel({ move, damage, defensive = false, choices, loadChoices, emptyMessage }) {
  const collapsible = typeof loadChoices === "function";
  const panel = document.createElement(collapsible ? "details" : "section");
  panel.className = "builder-analysis-move";
  const heading = document.createElement("div");
  heading.className = "builder-analysis-move-heading";
  const name = document.createElement("strong");
  name.textContent = move.name;
  heading.append(name, koBadge(damage.koText));
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
  const prompt = textSpan("View threshold spreads", "builder-spread-prompt");
  summary.append(heading, range, prompt);
  let loaded = false;
  panel.addEventListener("toggle", () => {
    if (!panel.open || loaded) return;
    const loadedChoices = loadChoices();
    renderSpreadChoices(list, loadedChoices, emptyMessage);
    prompt.textContent = loadedChoices.length === 1
      ? "1 threshold spread"
      : `${loadedChoices.length} threshold spreads`;
    loaded = true;
  });
  panel.append(summary, list);
  return panel;
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
    textSpan("Apply", "builder-spread-apply"),
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
  shift.append(koBadge(fromKoText, { muted: true }), textSpan("→", "builder-tier-arrow"), koBadge(toKoText));
  button.append(heading, statList, shift, textSpan(damageText, "builder-spread-damage"));
  button.addEventListener("click", onSelect);
  return button;
}

function koBadge(koText, { muted = false } = {}) {
  const badge = textSpan(koText, "builder-ko-badge");
  if (muted) badge.classList.add("muted");
  else if (/OHKO/i.test(koText)) badge.classList.add("danger");
  else if (/2HKO/i.test(koText)) badge.classList.add("warning");
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
  name.textContent = pokemon.name;
  label.append(name);
  return label;
}

function pokemonSprite(pokemon) {
  const wrap = document.createElement("span");
  wrap.className = "pokemon-minisprite";
  const image = document.createElement("img");
  image.loading = "lazy";
  image.alt = pokemon.name;
  const [source, fallbackSource] = pokemonSpriteUrls(pokemon);
  image.src = source;
  const fallback = document.createElement("span");
  fallback.hidden = true;
  fallback.textContent = pokemon.name.slice(0, 1);
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

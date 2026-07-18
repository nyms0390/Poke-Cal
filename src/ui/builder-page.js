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
import { createBuilderState, finalStats } from "./builder-state.js";
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
let selectedBreakCell = null;

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

  elements.bulkCount.textContent = `${matchups.length} with spreads`;
  elements.bulkPoints.replaceChildren(
    ...(matchups.length > 0
      ? matchups.map(({ scenario, damage, points }) => bulkScenarioRow(scenario, damage, points))
      : [emptyText("No survival tier improvements are reachable within 64 SP.")]),
  );
}

function bulkScenarioRow(scenario, damage, points) {
  const details = document.createElement("details");
  details.className = "builder-scenario";
  details.open = true;
  const summary = document.createElement("summary");
  summary.append(
    pokemonLabel(scenario.threat.pokemon),
    textSpan(scenario.move.name, "builder-scenario-move"),
    textSpan(`${damage.minPct}–${damage.maxPct}%`, "builder-scenario-damage"),
    textSpan(damage.koText, "builder-scenario-ko"),
  );
  const defenseStat = scenario.move.overrideDefensiveStat ??
    (scenario.move.category === "Physical" ? "def" : "spd");
  const list = document.createElement("div");
  list.className = "builder-point-list";
  list.replaceChildren(...points.map((point) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${point.totalSp} total SP · ` +
      `${point.hpSp} HP / ${point.defSp} ${STAT_LABELS[defenseStat]} · ` +
      `${point.fromKoText} → ${point.koText} · max ${point.maxPct}%`;
    button.addEventListener("click", () => {
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
    });
    return button;
  }));
  details.append(summary, list);
  return details;
}

function renderBreakPoints() {
  const moves = selectedMoves().filter(({ category }) => category === "Physical" || category === "Special");
  elements.breakCount.textContent = `${moves.length * threats.length} cells`;
  if (moves.length === 0 || threats.length === 0) {
    elements.breakPoints.replaceChildren(emptyText("Choose at least one damaging move."));
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "builder-break-matrix-wrap";
  const table = document.createElement("table");
  table.className = "builder-break-matrix";
  const header = document.createElement("tr");
  const corner = document.createElement("th");
  corner.scope = "col";
  corner.textContent = "Move";
  header.append(corner, ...threats.map((threat) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.append(pokemonLabel(threat.pokemon, { compact: true }));
    return cell;
  }));
  const head = document.createElement("thead");
  head.append(header);

  const body = document.createElement("tbody");
  body.append(...moves.map((move) => {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = move.name;
    row.append(heading, ...threats.map((threat) => breakCell(move, threat)));
    return row;
  }));
  table.append(head, body);
  wrap.append(table);

  const detail = selectedBreakDetail(moves);
  elements.breakPoints.replaceChildren(wrap, ...(detail ? [detail] : []));
}

function breakCell(move, threat) {
  const damage = yourDamage(state.user, move, { threat });
  const cell = document.createElement("td");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "builder-break-cell";
  button.textContent = damage.koText;
  button.title = `${damage.minPct}–${damage.maxPct}%`;
  button.style.setProperty("--break-color", damagePercentColor(damage.minPct, damage.maxPct));
  if (selectedBreakCell?.moveId === move.id && selectedBreakCell?.threatId === threat.pokemon.id) {
    button.classList.add("selected");
  }
  button.addEventListener("click", () => {
    selectedBreakCell = { moveId: move.id, threatId: threat.pokemon.id };
    renderBreakPoints();
  });
  cell.append(button);
  return cell;
}

function selectedBreakDetail(moves) {
  if (!selectedBreakCell) return null;
  const move = moves.find(({ id }) => id === selectedBreakCell.moveId);
  const threat = threats.find(({ pokemon }) => pokemon.id === selectedBreakCell.threatId);
  if (!move || !threat) return null;

  const current = yourDamage(state.user, move, { threat });
  const points = breakPoints(state.user, move, { threat });
  const attackStat = move.overrideOffensiveStat ?? (move.category === "Physical" ? "atk" : "spa");
  const detail = document.createElement("section");
  detail.className = "builder-break-detail";
  const heading = document.createElement("h3");
  heading.textContent = `${move.name} → ${threat.pokemon.name}`;
  const summary = document.createElement("p");
  summary.textContent = `Current: ${current.minPct}–${current.maxPct}% · ${current.koText}`;
  const list = document.createElement("div");
  list.className = "builder-point-list";
  list.replaceChildren(...(points.length > 0 ? points.map((point) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${point.requiresPlusNature ? "+nature · " : ""}${point.sp} ` +
      `${STAT_LABELS[attackStat]} SP · ${point.achieves} · ${point.minPct}–${point.maxPct}%`;
    button.addEventListener("click", () => {
      const nature = point.requiresPlusNature
        ? attackStat === "atk" ? "Adamant" : "Modest"
        : state.user.nature;
      state = {
        ...state,
        user: {
          ...state.user,
          nature,
          sp: { ...state.user.sp, [attackStat]: point.sp },
        },
      };
      render();
    });
    return button;
  }) : [emptyText("No higher KO tier is reachable with this nature.")]));
  detail.append(heading, summary, list);
  return detail;
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

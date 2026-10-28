import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import { createMyTeamStore, formatMemberPaste } from "../data/my-teams.js";
import { archiveRegulations, completeTeamQuery, searchTeamArchive, teamPokemonSuggestions } from "../data/team-search.js";
import { normalizeId } from "../identifiers.js";
import { catalogLoadedStatus, loadCatalogs, loadWithRecovery, showStatus } from "./bootstrap.js";
import { attachCombobox, browserStorage, itemLabel, moveChip, natureLabel, optionElement, POKEMON_RESULT_LIMIT, pokemonSpriteElements, searchResultButton, setRow } from "./components.js";
import {
  getLocale,
  initI18n,
  localizedName,
  localizedTerm,
  onLocaleChange,
  t,
  translateSubtree,
} from "../i18n.js";

const elements = {
  source: document.querySelector("#teams-source"),
  count: document.querySelector("#teams-count"),
  archive: document.querySelector("#teams-archive"),
  more: document.querySelector("#teams-more"),
  status: document.querySelector("#status"),
  form: document.querySelector("#teams-search-form"),
  regulation: document.querySelector("#teams-regulation"),
  query: document.querySelector("#teams-query"),
  suggestions: document.querySelector("#teams-suggestions"),
  searchStatus: document.querySelector("#teams-search-status"),
  submit: document.querySelector("#teams-search-submit"),
  reset: document.querySelector("#teams-reset"),
};

const myTeamStore = createMyTeamStore(browserStorage());
let catalogs = null;
let archive = null;
let selectedFormat = null;
let submittedQuery = "";
let queryPicker = null;
let filteredTournaments = [];
// Load phases behind the footer status line, kept as state rather than text so a later
// success cannot hide an earlier failure and the line can be re-localized.
const loadState = { catalogs: "loading", archive: "loading", failed: false };
const TOURNAMENT_BATCH_SIZE = 10;
let visibleCount = TOURNAMENT_BATCH_SIZE;

elements.more.addEventListener("click", () => {
  const tournaments = filteredTournaments;
  if (visibleCount >= tournaments.length) return;
  const nextCount = Math.min(visibleCount + TOURNAMENT_BATCH_SIZE, tournaments.length);
  const addedTournaments = tournaments.slice(visibleCount, nextCount)
    .map((tournament, offset) => renderTournament(tournament, visibleCount + offset));
  elements.archive.append(...addedTournaments);
  if (nextCount === tournaments.length && document.activeElement === elements.more) {
    addedTournaments[0].firstElementChild.focus();
  }
  visibleCount = nextCount;
  updateArchiveControls(tournaments.length);
});

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  queryPicker?.hide();
  if (!archive) return;
  submittedQuery = elements.query.value;
  visibleCount = TOURNAMENT_BATCH_SIZE;
  renderPage();
  if (elements.query.getAttribute("aria-invalid") === "true") elements.query.focus();
});
elements.regulation.addEventListener("change", () => {
  selectedFormat = elements.regulation.value;
  visibleCount = TOURNAMENT_BATCH_SIZE;
  renderPage();
});
elements.reset.addEventListener("click", () => {
  elements.query.value = "";
  submittedQuery = "";
  visibleCount = TOURNAMENT_BATCH_SIZE;
  renderPage();
  elements.query.focus();
  queryPicker?.hide();
});

initI18n();
initialize();

onLocaleChange(() => {
  queryPicker?.hide();
  renderStatus();
  if (loadState.failed) renderFailure();
  else if (loadState.archive === "failed") elements.source.textContent = t("teams.sourceError");
  if (!archive) return;
  const openKeys = [...elements.archive.querySelectorAll("details")]
    .filter((details) => details.open)
    .map((details) => details.dataset.teamsKey);
  renderPage();
  restoreOpenDetails(openKeys);
});

// Re-open the disclosures that were open before a re-render, parents first so that their
// lazily built children exist when the children are looked up.
function restoreOpenDetails(keys) {
  const ordered = [...keys].sort((a, b) => a.split("-").length - b.split("-").length);
  for (const key of ordered) {
    const details = [...elements.archive.querySelectorAll("details")]
      .find((candidate) => candidate.dataset.teamsKey === key);
    if (!details) continue;
    ensureDetailsContent(details);
    details.open = true;
  }
}

async function initialize() {
  try {
    const [loadedCatalogs, loadedArchive] = await Promise.all([
      loadCatalogs({
        onStatus: (_text, phase) => {
          loadState.catalogs = phase;
          renderStatus();
        },
        onLoaded: (data) => {
          catalogs = data;
          renderStatus();
        },
      }),
      loadWithRecovery(() => loadLimitlessTeamArchive(), {
        messageKey: "loadError.teams",
        devHint: "PokéCal tournament-team archive load failed. Locally, run `npm run sync-champions-data`.",
        onFailure: () => {
          loadState.archive = "failed";
          elements.source.textContent = t("teams.sourceError");
          renderStatus();
        },
        onRetry: () => {
          loadState.archive = "loading";
          elements.source.textContent = t("catalog.loading");
          renderStatus();
        },
      }).then((loaded) => {
        loadState.archive = loaded ? "loaded" : "failed";
        renderStatus();
        return loaded;
      }),
    ]);
    if (!loadedCatalogs) return;
    catalogs = loadedCatalogs;
    archive = loadedArchive;
    initializeQueryPicker();
    renderPage();
  } catch (error) {
    loadState.failed = true;
    renderStatus();
    renderFailure();
    console.error(error);
  }
}

function initializeQueryPicker() {
  const historical = (archive?.tournaments ?? []).flatMap((tournament) =>
    tournament.topCut.flatMap((team) => team.pokemon ?? []));
  const pokemon = [...catalogs.pokemon, ...historical];
  const getAllMatches = (query) => teamPokemonSuggestions(query, pokemon);
  queryPicker = attachCombobox({
    input: elements.query,
    resultsEl: elements.suggestions,
    getQuery: (value) => value.split("+").at(-1).trim(),
    getMatches: (query) => getAllMatches(query).slice(0, POKEMON_RESULT_LIMIT),
    getAllMatches,
    resultLimit: POKEMON_RESULT_LIMIT,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { strong: "" }),
    onSelect: (entry) => {
      elements.query.value = completeTeamQuery(elements.query.value, localizedName(entry));
      elements.query.focus();
      queryPicker.hide();
    },
  });
}

function renderStatus() {
  const { catalogs: catalogPhase, archive: archivePhase, failed } = loadState;
  let text = t("catalog.loading");
  let quiet = false;
  if (failed || archivePhase === "failed") text = t("teams.loadError");
  else if (catalogPhase === "failed") text = t("catalog.missing");
  else if (catalogPhase === "loaded" && catalogs) {
    text = catalogLoadedStatus(catalogs);
    quiet = true;
  }
  showStatus(elements.status, text, { quiet });
}

function renderFailure() {
  elements.source.textContent = t("teams.sourceError");
  elements.archive.replaceChildren(messagePanel(t("teams.archiveError")));
}

function renderPage() {
  const formats = archiveRegulations(archive);
  if (!formats.includes(selectedFormat)) {
    selectedFormat = formats.includes(archive?.format) ? archive.format : formats.at(-1) ?? "";
  }
  elements.regulation.replaceChildren(...(formats.length
    ? formats.map((format) => optionElement(format, format))
    : [optionElement("", t("teams.noRegulations"))]));
  elements.regulation.value = selectedFormat;
  for (const control of [elements.regulation, elements.query, elements.submit, elements.reset]) {
    control.disabled = formats.length === 0;
  }
  const result = searchTeamArchive(archive, { format: selectedFormat, query: submittedQuery, pokemon: catalogs?.pokemon, items: catalogs?.items });
  filteredTournaments = result.tournaments;
  const archivedCount = (archive?.tournaments ?? []).filter((tournament) =>
    (tournament.format ?? archive.format) === selectedFormat).length;
  elements.source.textContent = t("teams.source", { count: archivedCount, limit: selectedFormat || "—" });
  if (result.error) elements.query.setAttribute("aria-invalid", "true");
  else elements.query.removeAttribute("aria-invalid");
  elements.searchStatus.textContent = result.error
    ? t(`teams.queryError.${result.error.code}`, { terms: result.error.terms.join(" + ") })
    : result.searching ? t("teams.searchResults", { count: result.teamCount, tournaments: filteredTournaments.length, format: selectedFormat }) : "";
  updateArchiveControls(filteredTournaments.length);
  elements.archive.replaceChildren(...(result.error ? [] : filteredTournaments.length > 0
    ? filteredTournaments.slice(0, visibleCount).map((tournament, index) => renderTournament(tournament, index))
    : [messagePanel(t(result.searching ? "teams.noMatches" : "teams.noTournaments"))]));
  translateSubtree(elements.form);
  translateSubtree(elements.archive);
}

// A disclosure whose content is built the first time it opens. The full archive is tens of
// thousands of nodes; most cards are never opened, so only their summaries are rendered.
const detailsContent = new WeakMap();

function lazyDetails({ className, key, summary, buildContent }) {
  const details = document.createElement("details");
  details.className = className;
  details.dataset.teamsKey = key;
  details.append(summary);
  detailsContent.set(details, buildContent);
  // Build before the summary's default action opens the disclosure (pointer and keyboard both
  // dispatch click), so the content is present in the first opened frame; `toggle` covers
  // programmatic opening.
  summary.addEventListener("click", () => ensureDetailsContent(details));
  details.addEventListener("toggle", () => {
    if (details.open) ensureDetailsContent(details);
  });
  return details;
}

function ensureDetailsContent(details) {
  const buildContent = detailsContent.get(details);
  if (!buildContent) return;
  detailsContent.delete(details);
  details.append(buildContent());
}

function updateArchiveControls(total) {
  elements.count.textContent = t("teams.visibleCount", { count: Math.min(visibleCount, total), total });
  const remaining = Math.max(0, total - visibleCount);
  elements.more.hidden = total <= TOURNAMENT_BATCH_SIZE;
  elements.more.disabled = remaining === 0;
  elements.more.textContent = remaining > 0
    ? t("teams.showMore", { count: Math.min(TOURNAMENT_BATCH_SIZE, remaining) })
    : t("teams.allShown");
}

function renderTournament(tournament, index) {
  const key = String(index);
  const summary = document.createElement("summary");
  summary.className = "teams-tournament-summary";
  const title = document.createElement("span");
  title.className = "teams-tournament-title";
  title.textContent = tournament.name;
  const meta = document.createElement("span");
  meta.className = "teams-tournament-meta";
  meta.textContent = [
    tournament.format ?? archive.format,
    formatDate(tournament.date),
    tournament.players ? t("teams.playerCount", { count: tournament.players }) : "",
    t("teams.topCutCount", { count: tournament.topCut.length }),
  ].filter(Boolean).join(" · ");
  const count = document.createElement("strong");
  count.textContent = t("teams.topCutCount", { count: tournament.topCut.length });
  summary.append(summaryText(title, meta), count);

  return lazyDetails({
    className: "teams-tournament-card",
    key,
    summary,
    buildContent: () => {
      const content = document.createElement("div");
      content.className = "teams-tournament-content";
      content.append(tournamentMeta(tournament));
      const topCut = document.createElement("div");
      topCut.className = "teams-top-cut";
      topCut.append(...tournament.topCut.map((team, teamIndex) => renderTeam(team, `${key}-${teamIndex}`, tournament)));
      content.append(topCut);
      return content;
    },
  });
}

function renderTeam(team, key, tournament) {
  const summary = document.createElement("summary");
  summary.className = "teams-team-summary";
  const placement = document.createElement("strong");
  placement.className = "teams-placement";
  placement.textContent = team.placing ? `#${team.placing}` : "—";
  const player = document.createElement("span");
  player.className = "teams-player-name";
  player.textContent = team.playerName;
  const playerMeta = document.createElement("small");
  playerMeta.textContent = [
    team.playerId && team.playerId !== team.playerName ? `@${team.playerId}` : "",
    team.country ?? "",
    formatRecord(team.record),
  ].filter(Boolean).join(" · ");
  const preview = document.createElement("span");
  preview.className = "teams-preview";
  preview.setAttribute("aria-label", t("teams.previewLabel", { name: team.playerName }));
  for (let index = 0; index < 6; index += 1) {
    preview.append(teamPreviewSprite(team.pokemon[index]));
  }
  summary.append(placement, summaryText(player, playerMeta), preview);

  return lazyDetails({
    className: "teams-team-card",
    key,
    summary,
    buildContent: () => {
      const content = document.createElement("div");
      content.className = "teams-team-content";
      const source = document.createElement("div");
      source.className = "teams-source-row";
      const spread = document.createElement("span");
      spread.textContent = `${t("teams.spread")}: ${t("teams.spreadUnavailable")}`;
      const links = document.createElement("span");
      links.className = "teams-source-actions";
      links.append(externalLink(team.url, t("teams.openTeamList")));
      if (team.pokemon.length > 0) links.prepend(saveToMyTeamsButton(team, tournament));
      source.append(spread, links);
      content.append(source);
      const pokemonGrid = document.createElement("div");
      pokemonGrid.className = "teams-pokemon-grid";
      if (team.pokemon.length > 0) {
        pokemonGrid.append(...team.pokemon.map((submitted) => renderPokemon(submitted)));
      } else {
        pokemonGrid.append(messagePanel(t("teams.teamUnavailable")));
      }
      content.append(pokemonGrid);
      return content;
    },
  });
}

// Each submitted Pokémon as a set row: sprite, name and types, ability, nature, item (and Tera
// when submitted), then its moves.
function renderPokemon(submitted) {
  const resolved = resolvePokemon(submitted);
  const media = teamPreviewSprite(submitted);
  media.removeAttribute("role");
  media.removeAttribute("aria-label");
  media.setAttribute("aria-hidden", "true");
  const facts = [
    [t("label.ability"), displayCatalogValue(submitted.ability, catalogs.abilityLookup)],
    [t("label.nature"), submitted.nature ? natureLabel(submitted.nature) : ""],
    [t("label.item"), itemValue(submitted.item)],
    ...(submitted.tera ? [[t("teams.tera"), localizedTerm("type", submitted.tera)]] : []),
  ].map(([label, value]) => [label, value || t("teams.notPublished")]);
  const moves = submitted.moves.length > 0
    ? submitted.moves.map((move) => {
      const entry = catalogs.moveLookup.get(normalizeId(move));
      return moveChip(entry, { label: entry ? localizedName(entry) : move });
    })
    : [messagePanel(t("teams.notPublished"))];
  return setRow({
    className: "teams-set-row",
    media,
    title: resolved ? localizedName(resolved) : submitted?.name ?? t("teams.notPublished"),
    types: resolved?.types ?? [],
    facts,
    moves,
  });
}

// Copies a submitted team into My teams. Limitless publishes no spreads, so the pastes carry
// none and each member keeps its usage-based default spread when loaded.
function saveToMyTeamsButton(team, tournament) {
  const wrap = document.createElement("span");
  wrap.className = "teams-save-mine";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "team-action";
  button.textContent = t("myTeams.saveTournamentTeam");
  const status = document.createElement("span");
  status.className = "teams-save-status";
  status.setAttribute("role", "status");
  button.addEventListener("click", () => {
    const saved = myTeamStore.createTeam({
      name: [team.playerName, tournament?.name].map((part) => String(part ?? "").trim()).filter(Boolean).join(" · "),
      members: team.pokemon.map(submittedMemberPaste).filter(Boolean),
    });
    status.replaceChildren();
    const link = document.createElement("a");
    link.href = "./my-teams.html";
    link.textContent = t("myTeams.savedTournamentTeam", { name: saved.name });
    status.append(link);
  });
  wrap.append(button, status);
  return wrap;
}

function submittedMemberPaste(submitted) {
  const resolved = resolvePokemon(submitted);
  const catalogName = (value, lookup) => (value ? lookup.get(normalizeId(value))?.name ?? value : "");
  // Limitless lists a Mega as its base species holding the stone; save the Mega form so the
  // calculator races the form that battles.
  const species = resolved?.name ?? submitted?.name ?? "";
  const stone = submitted.item ? catalogs.itemLookup.get(normalizeId(submitted.item)) : null;
  const megaForm = Object.entries(stone?.megaStone ?? {})
    .find(([base]) => normalizeId(base) === normalizeId(species))?.[1];
  return formatMemberPaste({
    pokemon: megaForm ?? species,
    item: catalogName(submitted.item, catalogs.itemLookup),
    ability: catalogName(submitted.ability, catalogs.abilityLookup),
    nature: submitted.nature ?? "",
    moves: (submitted.moves ?? []).map((move) => catalogName(move, catalogs.moveLookup)),
  });
}

function tournamentMeta(tournament) {
  const meta = document.createElement("div");
  meta.className = "teams-source-row";
  const values = [
    tournament.organizer?.name,
    tournament.platform,
    tournament.isOnline === true ? t("teams.online") : tournament.isOnline === false ? t("teams.inPerson") : "",
    finalPhaseLabel(tournament.phases),
  ].filter(Boolean);
  const text = document.createElement("span");
  text.textContent = values.join(" · ");
  meta.append(text, externalLink(tournament.url, t("teams.openTournament")));
  return meta;
}

function finalPhaseLabel(phases = []) {
  const phase = [...phases].sort((a, b) => Number(b.phase) - Number(a.phase)).at(0);
  if (!phase) return "";
  return [phase.mode, phase.type].filter(Boolean).join(" ");
}

function teamPreviewSprite(submitted) {
  const wrap = document.createElement("span");
  wrap.className = "teams-sprite";
  const resolved = resolvePokemon(submitted);
  if (resolved) {
    wrap.append(...pokemonSpriteElements(resolved, { size: 42, lazy: true }));
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", localizedName(resolved));
  } else {
    wrap.classList.add("empty");
    wrap.textContent = "?";
    wrap.setAttribute("aria-label", t("teams.notPublished"));
  }
  return wrap;
}

function resolvePokemon(submitted) {
  if (!submitted) return null;
  return catalogs.pokemon.find((entry) =>
    normalizeId(entry.id) === normalizeId(submitted.id)
      || normalizeId(entry.name) === normalizeId(submitted.name),
  ) ?? null;
}

// The submitted item with its sprite, as on Lookup; unknown items keep their submitted text.
function itemValue(value) {
  if (!value) return "";
  const entry = catalogs.itemLookup.get(normalizeId(value));
  return entry ? itemLabel(entry) : value;
}

function displayCatalogValue(value, lookup) {
  if (!value) return "";
  const entry = lookup.get(normalizeId(value));
  return entry ? localizedName(entry) : value;
}

function summaryText(title, meta) {
  const wrap = document.createElement("span");
  wrap.className = "teams-summary-text";
  wrap.append(title, meta);
  return wrap;
}

function externalLink(href, label) {
  const link = document.createElement("a");
  link.className = "teams-source-link";
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  return link;
}

function messagePanel(text) {
  const message = document.createElement("p");
  message.className = "teams-message";
  message.textContent = text;
  return message;
}

function formatDate(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(timestamp);
}

function formatRecord(record) {
  if (!record) return "";
  return `${record.wins ?? 0}-${record.losses ?? 0}-${record.ties ?? 0}`;
}

import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import { normalizeId } from "../identifiers.js";
import { catalogLoadedStatus, loadCatalogs, loadWithRecovery } from "./bootstrap.js";
import { pokemonSpriteUrls } from "./components.js";
import {
  getLocale,
  initI18n,
  localizedName,
  localizedNatureOptionLabel,
  localizedTerm,
  onLocaleChange,
  t,
} from "../i18n.js";

const elements = {
  source: document.querySelector("#teams-source"),
  count: document.querySelector("#teams-count"),
  archive: document.querySelector("#teams-archive"),
  more: document.querySelector("#teams-more"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let archive = null;
// Load phases behind the footer status line, kept as state rather than text so a later
// success cannot hide an earlier failure and the line can be re-localized.
const loadState = { catalogs: "loading", archive: "loading", failed: false };
const TOURNAMENT_BATCH_SIZE = 10;
let visibleCount = TOURNAMENT_BATCH_SIZE;

elements.more.addEventListener("click", () => {
  const tournaments = archive?.tournaments ?? [];
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

initI18n();
initialize();

onLocaleChange(() => {
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
    renderPage();
  } catch (error) {
    loadState.failed = true;
    renderStatus();
    renderFailure();
    console.error(error);
  }
}

function renderStatus() {
  const { catalogs: catalogPhase, archive: archivePhase, failed } = loadState;
  let text = t("catalog.loading");
  if (failed || archivePhase === "failed") text = t("teams.loadError");
  else if (catalogPhase === "failed") text = t("catalog.missing");
  else if (catalogPhase === "loaded" && catalogs) text = catalogLoadedStatus(catalogs);
  elements.status.textContent = text;
}

function renderFailure() {
  elements.source.textContent = t("teams.sourceError");
  elements.archive.replaceChildren(messagePanel(t("teams.archiveError")));
}

function renderPage() {
  const tournaments = archive?.tournaments ?? [];
  elements.source.textContent = t("teams.source", {
    count: tournaments.length,
    limit: archive?.format ?? "M-C",
  });
  updateArchiveControls(tournaments.length);
  elements.archive.replaceChildren(
    ...(tournaments.length > 0
      ? tournaments.slice(0, visibleCount).map((tournament, index) => renderTournament(tournament, index))
      : [messagePanel(t("teams.noTournaments"))]),
  );
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
      topCut.append(...tournament.topCut.map((team, teamIndex) => renderTeam(team, `${key}-${teamIndex}`)));
      content.append(topCut);
      return content;
    },
  });
}

function renderTeam(team, key) {
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
      content.append(externalLink(team.url, t("teams.openTeamList")));
      const pokemonGrid = document.createElement("div");
      pokemonGrid.className = "teams-pokemon-grid";
      if (team.pokemon.length > 0) {
        pokemonGrid.append(...team.pokemon.map((submitted, index) => renderPokemon(submitted, `${key}-${index}`)));
      } else {
        pokemonGrid.append(messagePanel(t("teams.teamUnavailable")));
      }
      content.append(pokemonGrid);
      return content;
    },
  });
}

function renderPokemon(submitted, key) {
  const summary = document.createElement("summary");
  summary.className = "teams-pokemon-summary";
  summary.append(teamPreviewSprite(submitted, { showName: true }));
  const item = document.createElement("small");
  item.textContent = submitted.item ? `@ ${displayCatalogValue(submitted.item, catalogs.itemLookup)}` : "";
  summary.append(item);

  return lazyDetails({
    className: "teams-pokemon-card",
    key,
    summary,
    buildContent: () => pokemonContent(submitted),
  });
}

function pokemonContent(submitted) {
  const content = document.createElement("div");
  content.className = "teams-pokemon-content";
  content.append(factGrid([
    [t("label.ability"), displayCatalogValue(submitted.ability, catalogs.abilityLookup)],
    [t("label.item"), displayCatalogValue(submitted.item, catalogs.itemLookup)],
    [t("label.nature"), submitted.nature ? localizedNatureOptionLabel(submitted.nature) : ""],
    [t("teams.tera"), submitted.tera ? localizedTerm("type", submitted.tera) : t("teams.notSubmitted")],
    [t("teams.spread"), t("teams.spreadUnavailable")],
  ]));

  const moves = document.createElement("div");
  moves.className = "teams-moves";
  const movesLabel = document.createElement("span");
  movesLabel.className = "teams-fact-label";
  movesLabel.textContent = t("label.moves");
  const moveList = document.createElement("div");
  moveList.className = "teams-move-list";
  if (submitted.moves.length > 0) {
    moveList.append(...submitted.moves.map((move) => {
      const chip = document.createElement("span");
      chip.textContent = displayCatalogValue(move, catalogs.moveLookup);
      return chip;
    }));
  } else {
    moveList.append(messagePanel(t("teams.notPublished")));
  }
  moves.append(movesLabel, moveList);
  content.append(moves);
  return content;
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

function factGrid(facts) {
  const grid = document.createElement("div");
  grid.className = "teams-facts";
  for (const [label, value] of facts) {
    const fact = document.createElement("div");
    fact.className = "teams-fact";
    const labelElement = document.createElement("span");
    labelElement.className = "teams-fact-label";
    labelElement.textContent = label;
    const valueElement = document.createElement("strong");
    valueElement.textContent = value || t("teams.notPublished");
    fact.append(labelElement, valueElement);
    grid.append(fact);
  }
  return grid;
}

function teamPreviewSprite(submitted, { showName = false } = {}) {
  const wrap = document.createElement("span");
  wrap.className = "teams-sprite";
  const resolved = resolvePokemon(submitted);
  if (resolved) {
    const [source, fallbackSource] = pokemonSpriteUrls(resolved);
    const image = document.createElement("img");
    image.loading = "lazy";
    image.alt = "";
    image.width = 42;
    image.height = 42;
    image.src = source;
    let nextSource = fallbackSource;
    const fallback = document.createElement("span");
    fallback.setAttribute("aria-hidden", "true");
    fallback.hidden = true;
    fallback.textContent = localizedName(resolved).slice(0, 1);
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
    if (!showName) {
      wrap.setAttribute("role", "img");
      wrap.setAttribute("aria-label", localizedName(resolved));
    }
  } else {
    wrap.classList.add("empty");
    wrap.textContent = "?";
    wrap.setAttribute("aria-label", t("teams.notPublished"));
  }
  if (showName) {
    const label = document.createElement("span");
    label.className = "teams-pokemon-label";
    const name = document.createElement("span");
    name.className = "teams-pokemon-name";
    name.textContent = resolved ? localizedName(resolved) : submitted?.name ?? t("teams.notPublished");
    label.append(wrap, name);
    return label;
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

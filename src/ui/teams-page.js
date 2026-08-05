import { loadLimitlessTeamArchive } from "../data/limitless-teams.js";
import { normalizeId } from "../identifiers.js";
import { loadCatalogs } from "./bootstrap.js";
import { pokemonSpriteUrls } from "./components.js";
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

const elements = {
  source: document.querySelector("#teams-source"),
  count: document.querySelector("#teams-count"),
  archive: document.querySelector("#teams-archive"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let archive = null;

initI18n();
initialize();

onLocaleChange(() => {
  if (!archive) return;
  renderPage();
});

async function initialize() {
  try {
    const [loadedCatalogs, loadedArchive] = await Promise.all([
      loadCatalogs({
        onStatus: (text) => {
          elements.status.textContent = text;
        },
      }),
      loadLimitlessTeamArchive(),
    ]);
    if (!loadedCatalogs) return;
    catalogs = loadedCatalogs;
    archive = loadedArchive;
    renderPage();
  } catch (error) {
    elements.status.textContent = t("teams.loadError");
    elements.source.textContent = t("teams.sourceError");
    elements.archive.replaceChildren(messagePanel(t("teams.archiveError")));
    console.error(error);
  }
}

function renderPage() {
  const tournaments = archive?.tournaments ?? [];
  elements.source.textContent = t("teams.source", {
    count: tournaments.length,
    limit: archive?.format ?? "M-B",
  });
  elements.count.textContent = t("teams.tournamentCount", { count: tournaments.length });
  elements.archive.replaceChildren(
    ...(tournaments.length > 0
      ? tournaments.map(renderTournament)
      : [messagePanel(t("teams.noTournaments"))]),
  );
  applyDocumentTranslations();
}

function renderTournament(tournament) {
  const details = document.createElement("details");
  details.className = "teams-tournament-card";

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

  const content = document.createElement("div");
  content.className = "teams-tournament-content";
  content.append(tournamentMeta(tournament));
  const topCut = document.createElement("div");
  topCut.className = "teams-top-cut";
  topCut.append(...tournament.topCut.map(renderTeam));
  content.append(topCut);
  details.append(summary, content);
  return details;
}

function renderTeam(team) {
  const details = document.createElement("details");
  details.className = "teams-team-card";

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

  const content = document.createElement("div");
  content.className = "teams-team-content";
  const sourceLink = externalLink(team.url, t("teams.openTeamList"));
  content.append(sourceLink);
  const pokemonGrid = document.createElement("div");
  pokemonGrid.className = "teams-pokemon-grid";
  if (team.pokemon.length > 0) {
    pokemonGrid.append(...team.pokemon.map(renderPokemon));
  } else {
    pokemonGrid.append(messagePanel(t("teams.teamUnavailable")));
  }
  content.append(pokemonGrid);
  details.append(summary, content);
  return details;
}

function renderPokemon(submitted) {
  const details = document.createElement("details");
  details.className = "teams-pokemon-card";

  const summary = document.createElement("summary");
  summary.className = "teams-pokemon-summary";
  summary.append(teamPreviewSprite(submitted, { showName: true }));
  const item = document.createElement("small");
  item.textContent = submitted.item ? `@ ${displayCatalogValue(submitted.item, catalogs.itemLookup)}` : "";
  summary.append(item);

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
  details.append(summary, content);
  return details;
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
    image.alt = localizedName(resolved);
    image.src = source;
    let nextSource = fallbackSource;
    const fallback = document.createElement("span");
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

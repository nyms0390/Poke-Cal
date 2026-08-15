import {
  filterMoves,
  formatMoveAccuracy,
  formatMovePower,
  moveEffect,
} from "../data/catalog.js";
import {
  applyDocumentTranslations,
  getLocale,
  initI18n,
  localizedTerm,
  onLocaleChange,
  t,
} from "../i18n.js";
import { loadCatalogs, catalogLoadedStatus } from "./bootstrap.js";
import {
  moveCategoryMark,
  moveNameCell,
  textCell,
  updateSelectOptions,
} from "./components.js";

const MOVE_PROPERTY_FLAGS = [
  "contact",
  "sound",
  "punch",
  "bite",
  "pulse",
  "slicing",
  "bullet",
  "wind",
  "dance",
  "powder",
];

const elements = {
  search: document.querySelector("#move-search"),
  type: document.querySelector("#move-type"),
  category: document.querySelector("#move-category"),
  property: document.querySelector("#move-property"),
  count: document.querySelector("#move-count"),
  list: document.querySelector("#move-list"),
  source: document.querySelector("#moves-source"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let moves = [];

initI18n();
initialize();

for (const control of [elements.search, elements.type, elements.category, elements.property]) {
  control.addEventListener("input", renderMoveList);
}

onLocaleChange(() => {
  if (!catalogs) return;
  elements.status.textContent = catalogLoadedStatus(catalogs);
  renderPage();
});

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;
  moves = catalogs.moves;
  renderPage();
}

function renderPage() {
  elements.source.textContent = t("moves.source");
  renderFilterOptions();
  renderMoveList();
  applyDocumentTranslations();
}

function renderFilterOptions() {
  updateSelectOptions(elements.type, t("label.allTypes"), [
    ...new Set(moves.map(({ type }) => type).filter(Boolean)),
  ], (value) => localizedTerm("type", value));
  updateSelectOptions(elements.category, t("label.allCategories"), [
    ...new Set(moves.map(({ category }) => category).filter(Boolean)),
  ], (value) => localizedTerm("category", value));
  updateSelectOptions(elements.property, t("label.allMoveProperties"), MOVE_PROPERTY_FLAGS.filter(
    (flag) => moves.some((move) => move.flags?.[flag]),
  ), (value) => t(`moveProperty.${value}`));
}

function renderMoveList() {
  const filtered = filterMoves(moves, {
    query: elements.search.value,
    type: elements.type.value,
    category: elements.category.value,
    flag: elements.property.value,
  });
  elements.count.textContent = t("moves.count", { filtered: filtered.length, total: moves.length });

  if (filtered.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty-moves";
    cell.textContent = t("moves.noMatches");
    row.append(cell);
    elements.list.replaceChildren(row);
    return;
  }

  elements.list.replaceChildren(...filtered.map(renderMoveRow));
}

function renderMoveRow(move) {
  const row = document.createElement("tr");
  const categoryCell = textCell("", "", t("label.category"));
  categoryCell.append(moveCategoryMark(move.category));
  row.append(
    moveNameCell(move),
    categoryCell,
    textCell(formatMovePower(move.basePower), "numeric-cell", t("label.power")),
    textCell(formatMoveAccuracy(move.accuracy), "numeric-cell", t("label.accuracy")),
    textCell(String(move.pp ?? "—"), "numeric-cell", "PP"),
    textCell(moveEffect(move), "effect-cell", t("label.effect")),
  );
  if (getLocale() === "zh-TW") row.querySelector(".effect-cell").lang = "en";
  return row;
}

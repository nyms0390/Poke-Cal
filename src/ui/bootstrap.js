import { applyScopedUsage, sortByChampionsUsage } from "../data/catalog.js";
import { loadPokemonData } from "../data/data.js";
import { t } from "../i18n.js";
import { loadErrorPanel, updateLoadErrorPanel } from "./components.js";

const CATALOG_DEV_HINT =
  "PokéCal catalog load failed. Locally, run `npm run sync-data` to generate the Pokémon catalogs.";

// Shared catalog-loading boilerplate for the page controllers: fetch the Pokémon/ability/
// move/item catalogs and report a status line. On failure the page shows a localized
// role="alert" panel near the top of `main` with a Retry button and its working controls
// are disabled; the returned promise stays pending until a retry succeeds, so callers keep
// their simple `const data = await loadCatalogs(...)` flow without a page reload.
// `onStatus` receives the status text and its phase ("failed", "loading" or "loaded") so a
// page can re-localize or prioritize it; `onLoaded` (optional) receives the loaded data on
// success, before `loadCatalogs` resolves. The `null` return is kept for environments
// without a DOM, where no recovery UI can be shown.
export async function loadCatalogs({ onStatus, onLoaded } = {}) {
  const data = await loadWithRecovery(() => loadPokemonData(), {
    messageKey: "loadError.catalog",
    devHint: CATALOG_DEV_HINT,
    onFailure: () => onStatus?.(t("catalog.missing"), "failed"),
    onRetry: () => onStatus?.(t("catalog.loading"), "loading"),
  });
  if (!data) return null;
  onStatus?.(catalogLoadedStatus(data), "loaded");
  onLoaded?.(data);
  return data;
}

// Run `load` and, while it keeps failing, show one shared blocking error panel. Several
// sources (for example catalogs and the tournament-team archive) share the panel: each adds
// its own message and a single Retry re-attempts every pending source. Resolves with the
// first successful result. Without a document it logs and resolves `null`.
export function loadWithRecovery(load, { messageKey, devHint, onFailure, onRetry } = {}) {
  return new Promise((resolve) => {
    attempt({ messageKey, devHint, load, onFailure, onRetry, resolve });
  });
}

const pendingSources = new Set();
let errorPanel = null;
let blockedElements = [];
let retrying = false;

async function attempt(source) {
  let result;
  try {
    result = await source.load();
  } catch (error) {
    console.error(source.devHint ?? "PokéCal data load failed.", error);
    source.onFailure?.(error);
    if (!globalThis.document?.querySelector) {
      source.resolve(null);
      return;
    }
    pendingSources.add(source);
    if (!retrying) showRecoveryPanel();
    return;
  }
  pendingSources.delete(source);
  // Re-enable the page before the caller continues, so controls the page disables on purpose
  // during its own initialization are not re-enabled afterwards.
  if (pendingSources.size === 0) clearRecoveryPanel();
  source.resolve(result);
}

async function retryPending() {
  if (retrying || pendingSources.size === 0) return;
  retrying = true;
  if (errorPanel) updateLoadErrorPanel(errorPanel, { retrying: true });
  const sources = [...pendingSources];
  for (const source of sources) source.onRetry?.();
  await Promise.all(sources.map((source) => attempt(source)));
  retrying = false;
  if (pendingSources.size > 0) showRecoveryPanel();
}

function showRecoveryPanel() {
  const messageKeys = [...new Set([...pendingSources].map(({ messageKey }) => messageKey))];
  if (errorPanel) {
    updateLoadErrorPanel(errorPanel, { messageKeys, retrying: false });
    return;
  }
  errorPanel = loadErrorPanel({ messageKeys, onRetry: retryPending });
  insertPanel(errorPanel);
  blockPage();
}

function clearRecoveryPanel() {
  if (!errorPanel) return;
  const hadFocus = errorPanel.contains(document.activeElement);
  errorPanel.remove();
  errorPanel = null;
  unblockPage();
  if (hadFocus) focusMain();
}

// Place the panel directly below the page title/intro (or the header on the lookup page)
// so it is visible in the first viewport on every route.
function insertPanel(panel) {
  const main = document.querySelector("main") ?? document.body;
  const anchor = main.querySelector(":scope > .page-intro") ?? main.querySelector(":scope > header");
  if (anchor) anchor.after(panel);
  else main.prepend(panel);
}

// Disable the page's working surface while data is unavailable. The shared header (brand,
// navigation, language switch), page intro, footer status line, and the error panel stay
// usable; everything else in `main` is made inert and its form controls disabled.
function blockPage() {
  const main = document.querySelector("main");
  if (!main) return;
  const keep = (element) =>
    element === errorPanel || element.matches("header, .page-intro, footer, script, template");
  blockedElements = [...main.children].filter((element) => !keep(element));
  for (const element of blockedElements) {
    element.inert = true;
    element.dataset.loadBlocked = "";
    for (const control of element.querySelectorAll("input, select, textarea, button")) {
      if (control.disabled) continue;
      control.disabled = true;
      control.dataset.loadDisabled = "";
    }
  }
}

function unblockPage() {
  for (const element of blockedElements) {
    element.inert = false;
    delete element.dataset.loadBlocked;
    for (const control of element.querySelectorAll("[data-load-disabled]")) {
      control.disabled = false;
      delete control.dataset.loadDisabled;
    }
  }
  blockedElements = [];
}

function focusMain() {
  const main = document.querySelector("main");
  if (!main) return;
  if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
  main.focus({ preventScroll: true });
}

export function catalogLoadedStatus(data) {
  return t("catalog.loaded", {
    pokemon: data.pokemon.length,
    abilities: data.abilities.length,
    moves: data.moves.length,
  });
}

// Footer status for a page that resolves a `?pokemon=` hand-off: the catalog summary, or a
// notice when the requested id is not in the Champions catalog (for example a Pokémon that is
// not Champions-legal), so the fallback Pokémon is not shown silently.
export function requestedPokemonStatus(data, unavailableId = "") {
  return unavailableId
    ? t("catalog.requestedUnavailable", { id: String(unavailableId).slice(0, 60) })
    : catalogLoadedStatus(data);
}

// Shared "rank a catalog list by Champions usage" composition, repeated for abilities, items,
// and moves on both pages.
export function rankByUsage(entries, scope) {
  return sortByChampionsUsage(applyScopedUsage(entries, scope));
}

export function rankObservedUsage(entries, scope) {
  if (!scope?.length) return [];
  return rankByUsage(entries, scope).filter(({ champions }) =>
    Number.isFinite(champions?.usageCount),
  );
}

import { entryDescription } from "../data/catalog.js";
import { localizedName } from "../i18n.js";
import { itemLabel } from "./components.js";

// Ability and item details: one shared popup with the entry's full effect text (Champions text
// when it differs). Two kinds of anchor:
//  - a term: the ability or item name shown as a quiet button (`abilityTerm`, `itemTerm`). It
//    opens on hover after a short delay, on keyboard focus, and on tap or click, which also
//    keeps it open on touch screens.
//  - a select of abilities or items (`attachEntryTooltip`): hover and keyboard focus show the
//    chosen entry; on touch screens the popup follows the field while it has focus, so a new
//    pick shows its text at once.
// The popup is a manual popover in the top layer, so it shows above Battle's editor dialogs and
// the phone sheets. It never takes focus or pointer events; Escape and resizing close it, and
// it follows its anchor on scroll. The anchor names it with aria-describedby while it is open.

const HOVER_DELAY_MS = 350;
const HIDE_DELAY_MS = 120;
const anchors = new WeakMap();
let installed = false;
let tooltip = null;
let title = null;
let body = null;
let current = null;
let pinned = false;
let showTimer = 0;
let hideTimer = 0;
let lastPointerType = "mouse";

// The ability name as a term button (plain text when the catalog has no effect text).
export function abilityTerm(ability) {
  return entryTerm(ability, document.createTextNode(localizedName(ability)));
}

// The item, with its sprite, as a term button.
export function itemTerm(item) {
  return entryTerm(item, itemLabel(item));
}

// Without effect text the content stays as it is, so nothing looks like it has details.
export function entryTerm(entry, content) {
  if (!entryDescription(entry)) return content;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "entry-term";
  button.append(content);
  registerAnchor(button, () => entry, "term");
  return button;
}

// A select whose value names an ability or item; `getEntry` returns the chosen entry or null.
export function attachEntryTooltip(select, getEntry) {
  registerAnchor(select, getEntry, "select");
  select.addEventListener("change", () => {
    if (current === select) refresh();
  });
  return select;
}

function registerAnchor(element, getEntry, kind) {
  anchors.set(element, { getEntry, kind });
  element.dataset.entryTip = kind;
  install();
}

function install() {
  if (installed || typeof document?.addEventListener !== "function") return;
  installed = true;
  document.addEventListener("pointerdown", (event) => {
    lastPointerType = event.pointerType || "mouse";
    if (current && !current.contains(event.target)) hide();
  }, true);
  document.addEventListener("pointerover", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const anchor = anchorFrom(event.target);
    if (!anchor) return;
    clearTimeout(hideTimer);
    if (anchor === current) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(anchor), current ? 0 : HOVER_DELAY_MS);
  });
  document.addEventListener("pointerout", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const anchor = anchorFrom(event.target);
    if (!anchor || anchor.contains(event.relatedTarget)) return;
    clearTimeout(showTimer);
    if (anchor === current && !pinned && document.activeElement !== anchor) {
      hideTimer = setTimeout(hide, HIDE_DELAY_MS);
    }
  });
  document.addEventListener("focusin", (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || anchor !== event.target) return;
    const { kind } = anchors.get(anchor);
    // A click focuses too; let the click decide for terms, and leave mouse-opened selects alone.
    if (kind === "term" && !anchor.matches(":focus-visible")) return;
    if (kind === "select" && lastPointerType === "mouse" && !anchor.matches(":focus-visible")) return;
    clearTimeout(showTimer);
    show(anchor);
  });
  document.addEventListener("focusout", (event) => {
    if (event.target === current && !pinned) hide();
  });
  document.addEventListener("click", (event) => {
    const anchor = anchorFrom(event.target);
    if (!anchor || anchors.get(anchor).kind !== "term") return;
    clearTimeout(showTimer);
    if (anchor === current && pinned) {
      hide();
      return;
    }
    show(anchor);
    pinned = true;
  });
  // Capture, so Escape closes the popup before it closes a dialog around the anchor.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !current) return;
    event.preventDefault();
    event.stopPropagation();
    hide();
  }, true);
  // Follow the anchor while the page scrolls (phones scroll a focused field into view); a
  // resize can reflow everything, so it closes the popup.
  globalThis.addEventListener?.("scroll", () => {
    if (current) requestAnimationFrame(() => current && place(current));
  }, { capture: true, passive: true });
  globalThis.addEventListener?.("resize", () => current && hide());
}

function anchorFrom(target) {
  const anchor = target?.closest?.("[data-entry-tip]");
  return anchor && anchors.has(anchor) ? anchor : null;
}

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement("div");
  tooltip.id = "entry-tooltip";
  tooltip.className = "entry-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.setAttribute("popover", "manual");
  // The name is already localized; the effect text is English source text.
  tooltip.dataset.i18nSkip = "";
  title = document.createElement("strong");
  title.className = "entry-tooltip-title";
  body = document.createElement("p");
  body.className = "entry-tooltip-text";
  body.lang = "en";
  tooltip.append(title, body);
  return tooltip;
}

function show(anchor) {
  const entry = anchors.get(anchor)?.getEntry();
  const text = entryDescription(entry);
  if (!entry || !text || !anchor.isConnected) {
    if (anchor === current) hide();
    return;
  }
  if (current && current !== anchor) hide();
  ensureTooltip();
  title.textContent = localizedName(entry);
  body.textContent = text;
  // A modal dialog makes everything outside it inert, so the popup joins the anchor's dialog.
  const host = anchor.closest("dialog") ?? document.body;
  if (tooltip.parentElement !== host) {
    if (tooltip.matches(":popover-open")) tooltip.hidePopover();
    host.append(tooltip);
  }
  if (!tooltip.matches(":popover-open")) tooltip.showPopover();
  current = anchor;
  pinned = false;
  anchor.setAttribute("aria-describedby", tooltip.id);
  place(anchor);
}

function refresh() {
  if (current) show(current);
}

function hide() {
  clearTimeout(showTimer);
  clearTimeout(hideTimer);
  if (current) current.removeAttribute("aria-describedby");
  current = null;
  pinned = false;
  if (tooltip?.matches(":popover-open")) tooltip.hidePopover();
}

// Above the anchor when there is room (a native select opens its list below), else below; kept
// 16px inside the viewport, like the page gutters.
function place(anchor) {
  const rect = anchor.getBoundingClientRect();
  const gutter = 16;
  const gap = 6;
  const width = Math.min(320, globalThis.innerWidth - gutter * 2);
  tooltip.style.width = `${width}px`;
  tooltip.style.left = `${Math.max(gutter, Math.min(rect.left, globalThis.innerWidth - width - gutter))}px`;
  const height = tooltip.offsetHeight;
  const above = rect.top - gap - height;
  const top = above >= gutter || rect.bottom + gap + height > globalThis.innerHeight - gutter
    ? Math.max(gutter, above)
    : rect.bottom + gap;
  tooltip.style.top = `${top}px`;
}

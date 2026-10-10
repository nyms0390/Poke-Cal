// Phone set editing as a bottom sheet. On wide screens a page's editor stays where the HTML puts
// it; at phone widths it moves into a modal <dialog> that slides up from the bottom, so the
// results sit directly under a compact summary card and stay one tap from the editor. Moving
// the element (not cloning it) keeps every listener, value and combobox working unchanged.
import { localizedName, t, translateSubtree } from "../i18n.js";
import { pokemonSpriteElements } from "./components.js";

// Keep in step with the phone breakpoint in src/styles.css ("Set sheet").
export const SHEET_MEDIA_QUERY = "(max-width: 720px)";

let sheetCount = 0;

export function mountSetSheet({
  editor,
  id = `set-sheet-${++sheetCount}`,
  titleKey = "sheet.editSet",
  doneKey = "sheet.done",
  summaryHost = null,
  editKey = "sheet.editSet",
  media = SHEET_MEDIA_QUERY,
  onClose = null,
  // Show the summary card's Pokémon as the high-resolution HOME render (Battle's large set cards).
  artwork = false,
}) {
  const query = globalThis.matchMedia?.(media);
  const marker = document.createElement("span");
  marker.hidden = true;
  marker.className = "set-sheet-marker";
  editor.before(marker);

  const dialog = document.createElement("dialog");
  dialog.className = "set-sheet";
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-title`);

  const header = document.createElement("div");
  header.className = "set-sheet-header";
  const handle = document.createElement("span");
  handle.className = "set-sheet-handle";
  handle.setAttribute("aria-hidden", "true");
  const title = document.createElement("h2");
  title.id = `${id}-title`;
  title.dataset.i18n = titleKey;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "set-sheet-close";
  close.dataset.i18nAriaLabel = "sheet.close";
  close.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  header.append(handle, title, close);

  const body = document.createElement("div");
  body.className = "set-sheet-body";

  const footer = document.createElement("div");
  footer.className = "set-sheet-footer";
  const done = document.createElement("button");
  done.type = "button";
  done.className = "set-sheet-done";
  done.dataset.i18n = doneKey;
  footer.append(done);

  dialog.append(header, body, footer);
  document.body.append(dialog);
  translateSubtree(dialog);

  if (onClose) dialog.addEventListener("close", onClose);
  close.addEventListener("click", () => dialog.close());
  done.addEventListener("click", () => dialog.close());
  // A click whose target is the dialog itself landed on the backdrop, outside the sheet's box.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  const summary = summaryHost ? summaryCard({ id, editKey, artwork, onEdit: (button) => open(button) }) : null;
  if (summary) {
    summaryHost.replaceChildren(summary.element);
    translateSubtree(summary.element);
  }

  function isSheet() {
    return Boolean(query?.matches);
  }

  function place() {
    if (isSheet()) {
      if (editor.parentElement !== body) body.append(editor);
    } else {
      if (dialog.open) dialog.close();
      if (marker.nextElementSibling !== editor) marker.after(editor);
    }
  }

  function open() {
    if (!isSheet()) {
      editor.scrollIntoView({ block: "start" });
      return;
    }
    if (dialog.open) return;
    dialog.showModal();
    body.scrollTop = 0;
  }

  query?.addEventListener?.("change", place);
  place();

  return {
    element: dialog,
    open,
    close: () => dialog.close(),
    isSheet,
    update: (details) => summary?.update(details),
  };
}

function summaryCard({ id, editKey, onEdit, artwork = false }) {
  const element = document.createElement("div");
  element.className = "set-summary";
  const sprite = document.createElement("span");
  sprite.className = "set-summary-sprite";
  sprite.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "set-summary-text";
  const eyebrow = document.createElement("small");
  const name = document.createElement("strong");
  const meta = document.createElement("span");
  text.append(eyebrow, name, meta);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "set-summary-edit";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", id);
  const label = document.createElement("span");
  label.dataset.i18n = editKey;
  const chevron = document.createElement("span");
  chevron.className = "set-summary-chevron";
  chevron.setAttribute("aria-hidden", "true");
  button.append(label, chevron);
  button.addEventListener("click", () => onEdit(button));
  element.append(sprite, text, button);
  let spriteKey = null;

  return {
    element,
    update({ pokemon = null, label: eyebrowText = "", title = "", meta: metaText = "" } = {}) {
      const key = pokemon ? `p:${pokemon.id}` : "";
      if (key !== spriteKey) {
        spriteKey = key;
        sprite.hidden = !pokemon;
        element.classList.toggle("no-sprite", !pokemon);
        sprite.replaceChildren(...(pokemon ? pokemonSpriteElements(pokemon, { size: 56, artwork }) : []));
      }
      eyebrow.textContent = eyebrowText;
      eyebrow.hidden = !eyebrowText;
      name.textContent = title || (pokemon ? localizedName(pokemon) : "—");
      meta.textContent = metaText;
      // The visible label says "Edit set"; the accessible name says whose set it opens.
      button.setAttribute("aria-label", `${t(editKey)}: ${[eyebrowText, name.textContent].filter(Boolean).join(" ")}`);
    },
  };
}

// The phone-only bar pinned to the bottom of the page: one button per sheet plus an optional
// status (for example the SP budget), so editing never needs a scroll back to the top.
export function mountSheetBar({ actions, withStatus = false }) {
  const bar = document.createElement("div");
  bar.className = "sheet-bar";
  bar.setAttribute("role", "region");
  bar.dataset.i18nAriaLabel = "sheet.barLabel";
  const buttons = actions.map(({ sheet, labelKey }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sheet-bar-button";
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", sheet.element.id);
    const label = document.createElement("span");
    label.dataset.i18n = labelKey;
    const name = document.createElement("small");
    name.className = "sheet-bar-name";
    name.hidden = true;
    button.append(label, name);
    button.addEventListener("click", () => sheet.open());
    return { button, name };
  });
  bar.append(...buttons.map(({ button }) => button));
  const status = document.createElement("p");
  status.className = "sheet-bar-status";
  if (withStatus) bar.append(status);
  bar.classList.toggle("multi", actions.length > 1);
  document.querySelector("main")?.append(bar);
  document.body.classList.add("has-sheet-bar");
  translateSubtree(bar);
  return {
    element: bar,
    setStatus(text, state = "") {
      status.textContent = text;
      status.dataset.state = state;
    },
    setNames(names) {
      names.forEach((text, index) => {
        const entry = buttons[index];
        if (!entry) return;
        entry.name.textContent = text ?? "";
        entry.name.hidden = !text;
      });
    },
  };
}

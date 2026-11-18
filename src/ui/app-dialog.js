import { t } from "../i18n.js";

// Styled, translated stand-ins for window.confirm and window.prompt. Each call builds a modal
// <dialog>, resolves with the answer when it closes (Escape and Cancel count as "no"), and
// removes the dialog again. Styles: "App dialogs" in src/styles.css.

let dialogCount = 0;

function buildDialog({ message, confirmLabel, danger = false, input = null }) {
  dialogCount += 1;
  const id = `app-dialog-${dialogCount}`;
  const dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-text`);

  const form = document.createElement("form");
  form.method = "dialog";
  form.className = "app-dialog-form";

  const text = document.createElement(input ? "label" : "p");
  text.id = `${id}-text`;
  text.className = "app-dialog-text";
  text.textContent = message;
  form.append(text);

  let field = null;
  if (input) {
    field = document.createElement("input");
    field.type = "text";
    field.id = `${id}-input`;
    field.className = "app-dialog-input";
    field.autocomplete = "off";
    field.maxLength = input.maxLength ?? 60;
    field.value = input.value ?? "";
    text.htmlFor = field.id;
    form.append(field);
  }

  const actions = document.createElement("div");
  actions.className = "app-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "team-action";
  cancel.value = "cancel";
  cancel.textContent = t("dialog.cancel");
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.className = `team-action ${danger ? "danger" : "primary"}`;
  confirm.value = "confirm";
  confirm.textContent = confirmLabel;
  actions.append(cancel, confirm);
  form.append(actions);
  dialog.append(form);

  cancel.addEventListener("click", () => dialog.close("cancel"));
  return { dialog, field, cancel, confirm };
}

function open({ dialog, field, cancel }, focusConfirm) {
  document.body.append(dialog);
  dialog.returnValue = "";
  dialog.showModal();
  if (field) {
    field.focus();
    field.select();
  } else {
    // A destructive confirm starts on Cancel so Enter never deletes by accident.
    (focusConfirm ?? cancel).focus();
  }
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const confirmed = dialog.returnValue === "confirm";
      dialog.remove();
      resolve(confirmed);
    }, { once: true });
  });
}

// Resolves true when the person confirms. `danger` styles the confirm button as destructive.
export async function confirmDialog(message, { confirmLabel = t("dialog.confirm"), danger = false } = {}) {
  const parts = buildDialog({ message, confirmLabel, danger });
  return open(parts, danger ? null : parts.confirm);
}

// Resolves with the trimmed text, or null when the person cancels or leaves it empty.
export async function promptDialog(message, { value = "", confirmLabel = t("dialog.save"), maxLength } = {}) {
  const parts = buildDialog({ message, confirmLabel, input: { value, maxLength } });
  const confirmed = await open(parts);
  const text = parts.field.value.trim();
  return confirmed && text ? text : null;
}

// Asks for a saved-set name. A name already saved for this Pokémon needs a second "Replace"
// confirmation; declining reopens the name box so the person can pick another name.
export async function promptSetName(savedSetStore, pokemonId, defaultName) {
  const existing = new Set(savedSetStore.listSets(pokemonId).map((set) => set.name));
  let value = defaultName;
  for (;;) {
    const name = await promptDialog(t("battle.saveName"), { value });
    if (!name || !existing.has(name)) return name;
    const replace = await confirmDialog(t("savedSets.replaceConfirm", { name }), {
      confirmLabel: t("dialog.replace"),
      danger: true,
    });
    if (replace) return name;
    value = name;
  }
}

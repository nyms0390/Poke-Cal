// The shared team panel (docs/DECISIONS.md "Shared team panel") on the pages built around a
// "Your set" sidebar: Builder, Speed Tiers, Matchups and Compare sets.
// - The status row sits under "Your set": whether the set is a free set, a saved team member or
//   an edited one (Save to team / Revert / Add to team), and the Pokémon's saved sets.
// - The team block sits below the set editor: the working team (My teams' selected team) and a
//   tile per member; a tap loads that member as the shared set.
// - On phones the sidebar lives in the editor sheet, so `sheetAction` adds a Team button to the
//   pinned bar that opens a short sheet with just the status row and the team.
// The page owns the set: `loadSet(set)` writes it to the shared active set and shows it.
import { normalizeId } from "../data/catalog.js";
import { MY_TEAMS_STORAGE_KEY, createMyTeamStore, memberSlotFor } from "../data/my-teams.js";
import { SAVED_SETS_STORAGE_KEY, createSavedSetStore } from "../data/saved-sets.js";
import { pasteFromSet, sameBuild, setFromPaste, teamMemberSets, teamSetStatus } from "../data/team-sets.js";
import { getLocale, localizedName, t, translateSubtree } from "../i18n.js";
import { browserStorage, optionElement } from "./components.js";
import { teamMemberSprite } from "./my-teams-ui.js";

export function mountTeamPanel({ prefix, statusHost, blockHost, getCatalogs, readSet, loadSet }) {
  const teamStore = createMyTeamStore(browserStorage());
  const savedSetStore = createSavedSetStore(browserStorage());
  let message = "";
  let signature = "";

  const picker = pickerSheet(`${prefix}-team-sheet`);
  const confirm = switchDialog(`${prefix}-team-switch`);

  globalThis.addEventListener?.("storage", (event) => {
    if ([MY_TEAMS_STORAGE_KEY, SAVED_SETS_STORAGE_KEY, null].includes(event.key)) render({ force: true });
  });
  globalThis.addEventListener?.("pageshow", (event) => {
    if (event.persisted) render({ force: true });
  });

  function context() {
    const catalogs = getCatalogs();
    if (!catalogs) return null;
    const teams = teamStore.listTeams();
    const team = teamStore.selectedTeam();
    const members = teamMemberSets(team, catalogs);
    const set = readSet();
    const status = teamSetStatus(set, team, catalogs, members);
    const savedSets = set ? savedSetStore.listSets(set.pokemonId) : [];
    return { catalogs, teams, team, members, set, status, savedSets };
  }

  function render({ force = false } = {}) {
    const ctx = context();
    if (!ctx) return;
    const next = JSON.stringify([
      getLocale(), message, ctx.teams.map(({ id, name }) => [id, name]), ctx.team?.id, ctx.team?.members,
      ctx.set, ctx.status, ctx.savedSets,
    ]);
    if (!force && next === signature) return;
    signature = next;
    const focusedId = document.activeElement?.id;
    statusHost.replaceChildren(statusRow(ctx, prefix));
    blockHost.replaceChildren(teamBlock(ctx, prefix));
    picker.body.replaceChildren(statusRow(ctx, `${prefix}-sheet`), teamBlock(ctx, `${prefix}-sheet`, { heading: false }));
    for (const host of [statusHost, blockHost, picker.body]) translateSubtree(host);
    if (focusedId) document.getElementById(focusedId)?.focus();
  }

  function say(text) {
    message = text;
    render({ force: true });
  }

  // ---- Actions ----

  function loadMember(index) {
    const ctx = context();
    const member = ctx?.members[index];
    if (!member?.set) {
      say(t("myTeams.memberMissing"));
      return;
    }
    if (ctx.status.kind === "saved" && ctx.status.index === index) return;
    const load = () => {
      message = t("myTeams.loaded", { name: localizedName(member.pokemon), team: ctx.team.name });
      loadSet(member.set);
      render({ force: true });
    };
    if (ctx.status.kind !== "edited" || ctx.status.index === index) {
      load();
      return;
    }
    const editedName = localizedName(ctx.members[ctx.status.index].pokemon);
    confirm.ask(t("teamPanel.switchPrompt", { name: editedName }), (choice) => {
      if (choice === "save") saveToTeam({ quiet: true });
      if (choice === "save" || choice === "discard") load();
    });
  }

  function saveToTeam({ quiet = false } = {}) {
    const ctx = context();
    if (!ctx?.set || !ctx.team || ctx.status.index < 0) return;
    teamStore.setMember(ctx.team.id, ctx.status.index, pasteFromSet(ctx.set, ctx.catalogs));
    if (!quiet) say(t("myTeams.replaced", { name: setName(ctx), team: ctx.team.name }));
  }

  function revert() {
    const ctx = context();
    const member = ctx?.members[ctx.status.index];
    if (!member?.set) return;
    message = "";
    loadSet(member.set);
    render({ force: true });
  }

  function addToTeam() {
    const ctx = context();
    if (!ctx?.set) return;
    const text = pasteFromSet(ctx.set, ctx.catalogs);
    if (!ctx.team) {
      const created = teamStore.createTeam({ name: t("myTeams.defaultName", { number: 1 }), members: [text] });
      say(t("myTeams.added", { name: setName(ctx), team: created.name }));
      return;
    }
    const { outcome, index } = memberSlotFor(ctx.members.map(({ set }) => set?.pokemonId ?? ""), ctx.set.pokemonId);
    if (outcome === "full") {
      say(t("myTeams.teamFull", { team: ctx.team.name }));
      return;
    }
    teamStore.setMember(ctx.team.id, index, text);
    say(t(outcome === "replaced" ? "myTeams.replaced" : "myTeams.added", { name: setName(ctx), team: ctx.team.name }));
  }

  function selectTeam(id) {
    teamStore.selectTeam(id);
    message = "";
    render({ force: true });
  }

  function loadSavedSet(name) {
    const ctx = context();
    const saved = ctx?.savedSets.find((entry) => entry.name === name);
    const set = saved ? setFromPaste(saved.text, ctx.catalogs) : null;
    if (!set) return;
    message = "";
    loadSet(set);
    render({ force: true });
  }

  function saveSet() {
    const ctx = context();
    if (!ctx?.set) return;
    const name = globalThis.prompt?.(t("battle.saveName"), setName(ctx));
    if (!name?.trim()) return;
    const { pokemon, ability, item, moves } = setParts(ctx.set, ctx.catalogs);
    const saved = savedSetStore.saveSet(ctx.set.pokemonId, name, {
      pokemon, nature: ctx.set.nature, sp: ctx.set.sp, ability, item, moves,
    });
    if (saved) say(t("teamPanel.setSaved", { name: saved.name }));
  }

  function deleteSavedSet(name) {
    const ctx = context();
    if (!ctx?.set || !name) return;
    if (!globalThis.confirm?.(t("teamPanel.deleteSetConfirm", { name }))) return;
    savedSetStore.deleteSet(ctx.set.pokemonId, name);
    say(t("teamPanel.setDeleted", { name }));
  }

  // ---- Markup ----

  function statusRow(ctx, idPrefix) {
    const row = document.createElement("div");
    row.className = "team-set-status";
    row.dataset.kind = ctx.status.kind;
    if (ctx.status.kind === "none") return row;

    const state = document.createElement("p");
    state.className = "team-set-state";
    const chip = document.createElement("span");
    chip.className = "team-set-chip";
    chip.dataset.i18nSkip = "";
    chip.textContent = ctx.status.kind === "free"
      ? t("teamPanel.freeSet")
      : ctx.status.kind === "saved"
        ? t("teamPanel.onTeam", { team: ctx.team.name })
        : t("teamPanel.edited");
    state.append(chip);
    if (ctx.status.kind === "edited") {
      const detail = document.createElement("span");
      detail.className = "team-set-detail";
      detail.dataset.i18nSkip = "";
      detail.textContent = t("teamPanel.editedDetail", { team: ctx.team.name });
      state.append(detail);
    }
    row.append(state);

    const actions = document.createElement("div");
    actions.className = "team-set-actions";
    if (ctx.status.kind === "edited") {
      actions.append(
        actionButton("myTeams.saveMember", () => saveToTeam(), { primary: true }),
        actionButton("teamPanel.revert", revert),
      );
    } else if (ctx.status.kind === "free") {
      actions.append(actionButton(ctx.team ? "teamPanel.addToTeam" : "teamPanel.startTeam", addToTeam));
    }
    if (actions.childElementCount > 0) row.append(actions);

    const saved = document.createElement("div");
    saved.className = "team-saved-sets";
    const label = document.createElement("label");
    label.className = "set-editor-field";
    label.htmlFor = `${idPrefix}-saved-set`;
    label.dataset.i18n = "teamPanel.savedSet";
    label.textContent = "Saved set";
    const select = document.createElement("select");
    select.id = `${idPrefix}-saved-set`;
    select.dataset.i18nSkip = "";
    const current = ctx.savedSets.find((entry) => sameBuild(setFromPaste(entry.text, ctx.catalogs), ctx.set, ctx.catalogs));
    select.append(
      optionElement("", t(ctx.savedSets.length > 0 ? "teamPanel.chooseSavedSet" : "teamPanel.noSavedSets")),
      ...ctx.savedSets.map((entry) => optionElement(entry.name, entry.name)),
    );
    select.value = current?.name ?? "";
    select.disabled = ctx.savedSets.length === 0;
    select.addEventListener("input", () => loadSavedSet(select.value));
    saved.append(label, select, actionButton("teamPanel.saveSet", saveSet));
    if (current) saved.append(actionButton("teamPanel.deleteSet", () => deleteSavedSet(current.name), { danger: true }));
    row.append(saved);

    if (message) {
      const note = document.createElement("p");
      note.className = "team-panel-message";
      note.dataset.i18nSkip = "";
      note.setAttribute("role", "status");
      note.textContent = message;
      row.append(note);
    }
    return row;
  }

  function teamBlock(ctx, idPrefix, { heading = true } = {}) {
    const section = document.createElement("section");
    section.className = "team-panel";
    section.setAttribute("aria-labelledby", `${idPrefix}-team-title`);
    const head = document.createElement("div");
    head.className = "team-panel-heading";
    const title = document.createElement("h3");
    title.id = `${idPrefix}-team-title`;
    title.dataset.i18n = "teamPanel.team";
    title.textContent = "Team";
    if (!heading) title.classList.add("visually-hidden");
    const manage = document.createElement("a");
    manage.href = "./my-teams.html";
    manage.dataset.i18n = "myTeams.manage";
    manage.textContent = "Manage teams";
    head.append(title, manage);
    section.append(head);

    if (ctx.teams.length === 0) {
      const empty = document.createElement("p");
      empty.className = "team-panel-empty";
      empty.dataset.i18n = "teamPanel.noTeam";
      empty.textContent = "No team yet. Add this set to start one.";
      section.append(empty);
      return section;
    }

    const select = document.createElement("select");
    select.id = `${idPrefix}-team-select`;
    select.dataset.i18nSkip = "";
    select.setAttribute("aria-labelledby", `${idPrefix}-team-title`);
    select.append(...ctx.teams.map((team) => optionElement(team.id, team.name)));
    select.value = ctx.team?.id ?? "";
    select.addEventListener("input", () => selectTeam(select.value));
    section.append(select);

    if (!ctx.team || ctx.members.length === 0) {
      const empty = document.createElement("p");
      empty.className = "team-panel-empty";
      empty.dataset.i18n = "teamPanel.emptyTeam";
      empty.textContent = "This team has no Pokémon yet.";
      section.append(empty);
      return section;
    }

    const grid = document.createElement("div");
    grid.className = "team-panel-members";
    grid.append(...ctx.members.map((member) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-panel-member";
      button.disabled = !member.set;
      const current = ctx.status.index === member.index;
      button.setAttribute("aria-pressed", String(current));
      const edited = current && ctx.status.kind === "edited";
      button.classList.toggle("edited", edited);
      const name = member.pokemon ? localizedName(member.pokemon) : t("myTeams.unknownPokemon");
      const sprite = teamMemberSprite(member.pokemon, { size: 40 });
      sprite.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "team-panel-member-name";
      label.dataset.i18nSkip = "";
      label.textContent = name;
      button.append(sprite, label);
      if (edited) {
        const mark = document.createElement("span");
        mark.className = "team-panel-edited-mark";
        const text = document.createElement("span");
        text.className = "visually-hidden";
        text.textContent = t("teamPanel.edited");
        mark.append(text);
        button.append(mark);
      }
      button.addEventListener("click", () => loadMember(member.index));
      return button;
    }));
    section.append(grid);
    return section;
  }

  return {
    render,
    // For mountSheetBar: the phone bar's Team button opens the picker sheet.
    sheetAction: { sheet: picker, labelKey: "teamPanel.team" },
    // The working team's build of a Pokémon picked by search, so a team member opens as saved.
    memberSet(pokemonId) {
      const catalogs = getCatalogs();
      const id = normalizeId(pokemonId);
      if (!catalogs || !id) return null;
      return teamMemberSets(teamStore.selectedTeam(), catalogs).find(({ set }) => set?.pokemonId === id)?.set ?? null;
    },
    // The bar button's second line: the member in use, or the free set.
    barName() {
      const ctx = context();
      if (!ctx?.set) return "";
      const name = setName(ctx);
      return ctx.status.kind === "edited" ? `${name} · ${t("teamPanel.edited")}` : name;
    },
  };
}

function setName(ctx) {
  const pokemon = ctx.catalogs.pokemon.find((entry) => normalizeId(entry.id) === ctx.set?.pokemonId);
  return pokemon ? localizedName(pokemon) : "";
}

function setParts(set, catalogs) {
  return {
    pokemon: catalogs.pokemon.find((entry) => normalizeId(entry.id) === set.pokemonId) ?? null,
    ability: set.abilityId ? catalogs.abilityLookup?.get(set.abilityId) ?? null : null,
    item: set.itemId ? catalogs.itemLookup?.get(set.itemId) ?? null : null,
    moves: set.moveIds.map((id) => (id ? catalogs.moveLookup?.get(id) ?? null : null)).filter(Boolean),
  };
}

function actionButton(key, onClick, { primary = false, danger = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "team-action";
  button.classList.toggle("primary", primary);
  button.classList.toggle("danger", danger);
  button.dataset.i18n = key;
  button.textContent = t(key);
  button.addEventListener("click", onClick);
  return button;
}

// A short bottom sheet with the same frame as the set sheets (src/ui/set-sheet.js).
function pickerSheet(id) {
  const dialog = document.createElement("dialog");
  dialog.className = "set-sheet team-picker-sheet";
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.innerHTML = `
    <div class="set-sheet-header">
      <span class="set-sheet-handle" aria-hidden="true"></span>
      <h2 id="${id}-title" data-i18n="teamPanel.team">Team</h2>
      <button type="button" class="set-sheet-close" data-i18n-aria-label="sheet.close"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>
    <div class="set-sheet-body"></div>
    <div class="set-sheet-footer"><button type="button" class="set-sheet-done" data-i18n="sheet.done">Done</button></div>`;
  document.body.append(dialog);
  translateSubtree(dialog);
  for (const button of dialog.querySelectorAll(".set-sheet-close, .set-sheet-done")) {
    button.addEventListener("click", () => dialog.close());
  }
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  return {
    element: dialog,
    body: dialog.querySelector(".set-sheet-body"),
    open: () => {
      if (!dialog.open) dialog.showModal();
    },
  };
}

// "Save, discard, or keep editing" before loading another member over an edited one.
function switchDialog(id) {
  const dialog = document.createElement("dialog");
  dialog.className = "team-switch-dialog";
  dialog.id = id;
  dialog.setAttribute("aria-labelledby", `${id}-text`);
  dialog.innerHTML = `
    <p id="${id}-text" class="team-switch-text"></p>
    <div class="team-switch-actions">
      <button type="button" class="team-action primary" value="save" data-i18n="teamPanel.saveAndSwitch">Save and switch</button>
      <button type="button" class="team-action danger" value="discard" data-i18n="teamPanel.discard">Discard changes</button>
      <button type="button" class="team-action" value="keep" data-i18n="teamPanel.keepEditing">Keep editing</button>
    </div>`;
  document.body.append(dialog);
  translateSubtree(dialog);
  let onChoice = null;
  for (const button of dialog.querySelectorAll("button")) {
    button.addEventListener("click", () => dialog.close(button.value));
  }
  dialog.addEventListener("close", () => {
    const choice = dialog.returnValue || "keep";
    const callback = onChoice;
    onChoice = null;
    callback?.(choice);
  });
  return {
    ask(text, callback) {
      translateSubtree(dialog);
      dialog.querySelector(".team-switch-text").textContent = text;
      onChoice = callback;
      dialog.returnValue = "";
      dialog.showModal();
      dialog.querySelector("[value=keep]").focus();
    },
  };
}

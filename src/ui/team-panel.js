// The shared team panel (docs/DECISIONS.md "Shared team panel") on the pages built around a
// "Your set" sidebar: Builder, Speed Tiers and Matchups.
// - The team row sits under the Pokémon field: one sprite per member of the working team (My
//   teams' selected team); a tap loads that member as the shared set. An edited member carries a
//   dot, and an "Edited · Save to team · Revert" line shows under the row.
// - The working team's name sits in the "Your set" heading and hides or shows the row (kept per
//   device). The edited line stays visible while the row is hidden.
// - A "⋯" button beside the Pokémon field opens the set menu: switch team, the Pokémon's saved
//   sets, Save set as…, Add to team and Manage teams.
// - On phones the editor lives in a sheet, so a second copy of the row sits under the page's
//   summary card, always shown.
// The page owns the set: `loadSet(set)` writes it to the shared active set and shows it.
import { normalizeId } from "../data/catalog.js";
import { MY_TEAMS_STORAGE_KEY, createMyTeamStore, memberSlotFor } from "../data/my-teams.js";
import { SAVED_SETS_STORAGE_KEY, createSavedSetStore } from "../data/saved-sets.js";
import { pasteFromSet, sameBuild, setFromPaste, teamMemberSets, teamSetStatus } from "../data/team-sets.js";
import { getLocale, localizedName, t, translateSubtree } from "../i18n.js";
import { browserStorage } from "./components.js";
import { teamMemberSprite } from "./my-teams-ui.js";

export const TEAM_ROW_STORAGE_KEY = "pokecal.team-row.v1";

export function mountTeamPanel({ prefix, toggleHost, menuHost, rowHost, phoneHost = null, getCatalogs, readSet, loadSet }) {
  const storage = browserStorage();
  const teamStore = createMyTeamStore(storage);
  const savedSetStore = createSavedSetStore(storage);
  let message = "";
  let signature = "";
  let collapsed = readCollapsed(storage);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "team-toggle";
  toggle.id = `${prefix}-team-toggle`;
  toggle.setAttribute("aria-controls", `${prefix}-team-members`);
  toggle.addEventListener("click", () => {
    collapsed = !collapsed;
    writeCollapsed(storage, collapsed);
    render({ force: true });
  });
  toggleHost.append(toggle);

  const menu = setMenu(`${prefix}-set-menu`);
  menuHost.append(menu.button);
  menuHost.classList.add("has-set-menu");

  const row = document.createElement("div");
  row.className = "team-row";
  rowHost.after(row);
  const phoneRow = document.createElement("div");
  phoneRow.className = "team-row team-row-phone";
  phoneHost?.append(phoneRow);

  const confirm = switchDialog(`${prefix}-team-switch`);

  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === TEAM_ROW_STORAGE_KEY) collapsed = readCollapsed(storage);
    if ([MY_TEAMS_STORAGE_KEY, SAVED_SETS_STORAGE_KEY, TEAM_ROW_STORAGE_KEY, null].includes(event.key)) render({ force: true });
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
      getLocale(), message, collapsed, ctx.teams.map(({ id, name }) => [id, name]), ctx.team?.id, ctx.team?.members,
      ctx.set, ctx.status, ctx.savedSets,
    ]);
    if (!force && next === signature) return;
    signature = next;
    const focusedId = document.activeElement?.id;
    renderToggle(ctx);
    row.replaceChildren(...teamRow(ctx, prefix, { collapsible: true }));
    phoneRow.replaceChildren(...teamRow(ctx, `${prefix}-phone`, { collapsible: false }));
    menu.fill(menuItems(ctx));
    for (const host of [row, phoneRow, menu.list]) translateSubtree(host);
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

  function renderToggle(ctx) {
    toggle.hidden = !ctx.team;
    if (!ctx.team) return;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    const name = document.createElement("span");
    name.className = "team-toggle-name";
    name.textContent = ctx.team.name;
    const chevron = document.createElement("span");
    chevron.className = "team-toggle-chevron";
    chevron.setAttribute("aria-hidden", "true");
    toggle.replaceChildren(name, chevron);
    toggle.setAttribute("aria-label", t(collapsed ? "teamPanel.showMembers" : "teamPanel.hideMembers", { team: ctx.team.name }));
  }

  function teamRow(ctx, idPrefix, { collapsible }) {
    const parts = [];
    const hidden = collapsible && collapsed;
    if (ctx.team && !hidden) {
      if (ctx.members.length === 0) {
        const empty = document.createElement("p");
        empty.className = "team-row-empty";
        empty.dataset.i18n = "teamPanel.emptyTeam";
        empty.textContent = "This team has no Pokémon yet.";
        parts.push(empty);
      } else {
        parts.push(memberGrid(ctx, idPrefix));
      }
    }
    // With the row hidden, the edited line names the member it means.
    if (ctx.status.kind === "edited") parts.push(editedLine(ctx, { named: hidden }));
    if (message) {
      const note = document.createElement("p");
      note.className = "team-row-message";
      note.dataset.i18nSkip = "";
      note.setAttribute("role", "status");
      note.textContent = message;
      parts.push(note);
    }
    return parts;
  }

  function memberGrid(ctx, idPrefix) {
    const grid = document.createElement("div");
    grid.className = "team-row-members";
    grid.id = `${idPrefix}-team-members`;
    grid.setAttribute("role", "group");
    grid.dataset.i18nSkip = "";
    grid.setAttribute("aria-label", t("teamPanel.members", { team: ctx.team.name }));
    grid.append(...ctx.members.map((member) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "team-row-member";
      button.id = `${idPrefix}-team-member-${member.index}`;
      button.disabled = !member.set;
      const current = ctx.status.index === member.index;
      const edited = current && ctx.status.kind === "edited";
      button.setAttribute("aria-pressed", String(current));
      const name = member.pokemon ? localizedName(member.pokemon) : t("myTeams.unknownPokemon");
      button.setAttribute("aria-label", edited ? `${name}, ${t("teamPanel.edited")}` : name);
      button.title = name;
      const sprite = teamMemberSprite(member.pokemon, { size: 40 });
      sprite.setAttribute("aria-hidden", "true");
      button.append(sprite);
      if (edited) {
        const mark = document.createElement("span");
        mark.className = "team-panel-edited-mark";
        mark.setAttribute("aria-hidden", "true");
        button.append(mark);
      }
      button.addEventListener("click", () => loadMember(member.index));
      return button;
    }));
    return grid;
  }

  function editedLine(ctx, { named }) {
    const line = document.createElement("div");
    line.className = "team-edited";
    const chip = document.createElement("span");
    chip.className = "team-edited-chip";
    chip.dataset.i18nSkip = "";
    chip.textContent = named ? `${t("teamPanel.edited")} · ${setName(ctx)}` : t("teamPanel.edited");
    chip.title = t("teamPanel.editedDetail", { team: ctx.team.name });
    line.append(
      chip,
      actionButton("myTeams.saveMember", () => saveToTeam(), { primary: true }),
      actionButton("teamPanel.revert", revert),
    );
    return line;
  }

  function menuItems(ctx) {
    const items = [];
    if (ctx.teams.length > 0) {
      items.push(menuLabel("teamPanel.team"));
      for (const team of ctx.teams) {
        items.push(menuButton(team.name, () => selectTeam(team.id), { checked: team.id === ctx.team?.id }));
      }
      items.push(menuSeparator());
    }
    if (ctx.set) {
      items.push(menuLabel("teamPanel.savedSets"));
      const current = ctx.savedSets.find((entry) => sameBuild(setFromPaste(entry.text, ctx.catalogs), ctx.set, ctx.catalogs));
      if (ctx.savedSets.length === 0) {
        const none = document.createElement("p");
        none.className = "set-menu-note";
        none.dataset.i18n = "teamPanel.noSavedSets";
        none.textContent = "No saved sets yet";
        items.push(none);
      }
      for (const entry of ctx.savedSets) {
        items.push(menuButton(entry.name, () => loadSavedSet(entry.name), { checked: entry === current }));
      }
      items.push(menuSeparator(), menuButton(t("teamPanel.saveSetAs"), saveSet, { action: true }));
      if (current) items.push(menuButton(t("teamPanel.deleteSet", { name: current.name }), () => deleteSavedSet(current.name), { danger: true }));
      if (ctx.status.kind === "free") {
        items.push(menuButton(t(ctx.team ? "teamPanel.addToTeam" : "teamPanel.startTeam", { team: ctx.team?.name }), addToTeam, { action: true }));
      }
    }
    const manage = document.createElement("a");
    manage.className = "set-menu-item action";
    manage.href = "./my-teams.html";
    manage.dataset.i18n = "myTeams.manage";
    manage.textContent = "Manage teams";
    items.push(manage);
    return items;
  }

  return {
    render,
    // The working team's build of a Pokémon picked by search, so a team member opens as saved.
    memberSet(pokemonId) {
      const catalogs = getCatalogs();
      const id = normalizeId(pokemonId);
      if (!catalogs || !id) return null;
      return teamMemberSets(teamStore.selectedTeam(), catalogs).find(({ set }) => set?.pokemonId === id)?.set ?? null;
    },
  };
}

function readCollapsed(storage) {
  try {
    return storage?.getItem(TEAM_ROW_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(storage, collapsed) {
  try {
    if (collapsed) storage?.setItem(TEAM_ROW_STORAGE_KEY, "collapsed");
    else storage?.removeItem(TEAM_ROW_STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the row still toggles for this page view.
  }
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

function actionButton(key, onClick, { primary = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "team-action";
  button.classList.toggle("primary", primary);
  button.dataset.i18n = key;
  button.textContent = t(key);
  button.addEventListener("click", onClick);
  return button;
}

function menuLabel(key) {
  const label = document.createElement("p");
  label.className = "set-menu-label";
  label.dataset.i18n = key;
  label.textContent = t(key);
  return label;
}

function menuSeparator() {
  const line = document.createElement("hr");
  line.className = "set-menu-separator";
  return line;
}

function menuButton(text, onClick, { checked = null, action = false, danger = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "set-menu-item";
  button.classList.toggle("action", action);
  button.classList.toggle("danger", danger);
  button.dataset.i18nSkip = "";
  if (checked !== null) button.setAttribute("aria-pressed", String(checked));
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

// The "⋯" set menu: a popover (light dismiss and Escape come with it) placed under its button.
function setMenu(id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "set-menu-button";
  button.dataset.i18nAriaLabel = "teamPanel.setOptions";
  button.setAttribute("aria-label", t("teamPanel.setOptions"));
  button.setAttribute("aria-controls", id);
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/></svg>';

  const list = document.createElement("div");
  list.className = "set-menu";
  list.id = id;
  list.setAttribute("popover", "auto");
  list.setAttribute("aria-label", t("teamPanel.setOptions"));
  list.dataset.i18nAriaLabel = "teamPanel.setOptions";
  // Inside a phone sheet the popover must join the sheet's top layer, so it lives in the dialog.
  const host = () => button.closest("dialog") ?? document.body;
  host().append(list);

  function place() {
    const rect = button.getBoundingClientRect();
    const width = Math.min(260, globalThis.innerWidth - 32);
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(16, Math.min(rect.right - width, globalThis.innerWidth - width - 16))}px`;
    const below = rect.bottom + 6;
    const room = globalThis.innerHeight - below - 16;
    if (room >= 200 || room >= rect.top) {
      list.style.top = `${below}px`;
      list.style.bottom = "auto";
      list.style.maxHeight = `${Math.max(160, room)}px`;
    } else {
      list.style.top = "auto";
      list.style.bottom = `${globalThis.innerHeight - rect.top + 6}px`;
      list.style.maxHeight = `${rect.top - 22}px`;
    }
  }

  button.addEventListener("click", () => {
    if (list.parentElement !== host()) host().append(list);
    if (list.matches(":popover-open")) {
      list.hidePopover();
      return;
    }
    place();
    list.showPopover();
    list.querySelector("button, a")?.focus();
  });
  list.addEventListener("toggle", (event) => {
    const open = event.newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (!open && list.contains(document.activeElement)) button.focus();
  });
  // Any choice closes the menu; its own handler has already run.
  list.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) list.hidePopover();
  });

  return {
    button,
    list,
    fill(items) {
      list.replaceChildren(...items);
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

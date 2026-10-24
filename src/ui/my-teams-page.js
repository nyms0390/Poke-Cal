import {
  TEAM_MEMBER_LIMIT,
  createMyTeamStore,
  formatTeamPaste,
  parseTeamMembers,
  splitTeamPaste,
} from "../data/my-teams.js";
import { parseSetPaste } from "../data/set-paste.js";
import { formatSetWarning } from "../i18n-formatters.js";
import { getLocale, initI18n, localizedName, onLocaleChange, t, translateSubtree } from "../i18n.js";
import { catalogLoadedStatus, loadCatalogs } from "./bootstrap.js";
import { browserStorage } from "./components.js";
import { memberSetRow, teamMemberSprites, teamMemberBattleHref } from "./my-teams-ui.js";

const elements = {
  status: document.querySelector("#status"),
  newTeam: document.querySelector("#my-teams-new"),
  list: document.querySelector("#my-teams-list"),
  detail: document.querySelector("#my-teams-detail"),
  name: document.querySelector("#my-teams-name"),
  meta: document.querySelector("#my-teams-meta"),
  actions: document.querySelector("#my-teams-actions"),
  open: document.querySelector("#my-teams-open"),
  edit: document.querySelector("#my-teams-edit"),
  copy: document.querySelector("#my-teams-copy"),
  remove: document.querySelector("#my-teams-delete"),
  teamStatus: document.querySelector("#my-teams-status"),
  members: document.querySelector("#my-teams-members"),
  dialog: document.querySelector("#my-teams-dialog"),
  form: document.querySelector("#my-teams-form"),
  dialogTitle: document.querySelector("#my-teams-dialog-title"),
  dialogClose: document.querySelector("#my-teams-dialog-close"),
  nameInput: document.querySelector("#my-teams-name-input"),
  paste: document.querySelector("#my-teams-paste"),
  parse: document.querySelector("#my-teams-parse"),
  cancel: document.querySelector("#my-teams-cancel"),
};

const store = createMyTeamStore(browserStorage());
let catalogs = null;
// The team the dialog edits, or null while it creates a new team.
let editingId = null;

initI18n();
initialize();

onLocaleChange(() => {
  if (!catalogs) return;
  elements.status.textContent = catalogLoadedStatus(catalogs);
  render();
  if (elements.dialog.open) renderParse();
});

elements.newTeam.addEventListener("click", () => openDialog(null));
elements.edit.addEventListener("click", () => openDialog(store.selectedTeam()));
elements.copy.addEventListener("click", copySelectedTeam);
elements.remove.addEventListener("click", deleteSelectedTeam);
elements.open.addEventListener("click", () => {
  const team = store.selectedTeam();
  if (team) store.selectTeam(team.id);
});
elements.dialogClose.addEventListener("click", () => elements.dialog.close());
elements.cancel.addEventListener("click", () => elements.dialog.close());
elements.paste.addEventListener("input", renderParse);
elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveDialog();
});

async function initialize() {
  const data = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!data) return;
  catalogs = data;
  render();
}

function render() {
  const teams = store.listTeams();
  const selected = store.selectedTeam();
  elements.list.replaceChildren(...(teams.length > 0
    ? teams.map((team) => teamListButton(team, team.id === selected?.id))
    : [emptyMessage(t("myTeams.emptyList"))]));
  renderDetail(selected);
}

function teamListButton(team, selected) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "my-teams-item";
  button.setAttribute("aria-pressed", String(selected));
  const top = document.createElement("span");
  top.className = "my-teams-item-top";
  const name = document.createElement("strong");
  name.textContent = team.name;
  const meta = document.createElement("small");
  meta.textContent = t("myTeams.memberCount", { count: team.members.length });
  top.append(name, meta);
  button.append(top, teamMemberSprites(parseTeamMembers(team, catalogs), { size: 30 }));
  button.addEventListener("click", () => {
    store.selectTeam(team.id);
    elements.teamStatus.textContent = "";
    render();
  });
  return button;
}

function renderDetail(team) {
  for (const control of [elements.edit, elements.copy, elements.remove]) control.disabled = !team;
  elements.open.hidden = !team || team.members.length === 0;
  if (!team) {
    elements.name.textContent = t("myTeams.noTeams");
    elements.meta.textContent = "";
    elements.actions.hidden = true;
    elements.members.replaceChildren(emptyMessage(t("myTeams.emptyDetail")));
    return;
  }
  elements.actions.hidden = false;
  elements.name.textContent = team.name;
  elements.meta.textContent = [
    t("myTeams.memberCount", { count: team.members.length }),
    formatEdited(team.updatedAt),
  ].filter(Boolean).join(" · ");
  const members = parseTeamMembers(team, catalogs);
  elements.members.replaceChildren(...(members.length > 0
    ? members.map((member, index) => memberRow(team, member, index))
    : [emptyMessage(t("myTeams.emptyTeam"))]));
  translateSubtree(elements.members);
}

function memberRow(team, member, index) {
  const row = memberSetRow(member, catalogs);
  const actions = document.createElement("div");
  actions.className = "my-teams-member-actions";
  const pokemonName = member.parsed.pokemon ? localizedName(member.parsed.pokemon) : t("myTeams.unknownPokemon");
  if (member.parsed.pokemon) {
    const calc = document.createElement("a");
    calc.className = "team-action";
    calc.href = teamMemberBattleHref(team.id, index);
    calc.textContent = t("myTeams.calc");
    calc.setAttribute("aria-label", t("myTeams.calcLabel", { name: pokemonName }));
    actions.append(calc);
  }
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "team-action quiet";
  remove.textContent = t("myTeams.removeMember");
  remove.setAttribute("aria-label", t("myTeams.removeMemberLabel", { name: pokemonName }));
  remove.addEventListener("click", () => {
    store.removeMember(team.id, index);
    elements.teamStatus.textContent = t("myTeams.removed", { name: pokemonName });
    render();
  });
  actions.append(remove);
  row.append(actions);
  return row;
}

function openDialog(team) {
  editingId = team?.id ?? null;
  elements.dialogTitle.textContent = t(team ? "myTeams.editTeam" : "myTeams.newTeam");
  elements.nameInput.value = team?.name ?? "";
  elements.nameInput.placeholder = t("myTeams.defaultName", { number: store.listTeams().length + 1 });
  elements.paste.value = team ? formatTeamPaste(team) : "";
  renderParse();
  elements.dialog.showModal();
  elements.nameInput.focus();
}

// Live summary of what the paste holds: the Pokémon it found, any blocks past the sixth, and
// the parser's warnings (unknown names, SP over 66 is only warned about on the calculator).
function renderParse() {
  if (!catalogs) return;
  const { members } = splitTeamPaste(elements.paste.value);
  const parsed = members.slice(0, TEAM_MEMBER_LIMIT).map((text) => parseSetPaste(text, catalogs));
  const lines = [];
  if (members.length === 0) {
    lines.push(["", t("myTeams.parseEmpty")]);
  } else {
    const names = parsed.map((entry) => entry.pokemon ? localizedName(entry.pokemon) : "?");
    lines.push(["ok", t("myTeams.parseFound", { count: parsed.length, names: names.join(" · ") })]);
  }
  if (members.length > TEAM_MEMBER_LIMIT) {
    lines.push(["warn", t("myTeams.parseTooMany", { count: members.length - TEAM_MEMBER_LIMIT })]);
  }
  for (const entry of parsed) {
    for (const warning of entry.warnings) lines.push(["warn", formatSetWarning(warning, getLocale())]);
  }
  elements.parse.replaceChildren(...lines.map(([tone, text]) => {
    const line = document.createElement("p");
    if (tone) line.className = tone === "ok" ? "my-teams-parse-ok" : "my-teams-parse-warn";
    line.textContent = text;
    return line;
  }));
}

function saveDialog() {
  const { name: pastedName, members } = splitTeamPaste(elements.paste.value);
  const name = elements.nameInput.value.trim() || pastedName || elements.nameInput.placeholder;
  const kept = members.slice(0, TEAM_MEMBER_LIMIT);
  const team = editingId
    ? store.updateTeam(editingId, { name, members: kept })
    : store.createTeam({ name, members: kept });
  if (team) {
    store.selectTeam(team.id);
    elements.teamStatus.textContent = t("myTeams.saved", { name: team.name });
  }
  elements.dialog.close();
  render();
}

async function copySelectedTeam() {
  const team = store.selectedTeam();
  if (!team) return;
  try {
    await navigator.clipboard.writeText(formatTeamPaste(team));
    elements.teamStatus.textContent = t("myTeams.copied", { name: team.name });
  } catch {
    elements.teamStatus.textContent = t("myTeams.copyFailed");
    openDialog(team);
    elements.paste.select();
  }
}

function deleteSelectedTeam() {
  const team = store.selectedTeam();
  if (!team) return;
  if (!window.confirm(t("myTeams.deleteConfirm", { name: team.name }))) return;
  store.deleteTeam(team.id);
  elements.teamStatus.textContent = t("myTeams.deleted", { name: team.name });
  render();
}

function emptyMessage(text) {
  const message = document.createElement("p");
  message.className = "teams-message";
  message.textContent = text;
  return message;
}

function formatEdited(value) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp)) return "";
  return t("myTeams.edited", { date: new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(timestamp) });
}

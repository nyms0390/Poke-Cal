import { normalizeId } from "../data/catalog.js";
import { activeSetFromState, createActiveSetStore } from "../data/active-set.js";
import { searchPokemon } from "../data/pokemon.js";
import { popularOpponentPool, speedBreakpoints, speedTiers } from "../data/speed-line.js";
import { createThreatPreferencesStore } from "../data/threat-preferences.js";
import { threatList } from "../data/threats.js";
import { championsDefaultsForPokemon } from "../data/usage-defaults.js";
import { NATURES, natureOptionLabel } from "../engine/natures.js";
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
import { catalogLoadedStatus, loadCatalogs } from "./bootstrap.js";
import { attachCombobox, optionElement, pokemonSpriteUrls, searchResultButton } from "./components.js";
import { createLiveUpdater } from "./live-update.js";

const elements = {
  source: document.querySelector("#speed-source"),
  mode: document.querySelectorAll('input[name="speed-mode"]'),
  trickRoom: document.querySelector("#speed-trick-room"),
  pokemonSearch: document.querySelector("#speed-pokemon-search"),
  pokemonResults: document.querySelector("#speed-pokemon-results"),
  opponentSearch: document.querySelector("#speed-opponent-search"),
  opponentResults: document.querySelector("#speed-opponent-results"),
  popularCount: document.querySelector("#speed-popular-count"),
  popularSummary: document.querySelector("#speed-popular-summary"),
  manualOpponents: document.querySelector("#speed-manual-opponents"),
  nature: document.querySelector("#speed-nature"),
  sp: document.querySelector("#speed-sp"),
  userStage: document.querySelector("#speed-user-stage"),
  opponentStage: document.querySelector("#speed-opponent-stage"),
  userTailwind: document.querySelector("#speed-user-tailwind"),
  userParalysis: document.querySelector("#speed-user-paralysis"),
  userScarf: document.querySelector("#speed-user-scarf"),
  opponentTailwind: document.querySelector("#speed-opponent-tailwind"),
  opponentParalysis: document.querySelector("#speed-opponent-paralysis"),
  opponentScarf: document.querySelector("#speed-opponent-scarf"),
  presetInputs: document.querySelectorAll("input[data-preset]"),
  battleOnly: document.querySelectorAll("[data-battle-only]"),
  battleGroups: document.querySelectorAll("[data-battle-group]"),
  userSummary: document.querySelector("#speed-user-summary"),
  rowCount: document.querySelector("#speed-row-count"),
  axis: document.querySelector("#speed-axis"),
  status: document.querySelector("#status"),
};

let catalogs = null;
let user = null;
const activeSetStore = createActiveSetStore(browserStorage());
const threatPreferencesStore = createThreatPreferencesStore(browserStorage());
let popularOpponents = [];
let manualOpponents = [];
const updatePage = createLiveUpdater(render);

initI18n();
initialize();

onLocaleChange(() => {
  if (!catalogs) return;
  elements.status.textContent = catalogLoadedStatus(catalogs);
  renderNatureOptions();
  if (user) render();
});

async function initialize() {
  catalogs = await loadCatalogs({
    onStatus: (text) => {
      elements.status.textContent = text;
    },
  });
  if (!catalogs) return;

  elements.popularCount.value = String(threatPreferencesStore.readThreatCount());
  renderNatureOptions();
  for (const select of [elements.userStage, elements.opponentStage]) {
    select.replaceChildren(...Array.from({ length: 13 }, (_, index) => {
      const stage = index - 6;
      return optionElement(stage, stage > 0 ? `+${stage}` : String(stage));
    }));
    select.value = "0";
  }

  popularOpponents = threatList(catalogs.pokemon, {
    count: 50,
    moveLookup: catalogs.moveLookup,
  }).map((threat) => ({
    pokemon: threat.pokemon,
    likelyPresetLabel: threat.spPresets.speed.find(({ likely }) => likely)?.label ?? "",
  }));

  attachCombobox({
    input: elements.pokemonSearch,
    resultsEl: elements.pokemonResults,
    getMatches: pokemonMatches,
    onSelect: seedUser,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });
  attachCombobox({
    input: elements.opponentSearch,
    resultsEl: elements.opponentResults,
    getMatches: pokemonMatches,
    onSelect: addOpponent,
    renderRow: (entry, onSelect) => searchResultButton(entry, onSelect, { preventBlur: true }),
  });

  for (const input of [
    ...elements.mode,
    elements.trickRoom,
    elements.nature,
    elements.sp,
    elements.userStage,
    elements.opponentStage,
    elements.userTailwind,
    elements.userParalysis,
    elements.userScarf,
    elements.opponentTailwind,
    elements.opponentParalysis,
    elements.opponentScarf,
    elements.popularCount,
    ...elements.presetInputs,
  ]) input.addEventListener("input", handleControl);

  const requestedId = new URLSearchParams(globalThis.location?.search ?? "").get("pokemon");
  const requested = catalogs.pokemon.find(({ id }) => normalizeId(id) === normalizeId(requestedId));
  const activeSet = activeSetStore.readSet();
  const activePokemon = catalogs.pokemon.find(({ id }) => normalizeId(id) === activeSet?.pokemonId);
  const initialPokemon = requested ?? activePokemon ?? popularOpponents[0]?.pokemon ?? catalogs.pokemon[0];
  seedUser(initialPokemon, {
    activeSet: activeSet?.pokemonId === normalizeId(initialPokemon?.id) ? activeSet : null,
  });
}

function renderNatureOptions() {
  const selected = elements.nature.value;
  elements.nature.replaceChildren(
    ...Object.keys(NATURES).map((nature) => optionElement(
      nature,
      getLocale() === "en" ? natureOptionLabel(nature) : localizedNatureOptionLabel(nature),
    )),
  );
  if (selected) elements.nature.value = selected;
}

function pokemonMatches(query) {
  return searchPokemon(catalogs.pokemon, query, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    itemLookup: catalogs.itemLookup,
    limit: 8,
  });
}

function seedUser(pokemon, { activeSet = null } = {}) {
  if (!pokemon) return;
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: catalogs.abilityLookup,
    moveLookup: catalogs.moveLookup,
    items: catalogs.items,
  });
  const defaultSet = activeSetFromState(defaults);
  const initialSet = activeSet ?? defaultSet;
  updatePage(() => {
    activeSetStore.writeSet(initialSet);
    user = {
      pokemon,
      nature: initialSet.nature || defaults.nature,
      spe: initialSet.sp.spe ?? defaults.sp.spe ?? 0,
    };
    manualOpponents = manualOpponents.filter(({ pokemon: opponent }) =>
      normalizeId(opponent.id) !== normalizeId(pokemon.id));
  });
}

function addOpponent(pokemon) {
  if (!pokemon) return;
  const alreadyPresent = normalizeId(user?.pokemon.id) === normalizeId(pokemon.id) || selectedOpponents()
    .some((entry) => normalizeId(entry.pokemon.id) === normalizeId(pokemon.id));
  updatePage(() => {
    if (!alreadyPresent) {
      manualOpponents = [...manualOpponents, {
        pokemon,
        likelyPresetLabel: "max (neutral 32)",
        manual: true,
      }];
    }
    elements.opponentSearch.value = "";
  });
}

function removeOpponent(id) {
  updatePage(() => {
    manualOpponents = manualOpponents.filter(({ pokemon }) => normalizeId(pokemon.id) !== normalizeId(id));
  });
}

function handleControl(event) {
  if (!user) return;
  updatePage(() => {
    if (event.target === elements.popularCount) {
      event.target.value = String(threatPreferencesStore.writeThreatCount(event.target.value));
    }
    if (event.target === elements.nature) user = { ...user, nature: event.target.value };
    if (event.target === elements.sp) {
      const sp = Math.max(0, Math.min(32, Math.trunc(Number(event.target.value) || 0)));
      user = { ...user, spe: sp };
    }
    if ([...elements.presetInputs].includes(event.target) && ![...elements.presetInputs].some(({ checked }) => checked)) {
      event.target.checked = true;
    }
  });
}

function render() {
  if (!user) return;
  activeSetStore.writeSet(activeSetFromState({
    pokemon: user.pokemon,
    nature: user.nature,
    sp: { spe: user.spe },
  }, activeSetStore.readSet()));
  const mode = [...elements.mode].find(({ checked }) => checked)?.value ?? "battle";
  const battle = mode === "battle";
  for (const input of elements.battleOnly) input.disabled = !battle;
  for (const group of elements.battleGroups) group.classList.toggle("disabled", !battle);

  elements.pokemonSearch.value = localizedName(user.pokemon);
  elements.nature.value = user.nature;
  elements.sp.value = String(user.spe);
  elements.userSummary.textContent = battle
    ? t("speed.userSummary", { nature: localizedTerm("nature", user.nature), sp: user.spe })
    : t("speed.baseSummary", { value: user.pokemon.baseStats.spe });
  const popularCount = Number(elements.popularCount.value);
  elements.popularSummary.textContent = t("speed.popularSummary", { count: popularCount });
  elements.source.textContent = battle
    ? t("speed.battleSource", { count: popularCount })
    : t("speed.baseSource", { count: popularCount });
  renderManualOpponents();

  const options = {
    mode,
    trickRoom: elements.trickRoom.checked,
    presetFilter: [...elements.presetInputs].filter(({ checked }) => checked).map(({ value }) => value),
    userMods: modsFromControls("user"),
    opponentMods: modsFromControls("opponent"),
  };
  const rows = speedTiers(user, selectedOpponents(), options);
  const breakpoints = new Map(speedBreakpoints(user, rows).map((point) => [point.tierSpeed, point]));
  elements.rowCount.textContent = t("speed.tierCount", { count: rows.length });
  elements.axis.replaceChildren(...rows.map((row) => renderSpeedRow(row, breakpoints.get(row.speed))));
  applyDocumentTranslations();
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function selectedOpponents() {
  return popularOpponentPool(
    popularOpponents,
    manualOpponents,
    elements.popularCount.value,
    catalogs.pokemon,
    { excludePokemonId: user?.pokemon.id },
  );
}

function modsFromControls(side) {
  return {
    stage: Number(elements[`${side}Stage`].value),
    tailwind: elements[`${side}Tailwind`].checked,
    paralysis: elements[`${side}Paralysis`].checked,
    choiceScarf: elements[`${side}Scarf`].checked,
  };
}

function renderManualOpponents() {
  elements.manualOpponents.replaceChildren(...manualOpponents.map(({ pokemon }) => {
    const chip = document.createElement("span");
    chip.className = "speed-opponent-chip";
    chip.append(sprite(pokemon));
    const name = document.createElement("span");
    name.textContent = localizedName(pokemon);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", t("speed.remove", { name: localizedName(pokemon) }));
    remove.addEventListener("click", () => removeOpponent(pokemon.id));
    chip.append(name, remove);
    return chip;
  }));
}

function renderSpeedRow(row, breakpoint) {
  const item = document.createElement("div");
  item.className = "speed-axis-row";
  if (row.entries.some(({ isUser }) => isUser)) item.classList.add("user");

  const speed = document.createElement("strong");
  speed.textContent = String(row.speed);

  const pokemon = document.createElement("div");
  pokemon.className = "speed-axis-pokemon";
  for (const entry of row.entries) {
    const chip = document.createElement("span");
    chip.className = `speed-axis-entry${entry.isUser ? " user" : ""}`;
    chip.append(sprite(entry));
    const label = document.createElement("span");
    label.textContent = localizedName(entry);
    const preset = document.createElement("span");
    preset.className = "speed-axis-preset";
    const dot = document.createElement("span");
    dot.className = `speed-preset-dot speed-preset-${entry.presetKey}${entry.likely ? " speed-preset-likely" : ""}`;
    dot.setAttribute("aria-hidden", "true");
    preset.append(dot);
    chip.append(label, preset);
    pokemon.append(chip);
  }

  item.append(speed, pokemon, renderBreakpointChoices(breakpoint));

  if (row.entries.some(({ isUser }) => isUser)) {
    const divider = document.createElement("div");
    divider.className = "speed-user-divider";
    divider.textContent = t("speed.yourTier");
    item.append(divider);
  }
  return item;
}

function renderBreakpointChoices(point) {
  const choices = document.createElement("div");
  choices.className = "speed-axis-breakpoints";
  if (!point || point.choices.length === 0) {
    const label = document.createElement("span");
    label.textContent = point ? t("speed.unreachable") : "—";
    choices.append(label);
    return choices;
  }

  for (const choice of point.choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "speed-breakpoint-choice";
    button.textContent = `${localizedTerm("nature", choice.nature)} (${localizedTerm("speedClass", choice.natureLabel)}) · ${choice.requiredSp} SP`;
    button.addEventListener("click", () => {
      updatePage(() => {
        user = { ...user, spe: choice.requiredSp, nature: choice.nature };
      });
    });
    choices.append(button);
  }
  return choices;
}

function sprite(entry) {
  const wrap = document.createElement("span");
  wrap.className = "pokemon-minisprite";
  const image = document.createElement("img");
  image.loading = "lazy";
  image.alt = localizedName(entry);
  const [source, fallbackSource] = pokemonSpriteUrls(entry);
  image.src = source;
  const fallback = document.createElement("span");
  fallback.textContent = localizedName(entry).slice(0, 1);
  let nextSource = fallbackSource;
  image.addEventListener("error", () => {
    if (nextSource) {
      image.src = nextSource;
      nextSource = "";
      return;
    }
    image.remove();
    fallback.hidden = false;
  });
  fallback.hidden = true;
  wrap.append(image, fallback);
  return wrap;
}

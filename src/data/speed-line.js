import { NATURES } from "../engine/natures.js";
import { calculateSpeed } from "../engine/speed.js";
import { normalizeId } from "./catalog.js";
import { megaFamily, pokemonSpriteId } from "./pokemon.js";

const PRESETS = [
  { key: "max", label: "Max", sourceLabel: "max (+spe 32)", nature: "Timid", sp: 32 },
  { key: "fast", label: "Fast", sourceLabel: "max (neutral 32)", nature: "Hardy", sp: 32 },
  { key: "neutral", label: "Neutral", sourceLabel: "uninvested", nature: "Hardy", sp: 0 },
  { key: "slow", label: "Slow", sourceLabel: "min (-spe 0)", nature: "Brave", sp: 0 },
];

export const SUPPORTED_SPEED_ABILITIES = new Map([
  ["swiftswim", "Swift Swim"],
  ["chlorophyll", "Chlorophyll"],
  ["sandrush", "Sand Rush"],
  ["slushrush", "Slush Rush"],
  ["surgesurfer", "Surge Surfer"],
  ["unburden", "Unburden"],
]);
export const SPEED_ITEM_IDS = ["choicescarf", "ironball"];
const WEATHER_SPEED_ABILITIES = new Set(["swiftswim", "chlorophyll"]);
const PROFILE_LIMIT = 4;

export function popularOpponentPool(
  popularOpponents = [],
  manualOpponents = [],
  count = 10,
  pokemonCatalog = [],
  { excludePokemonId = "" } = {},
) {
  const limit = [10, 20, 30, 40, 50].includes(Number(count)) ? Number(count) : 10;
  const selectedPopular = popularOpponents.slice(0, limit);
  const rankedByPokemonId = new Map(
    selectedPopular.map((opponent) => [opponent.pokemon.id, opponent]),
  );
  const seenPokemonIds = new Set();
  const popular = selectedPopular.flatMap((opponent) =>
    (pokemonCatalog.length > 0 ? megaFamily(pokemonCatalog, opponent.pokemon) : [opponent.pokemon])
      .flatMap((pokemon) => {
        if (seenPokemonIds.has(pokemon.id)) return [];
        seenPokemonIds.add(pokemon.id);
        return [{ ...(rankedByPokemonId.get(pokemon.id) ?? opponent), pokemon }];
      }))
    .filter(({ pokemon }) => pokemon.id !== excludePokemonId);
  const popularIds = new Set(popular.map(({ pokemon }) => pokemon.id));
  return [
    ...popular,
    ...manualOpponents.filter(({ pokemon }) =>
      pokemon.id !== excludePokemonId && !popularIds.has(pokemon.id)),
  ];
}

export function speedTiers(user, opponents, options = {}) {
  if (!user?.pokemon) return [];
  const mode = options.mode === "base" ? "base" : "battle";
  const trickRoom = mode === "battle" && Boolean(options.trickRoom);
  const userMods = normalizedMods({ ...(user.mods ?? {}), ...(options.userMods ?? {}) });
  const opponentMods = normalizedMods(options.opponentMods);
  const presetFilter = new Set(options.presetFilter?.length ? options.presetFilter : PRESETS.map(({ key }) => key));

  if (mode === "base") {
    const entries = [
      speedEntry(user.pokemon, "Base", "base", true, false, 0, baseSpeed(user.pokemon)),
      ...opponents.map(({ pokemon }) => speedEntry(pokemon, "Base", "base", false, false, 0, baseSpeed(pokemon))),
    ];
    return groupedRows(entries, baseSpeed(user.pokemon), false, {
      mode,
      userMods: normalizedMods(),
      userSpeed: baseSpeed(user.pokemon),
    });
  }

  const userResult = calculatedSpeed(user.pokemon, {
    sp: user.spe,
    nature: user.nature,
    mods: {
      ...userMods,
      ability: userMods.ability ?? user.ability,
      item: userMods.item ?? user.item,
    },
    trickRoom,
  });
  const entries = [speedEntry(
    user.pokemon,
    "Your spread",
    "user",
    true,
    false,
    userMods.stage,
    userResult.modifiedSpeed,
    userResult.effectiveOrder,
    { source: "user", exact: true, nature: user.nature, sp: user.spe },
  )];

  for (const opponent of opponents) {
    const opponentEntries = [];
    const profiles = limitlessProfiles(opponent.pokemon);
    const fixedLikely = profiles.length === 0 ? presetKey(opponent.likelyPresetLabel) : "";
    for (const preset of PRESETS) {
      if (!presetFilter.has(preset.key)) continue;
      opponentEntries.push(opponentSpeedEntry(opponent.pokemon, {
        label: preset.label,
        key: preset.key,
        nature: preset.nature,
        sp: preset.sp,
        likely: preset.key === fixedLikely,
        source: "preset",
        sourceLabel: preset.sourceLabel,
        exact: false,
        assumed: true,
      }, opponentMods, trickRoom));
    }

    for (const row of ncpRows(opponent.pokemon)) {
      opponentEntries.push(...opponentVariants(opponent.pokemon, row, opponentMods, trickRoom, options));
    }
    const likelyProfile = profiles[0];
    for (const profile of selectedProfiles(profiles)) {
      const row = profileRow(profile, profile === likelyProfile);
      opponentEntries.push(...opponentVariants(opponent.pokemon, row, opponentMods, trickRoom, options));
    }
    entries.push(...deduplicateOpponentSpeeds(opponentEntries));
  }

  return groupedRows(entries, userResult.modifiedSpeed, trickRoom, {
    mode,
    userMods,
    userSpeed: userResult.modifiedSpeed,
  });
}

export function speedBreakpoints(user, rows) {
  const context = rows?.context;
  if (!user?.pokemon || context?.mode !== "battle") return [];

  return rows.flatMap((row) => {
    const opponentEntries = row.entries.filter(({ isUser }) => !isUser);
    if (opponentEntries.length === 0) return [];

    const natureChoices = [
      { nature: natureForSpeedClass(user.nature, "positive"), natureLabel: "+Spe" },
      { nature: natureForSpeedClass(user.nature, "neutral"), natureLabel: "Neutral" },
      { nature: natureForSpeedClass(user.nature, "negative"), natureLabel: "-Spe" },
    ];
    const choices = natureChoices.flatMap(({ nature, natureLabel }) => {
      const requiredSp = minimumSpAbove(user, context.userMods, row.speed, nature);
      return requiredSp === null ? [] : [{ nature, natureLabel, requiredSp }];
    });
    return [{ tierSpeed: row.speed, choices }];
  });
}

function natureForSpeedClass(currentNature, speedClass) {
  const nature = NATURES[currentNature] ?? NATURES.Hardy;
  const currentClass = nature.up === "spe" ? "positive" : nature.down === "spe" ? "negative" : "neutral";
  if (currentClass === speedClass) return currentNature;
  if (speedClass === "positive") return "Timid";
  if (speedClass === "negative") return "Brave";
  return "Hardy";
}

function minimumSpAbove(user, mods, tierSpeed, nature) {
  for (let sp = 0; sp <= 32; sp += 1) {
    const result = calculatedSpeed(user.pokemon, { sp, nature, mods, trickRoom: false });
    if (result.modifiedSpeed > tierSpeed) return sp;
  }
  return null;
}

function calculatedSpeed(pokemon, { sp = 0, nature = "Hardy", mods, trickRoom }) {
  const speedMods = abilitySpeedMods(mods);
  const itemMultiplier = speedMods.abilityActive && normalizeEntityId(mods.ability) === "unburden"
    ? 1
    : mods.itemSpeedMultiplier ?? 1;
  return calculateSpeed({
    baseSpeed: baseSpeed(pokemon),
    sp: clampInteger(sp, 0, 32),
    nature: nature in NATURES ? nature : "Hardy",
    stage: mods.stage,
    tailwind: mods.tailwind,
    status: mods.paralysis ? "paralysis" : "",
    speedMultiplier: (speedMods.choiceScarf ? 1.5 : 1) * itemMultiplier *
      (speedMods.abilityActive ? 2 : 1),
    trickRoom,
  });
}

function speedEntry(
  pokemon,
  presetLabel,
  presetKey,
  isUser,
  likely,
  stage,
  speed,
  order = speed,
  details = {},
) {
  const entry = {
    id: pokemon.id,
    name: pokemon.name,
    baseSpecies: pokemon.baseSpecies,
    aliases: pokemon.aliases,
    localizations: pokemon.localizations,
    spriteId: pokemonSpriteId(pokemon),
    presetLabel,
    presetKey,
    isUser,
    stage,
    speed,
    order,
    ...details,
  };
  if (likely !== undefined) entry.likely = likely;
  return entry;
}

function opponentSpeedEntry(pokemon, row, opponentMods, trickRoom) {
  const itemId = normalizeEntityId(row.item);
  const abilityId = normalizeEntityId(row.ability);
  const result = calculatedSpeed(pokemon, {
    sp: row.sp,
    nature: row.nature,
    mods: {
      ...opponentMods,
      choiceScarf: false,
      ability: row.ability,
      item: row.item,
      abilityActive: row.abilityActive,
      itemSpeedMultiplier: row.itemSpeedMultiplier,
    },
    trickRoom,
  });
  return speedEntry(
    pokemon,
    row.label,
    row.key,
    false,
    row.likely,
    opponentMods.stage,
    result.modifiedSpeed,
    result.effectiveOrder,
    {
      nature: row.nature,
      sp: row.sp,
      item: row.item,
      itemSpeedMultiplier: row.itemSpeedMultiplier,
      ability: row.ability,
      source: row.source,
      sourceLabel: row.sourceLabel,
      setLabel: row.setLabel,
      exact: row.exact,
      assumed: row.assumed,
      usageCount: row.usageCount,
      usagePercent: row.usagePercent,
      choiceScarf: row.choiceScarf,
      abilityActive: row.abilityActive,
      itemConsumed: row.itemConsumed,
      supportedAbility: SUPPORTED_SPEED_ABILITIES.has(abilityId),
      choiceScarfItem: itemId === "choicescarf",
    },
  );
}

function opponentVariants(pokemon, row, opponentMods, trickRoom, options) {
  const inactive = {
    ...row,
    choiceScarf: row.source === "NCP" || row.source === "Limitless"
      ? normalizeEntityId(row.item) === "choicescarf"
      : false,
    abilityActive: false,
    itemConsumed: false,
    itemSpeedMultiplier: speedItemMultiplier(row.item),
  };
  const rows = [opponentSpeedEntry(pokemon, inactive, opponentMods, trickRoom)];
  const abilityId = normalizeEntityId(row.ability);
  if (!options.includeActiveSpeedAbilities || !canActivateAbility(row)) return rows;

  const active = {
    ...row,
    label: `${row.label} · active`,
    key: row.key,
    likely: row.likely,
    abilityActive: true,
    itemConsumed: abilityId === "unburden",
    choiceScarf: abilityId === "unburden" ? false : inactive.choiceScarf,
    itemSpeedMultiplier: abilityId === "unburden" ? 1 : inactive.itemSpeedMultiplier,
  };
  rows[0].likely = row.likely ? false : row.likely;
  rows.push(opponentSpeedEntry(pokemon, active, opponentMods, trickRoom));
  return rows;
}

function canActivateAbility(row) {
  const abilityId = normalizeEntityId(row.ability);
  if (!SUPPORTED_SPEED_ABILITIES.has(abilityId)) return false;
  return !(normalizeEntityId(row.item) === "utilityumbrella" && WEATHER_SPEED_ABILITIES.has(abilityId));
}

function limitlessProfiles(pokemon) {
  return (pokemon?.champions?.usage?.speedProfiles ?? [])
    .flatMap((profile) => {
      const nature = canonicalNature(profile?.nature);
      return nature && profile?.ability && profile?.item ? [{ ...profile, nature }] : [];
    })
    .sort((a, b) => Number(b.usageCount ?? 0) - Number(a.usageCount ?? 0));
}

function selectedProfiles(profiles) {
  const selected = [];
  const seen = new Set();
  const add = (profile) => {
    const key = profileKey(profile);
    if (!key || seen.has(key)) return;
    seen.add(key);
    selected.push(profile);
  };
  profiles.slice(0, PROFILE_LIMIT).forEach(add);
  for (const abilityId of SUPPORTED_SPEED_ABILITIES.keys()) {
    add(profiles.find((profile) => normalizeEntityId(profile.ability) === abilityId));
  }
  return selected;
}

function profileRow(profile, likely) {
  const sp = natureSpeedClass(profile.nature) === "negative" ? 0 : 32;
  return {
    label: `${profile.nature} · ${entityName(profile.item)} · ${entityName(profile.ability)}`,
    key: "limitless",
    nature: profile.nature,
    sp,
    item: entity(profile.item),
    ability: entity(profile.ability),
    source: "Limitless",
    sourceLabel: "Limitless profile",
    exact: false,
    assumed: true,
    usageCount: profile.usageCount,
    usagePercent: profile.usagePercent,
    likely,
  };
}

function ncpRows(pokemon) {
  const seen = new Set();
  return (pokemon?.champions?.ncp?.sets ?? []).flatMap((set) => {
    const sp = Number(set?.sps?.spe);
    if (!set?.nature || !String(set.item ?? "").trim() || !String(set.ability ?? "").trim() ||
      !Number.isFinite(sp)) return [];
    const item = entity(set.item);
    const ability = set.ability ? entity(set.ability) : null;
    const key = [set.nature, sp, normalizeEntityId(item), normalizeEntityId(ability)].join("\u0000");
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      label: set.name || set.spreadName || "NCP set",
      key: "ncp",
      nature: set.nature,
      sp: clampInteger(sp, 0, 32),
      item,
      ability,
      source: "NCP",
      sourceLabel: "NCP curated",
      setLabel: set.name || set.spreadName || "NCP set",
      exact: true,
      assumed: false,
    }];
  });
}

function profileKey(profile) {
  if (!profile) return "";
  return [profile.nature, normalizeEntityId(profile.ability), normalizeEntityId(profile.item)].join("\u0000");
}

function natureSpeedClass(nature) {
  const value = NATURES[nature] ?? NATURES.Hardy;
  return value.down === "spe" ? "negative" : value.up === "spe" ? "positive" : "neutral";
}

function canonicalNature(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return Object.keys(NATURES).find((nature) => nature.toLowerCase() === normalized) ?? null;
}

export function speedItemMultiplier(item) {
  const itemId = normalizeEntityId(item);
  return itemId === "choicescarf" ? 1.5 : itemId === "ironball" ? 0.5 : 1;
}

export function speedItemIdForSet(item) {
  const itemId = normalizeEntityId(item);
  return SPEED_ITEM_IDS.includes(itemId) ? itemId : "";
}

function abilitySpeedMods(mods = {}) {
  const abilityId = normalizeEntityId(mods.ability);
  const abilityActive = Boolean(mods.abilityActive) && SUPPORTED_SPEED_ABILITIES.has(abilityId);
  return {
    choiceScarf: Boolean(mods.choiceScarf) && !(abilityActive && abilityId === "unburden"),
    abilityActive,
  };
}

function entity(value) {
  if (!value) return null;
  const id = normalizeEntityId(value);
  return { id, name: value?.name ?? value };
}

function normalizeEntityId(value) {
  return normalizeId(typeof value === "object" ? value?.id ?? value?.name : value);
}

function entityName(value) {
  return value?.name ?? value?.id ?? "";
}

function deduplicateOpponentSpeeds(entries) {
  const bySpeed = new Map();
  for (const entry of entries) {
    const current = bySpeed.get(entry.speed);
    if (!current || compareEntryPriority(entry, current) > 0) bySpeed.set(entry.speed, entry);
  }
  return [...bySpeed.values()];
}

function compareEntryPriority(a, b) {
  const sourcePriority = (entry) => entry.source === "NCP" ? 2 : entry.source === "Limitless" ? 1 : 0;
  return sourcePriority(a) - sourcePriority(b) ||
    Number(Boolean(a.likely)) - Number(Boolean(b.likely)) ||
    Number(a.usageCount ?? 0) - Number(b.usageCount ?? 0);
}

function groupedRows(entries, userSpeed, trickRoom, context) {
  const bySpeed = new Map();
  for (const entry of entries) {
    const group = bySpeed.get(entry.speed) ?? [];
    group.push(entry);
    bySpeed.set(entry.speed, group);
  }

  const rows = [...bySpeed]
    .sort(([a], [b]) => b - a)
    .map(([speed, groupedEntries]) => {
      const stages = new Set(groupedEntries.map(({ stage }) => stage));
      const sortedEntries = [...groupedEntries]
        .sort((a, b) => Number(b.isUser) - Number(a.isUser) ||
          a.name.localeCompare(b.name) || a.presetLabel.localeCompare(b.presetLabel))
        .map(({ stage: _stage, speed: _speed, order: _order, ...entry }) => entry);
      const actsBefore = speed === userSpeed ? null : trickRoom ? speed < userSpeed : speed > userSpeed;
      return {
        speed,
        entries: sortedEntries,
        stage: stages.size === 1 ? [...stages][0] : null,
        actsBefore,
      };
    });

  Object.defineProperty(rows, "context", { value: context, enumerable: false });
  return rows;
}

function normalizedMods(mods = {}) {
  return {
    tailwind: Boolean(mods.tailwind),
    paralysis: Boolean(mods.paralysis),
    choiceScarf: Boolean(mods.choiceScarf),
    stage: clampInteger(mods.stage, -6, 6),
    ability: mods.ability ?? null,
    item: mods.item ?? null,
    abilityActive: Boolean(mods.abilityActive),
    speedItem: speedItemIdForSet(mods.speedItem),
    itemSpeedMultiplier: mods.itemSpeedMultiplier === undefined
      ? speedItemMultiplier(mods.speedItem)
      : Number.isFinite(Number(mods.itemSpeedMultiplier)) ? Number(mods.itemSpeedMultiplier) : 1,
  };
}

function presetKey(label) {
  const normalized = String(label ?? "").toLowerCase();
  return PRESETS.find(({ key, label: display, sourceLabel }) =>
    normalized === key || normalized === display.toLowerCase() || normalized === sourceLabel)?.key ?? "";
}

function baseSpeed(pokemon) {
  return pokemon?.baseStats?.spe ?? pokemon?.baseSpeed ?? 0;
}

function clampInteger(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

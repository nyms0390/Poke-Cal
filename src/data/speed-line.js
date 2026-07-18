import { NATURES } from "../engine/natures.js";
import { calculateSpeed } from "../engine/speed.js";
import { megaFamily, pokemonSpriteId } from "./pokemon.js";

const PRESETS = [
  { key: "max", label: "Max", sourceLabel: "max (+spe 32)", nature: "Timid", sp: 32 },
  { key: "fast", label: "Fast", sourceLabel: "max (neutral 32)", nature: "Hardy", sp: 32 },
  { key: "neutral", label: "Neutral", sourceLabel: "uninvested", nature: "Hardy", sp: 0 },
  { key: "slow", label: "Slow", sourceLabel: "min (-spe 0)", nature: "Brave", sp: 0 },
];

export function popularOpponentPool(
  popularOpponents = [],
  manualOpponents = [],
  count = 10,
  pokemonCatalog = [],
) {
  const limit = [10, 20, 30, 40, 50].includes(Number(count)) ? Number(count) : 10;
  const popular = popularOpponents.slice(0, limit).flatMap((opponent) =>
    (pokemonCatalog.length > 0 ? megaFamily(pokemonCatalog, opponent.pokemon) : [opponent.pokemon])
      .map((pokemon) => ({ ...opponent, pokemon })));
  const popularIds = new Set(popular.map(({ pokemon }) => pokemon.id));
  return [...popular, ...manualOpponents.filter(({ pokemon }) => !popularIds.has(pokemon.id))];
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
      speedEntry(user.pokemon, "", true, false, 0, baseSpeed(user.pokemon)),
      ...opponents.map(({ pokemon }) => speedEntry(pokemon, "", false, false, 0, baseSpeed(pokemon))),
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
    mods: userMods,
    trickRoom,
  });
  const entries = [speedEntry(
    user.pokemon,
    "Your spread",
    true,
    false,
    userMods.stage,
    userResult.modifiedSpeed,
    userResult.effectiveOrder,
  )];

  for (const opponent of opponents) {
    const likelyKey = presetKey(opponent.likelyPresetLabel);
    for (const preset of PRESETS) {
      if (!presetFilter.has(preset.key)) continue;
      const result = calculatedSpeed(opponent.pokemon, {
        sp: preset.sp,
        nature: preset.nature,
        mods: opponentMods,
        trickRoom,
      });
      entries.push(speedEntry(
        opponent.pokemon,
        preset.label,
        false,
        preset.key === likelyKey,
        opponentMods.stage,
        result.modifiedSpeed,
        result.effectiveOrder,
      ));
    }
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
  return calculateSpeed({
    baseSpeed: baseSpeed(pokemon),
    sp: clampInteger(sp, 0, 32),
    nature: nature in NATURES ? nature : "Hardy",
    stage: mods.stage,
    tailwind: mods.tailwind,
    status: mods.paralysis ? "paralysis" : "",
    speedMultiplier: mods.choiceScarf ? 1.5 : 1,
    trickRoom,
  });
}

function speedEntry(pokemon, presetLabel, isUser, likely, stage, speed, order = speed) {
  return {
    id: pokemon.id,
    name: pokemon.name,
    spriteId: pokemonSpriteId(pokemon),
    presetLabel,
    likely,
    isUser,
    stage,
    speed,
    order,
  };
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

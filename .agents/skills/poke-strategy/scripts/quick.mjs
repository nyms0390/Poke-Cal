import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildAbilityLookup,
  buildItemLookup,
  buildMoveLookup,
} from "../../../../src/data/catalog.js";
import {
  championsDefaultsForPokemon,
  parseUsageSpread,
} from "../../../../src/data/usage-defaults.js";
import { calculateDamage } from "../../../../src/engine/damage.js";
import { createField } from "../../../../src/engine/field.js";
import { finalSpeed } from "../../../../src/engine/speed.js";
import { normalizeId } from "../../../../src/identifiers.js";

const DATA_URL = new URL("../../../../public/", import.meta.url);
const NEUTRAL_STAGES = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export async function loadQuickContext(dataUrl = DATA_URL) {
  const [pokemon, abilities, moves, items] = await Promise.all(
    ["pokemon", "abilities", "moves", "items"].map(async (name) =>
      JSON.parse(await readFile(new URL(`${name}.json`, dataUrl), "utf8"))),
  );
  const pokemonLookup = new Map();
  for (const entry of pokemon) {
    pokemonLookup.set(normalizeId(entry.id), entry);
    pokemonLookup.set(normalizeId(entry.name), entry);
  }

  return {
    pokemon,
    abilities,
    moves,
    items,
    pokemonLookup,
    abilityLookup: buildAbilityLookup(abilities),
    itemLookup: buildItemLookup(items),
    moveLookup: buildMoveLookup(moves),
  };
}

export function compareSpeed(context, options) {
  const left = sideState(context, options.left, {
    spread: options.leftSpread,
    ability: options.leftAbility,
    item: options.leftItem,
    status: options.leftStatus,
    tailwind: options.leftTailwind,
    stages: { spe: options.leftSpeedStage },
  });
  const right = sideState(context, options.right, {
    spread: options.rightSpread,
    ability: options.rightAbility,
    item: options.rightItem,
    status: options.rightStatus,
    tailwind: options.rightTailwind,
    stages: { spe: options.rightSpeedStage },
  });
  const field = createField({
    weather: options.weather ?? "",
    terrain: options.terrain ?? "",
    trickRoom: Boolean(options.trickRoom),
  });
  const leftSpeed = finalSpeed(left, field);
  const rightSpeed = finalSpeed(right, field);

  if (leftSpeed === rightSpeed) {
    return {
      verdict: "TIE",
      left: speedResult(left, leftSpeed),
      right: speedResult(right, rightSpeed),
      summary: `Speed tie — ${leftSpeed} each.`,
    };
  }

  const faster = leftSpeed > rightSpeed ? left : right;
  const first = options.trickRoom
    ? leftSpeed < rightSpeed ? left : right
    : faster;
  const verdict = first === left ? "LEFT" : "RIGHT";
  const summary = options.trickRoom
    ? `${first.pokemon.name} moves first in Trick Room — ${leftSpeed} vs ${rightSpeed}.`
    : `${faster.pokemon.name} is faster — ${Math.max(leftSpeed, rightSpeed)} vs ${Math.min(leftSpeed, rightSpeed)}.`;

  return {
    verdict,
    left: speedResult(left, leftSpeed),
    right: speedResult(right, rightSpeed),
    summary,
  };
}

export function checkSurvival(context, options) {
  const attackerState = sideState(context, options.attacker, {
    spread: options.attackerSpread,
    ability: options.attackerAbility,
    item: options.attackerItem,
    teraType: options.attackerTeraType,
    stages: {
      atk: options.attackerAtkStage,
      spa: options.attackerSpaStage,
    },
  });
  const defenderState = sideState(context, options.defender, {
    spread: options.defenderSpread,
    ability: options.defenderAbility,
    item: options.defenderItem,
    teraType: options.defenderTeraType,
    currentHpFraction: options.defenderHpFraction,
    status: options.defenderStatus,
    stages: {
      def: options.defenderDefStage,
      spd: options.defenderSpdStage,
    },
  });
  const move = resolveEntry(context.moveLookup, options.move, "move");
  const defender = options.targetType
    ? { ...defenderState.pokemon, types: [options.targetType] }
    : defenderState.pokemon;
  const field = createField({
    format: options.format ?? "doubles",
    weather: options.weather ?? "",
    terrain: options.terrain ?? "",
    gravity: Boolean(options.gravity),
    attackerSide: {
      helpingHand: Boolean(options.helpingHand),
    },
    defenderSide: {
      reflect: Boolean(options.reflect),
      lightScreen: Boolean(options.lightScreen),
      auroraVeil: Boolean(options.auroraVeil),
      friendGuard: Boolean(options.friendGuard),
    },
  });
  const result = calculateDamage({
    attacker: attackerState.pokemon,
    defender,
    move,
    attackerState,
    defenderState,
    field,
    critical: Boolean(options.critical),
  });
  if (!result.supported) throw new Error(result.reason ?? "Damage calculation is unsupported.");

  const fullHp = defenderState.currentHpFraction === 1;
  const focusSash = fullHp && normalizeId(defenderState.item?.id ?? defenderState.item?.name) === "focussash";
  const sturdy = fullHp && result.ko?.text?.includes("Sturdy");
  const immune = result.maxDamage === 0;
  const guaranteed = focusSash || sturdy || immune || result.maxDamage < result.defenderCurrentHp;
  const possible = guaranteed || result.minDamage < result.defenderCurrentHp;
  const survivalChance = guaranteed
    ? 1
    : result.rolls.filter((damage) => damage < result.defenderCurrentHp).length / result.rolls.length;
  const verdict = guaranteed ? "YES" : possible ? "ROLL" : "NO";
  const reason = focusSash ? "Focus Sash" : sturdy ? "Sturdy" : immune ? "Immune" : "";
  const name = defenderState.pokemon.name;
  const range = `${result.minPercent}–${result.maxPercent}%`;
  let summary;
  if (focusSash || sturdy) {
    summary = `YES — ${name} survives with ${reason} (${range}).`;
  } else if (immune) {
    summary = `YES — ${name} is immune.`;
  } else if (guaranteed) {
    const hp = fullHp ? "full HP" : `${formatPercent(defenderState.currentHpFraction * 100)}% HP`;
    summary = `YES — ${name} survives ${result.minDamage}–${result.maxDamage} damage (${range}) at ${hp}.`;
  } else if (possible) {
    summary = `ROLL — ${name} has a ${formatPercent(survivalChance * 100)}% survival chance (${range}).`;
  } else {
    summary = `NO — ${name} is always KO'd (${range}).`;
  }

  return {
    verdict,
    reason,
    survivalChance,
    minDamage: result.minDamage,
    maxDamage: result.maxDamage,
    minPercent: result.minPercent,
    maxPercent: result.maxPercent,
    koText: result.ko?.text ?? "",
    summary,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const [command, ...rawOptions] = argv;
  const options = parseOptions(rawOptions);
  const context = await loadQuickContext();
  let result;
  if (command === "speed") {
    result = compareSpeed(context, options);
  } else if (command === "survive") {
    result = checkSurvival(context, options);
  } else {
    throw new Error("Usage: quick.mjs speed|survive [--option value]");
  }

  process.stdout.write(options.json ? `${JSON.stringify(result)}\n` : `${result.summary}\n`);
  return result;
}

function sideState(context, pokemonName, overrides = {}) {
  const pokemon = resolveEntry(context.pokemonLookup, pokemonName, "Pokémon");
  const defaults = championsDefaultsForPokemon(pokemon, {
    abilityLookup: context.abilityLookup,
    items: context.items,
    moveLookup: context.moveLookup,
  });
  const spread = overrides.spread ? parseUsageSpread(overrides.spread) : null;
  if (overrides.spread && !spread) throw new Error(`Invalid spread: ${overrides.spread}`);
  const ability = overrides.ability
    ? resolveEntry(context.abilityLookup, overrides.ability, "ability")
    : defaults.ability ?? resolveFirstAbility(context, pokemon);
  const item = overrides.item
    ? normalizeId(overrides.item) === "none"
      ? null
      : resolveEntry(context.itemLookup, overrides.item, "item")
    : defaults.item;

  return {
    pokemon,
    nature: spread?.nature ?? defaults.nature,
    sp: { ...(spread?.sp ?? defaults.sp) },
    stages: normalizedStages(overrides.stages),
    ability,
    item,
    status: overrides.status ?? "",
    currentHpFraction: clampFraction(overrides.currentHpFraction),
    teraType: overrides.teraType ?? "",
    tailwind: Boolean(overrides.tailwind),
    speedMultiplier: 1,
  };
}

function resolveFirstAbility(context, pokemon) {
  const name = pokemon.abilities?.[0];
  if (!name) return null;
  return context.abilityLookup.get(normalizeId(name)) ?? { id: normalizeId(name), name };
}

function resolveEntry(lookup, value, label) {
  const entry = lookup.get(normalizeId(value));
  if (!entry) throw new Error(`Unknown ${label}: ${value}`);
  return entry;
}

function speedResult(state, speed) {
  return { id: state.pokemon.id, name: state.pokemon.name, speed };
}

function clampFraction(value) {
  if (value === undefined) return 1;
  const fraction = Number(value);
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new RangeError("HP fraction must be greater than 0 and at most 1.");
  }
  return fraction;
}

function normalizedStages(stages = {}) {
  const normalized = { ...NEUTRAL_STAGES };
  for (const [stat, value] of Object.entries(stages)) {
    if (value === undefined) continue;
    const stage = Number(value);
    if (!Number.isInteger(stage) || stage < -6 || stage > 6) {
      throw new RangeError(`${stat} stage must be an integer from -6 to 6.`);
    }
    normalized[stat] = stage;
  }
  return normalized;
}

function formatPercent(value) {
  return Number(value.toFixed(1));
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const key = argument
      .slice(2)
      .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = true;
    } else {
      options[key] = next;
      index += 1;
    }
  }
  return options;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

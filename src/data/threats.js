import { normalizeId } from "./catalog.js";
import { megaFamily } from "./pokemon.js";
import { championsDefaultsForPokemon, topUsageEntry } from "./usage-defaults.js";
import { NATURES } from "../engine/natures.js";
import { calculateStat } from "../engine/stats.js";

/*
 * Limitless publishes observed natures, but not Champions SP spreads. Threat sets therefore
 * assume 32 SP in both offensive stats, no defensive SP, and one of four explicit Speed
 * presets. These are comparison presets, not claims about the submitted teams' exact spreads.
 */

export function threatList(
  pokemonCatalog,
  { count = 20, abilityLookup, moveLookup, includeMegas = false } = {},
) {
  const popularThreats = pokemonCatalog
    .filter(({ champions }) => Number.isFinite(champions?.usagePercent))
    .sort(
      (a, b) =>
        b.champions.usagePercent - a.champions.usagePercent || a.name.localeCompare(b.name),
    )
    .slice(0, count)
    .map((pokemon) => threatFromPokemon(pokemon, moveLookup));

  if (!includeMegas) return popularThreats;
  return popularThreats.flatMap((threat) =>
    megaFamily(pokemonCatalog, threat.pokemon).map((pokemon) => ({
      ...threat,
      pokemon,
      ability: pokemon.id === threat.pokemon.id
        ? threat.ability
        : formAbility(pokemon, abilityLookup) ?? threat.ability,
    })));
}

function formAbility(pokemon, abilityLookup) {
  const name = pokemon.abilities?.[0];
  if (!name) return null;
  return abilityLookup?.get(normalizeId(name)) ?? { id: normalizeId(name), name };
}

export function speedPresets({ baseSpe, nature = "Hardy" }) {
  const likelyLabel = likelySpeedLabel(nature);
  return [
    speedPreset("max (+spe 32)", { baseSpe, sp: 32, nature: "Timid" }, likelyLabel),
    speedPreset("max (neutral 32)", { baseSpe, sp: 32, nature: "Hardy" }, likelyLabel),
    speedPreset("uninvested", { baseSpe, sp: 0, nature: "Hardy" }, likelyLabel),
    speedPreset("min (-spe 0)", { baseSpe, sp: 0, nature: "Brave" }, likelyLabel),
  ];
}

export function speedTierSummary(pokemon, threats) {
  if (!pokemon || threats.length === 0) return [];
  const comparedThreats = [...threats]
    .sort(
      (a, b) =>
        b.usagePercent - a.usagePercent || a.pokemon.name.localeCompare(b.pokemon.name),
    )
    .slice(0, 10)
    .flatMap((threat) => {
      const likely = threat.spPresets.speed.find((preset) => preset.likely);
      return likely ? [{ name: threat.pokemon.name, speed: likely.value }] : [];
    });
  if (comparedThreats.length === 0) return [];

  const baseSpe = pokemon.baseStats?.spe ?? pokemon.baseSpeed;
  const presets = [
    { label: "Max (+Spe, 32 SP)", sp: 32, nature: "Timid" },
    { label: "Fast (neutral, 32 SP)", sp: 32, nature: "Hardy" },
    { label: "Uninvested (neutral, 0 SP)", sp: 0, nature: "Hardy" },
    { label: "Min (−Spe, 0 SP)", sp: 0, nature: "Brave" },
  ];

  return presets.map(({ label, sp, nature }) => {
    const value = calculateStat({ base: baseSpe, stat: "spe", sp, nature });
    const outspeedNames = comparedThreats
      .filter(({ speed }) => value > speed)
      .map(({ name }) => name);
    return {
      label,
      value,
      outspeedCount: outspeedNames.length,
      threatCount: comparedThreats.length,
      outspeedNames,
    };
  });
}

function threatFromPokemon(pokemon, moveLookup) {
  const usage = pokemon.champions.usage;
  const natureEntry = topUsageEntry(usage?.natures);
  const defaults = championsDefaultsForPokemon(pokemon, { moveLookup });
  const nature = natureEntry?.name ?? defaults.nature;

  return {
    pokemon,
    usagePercent: pokemon.champions.usagePercent,
    nature,
    natureShare: natureEntry?.usagePercent ?? 0,
    item: defaults.item,
    ability: defaults.ability,
    teraType: "",
    moves: threatMoves(usage?.moves, moveLookup),
    spPresets: {
      offense: { atk: 32, spa: 32 },
      bulk: { hp: 0, def: 0, spd: 0 },
      speed: speedPresets({
        baseSpe: pokemon.baseStats?.spe ?? pokemon.baseSpeed,
        nature,
      }),
    },
  };
}

function threatMoves(usageMoves = [], moveLookup) {
  return usageMoves
    .map((usage) => {
      const resolved =
        moveLookup?.get(normalizeId(usage.id)) ?? moveLookup?.get(normalizeId(usage.name));
      return {
        ...(resolved ?? usage),
        usageCount: usage.usageCount,
        usagePercent: usage.usagePercent,
      };
    })
    .filter(({ category }) => category !== "Status")
    .slice(0, 4);
}

function speedPreset(label, { baseSpe, sp, nature }, likelyLabel) {
  return {
    label,
    value: calculateStat({ base: baseSpe, stat: "spe", sp, nature }),
    likely: label === likelyLabel,
  };
}

function likelySpeedLabel(nature) {
  if (NATURES[nature]?.up === "spe") return "max (+spe 32)";
  if (NATURES[nature]?.down === "spe") return "min (-spe 0)";
  return "max (neutral 32)";
}

import { normalizeId } from "../identifiers.js";

// Canonical weather/terrain values are the Showdown names the engine compares against
// (via normalizeId): "SunnyDay" | "RainDance" | "Sandstorm" | "Snowscape" and
// "Electric Terrain" | "Grassy Terrain" | "Misty Terrain" | "Psychic Terrain".
// Short aliases are accepted case-insensitively (spaces, hyphens and underscores ignored);
// other values (e.g. "DesolateLand", "PrimordialSea") pass through unchanged.
const WEATHER_ALIASES = {
  SunnyDay: ["sun", "sunny", "sunnyday", "harshsunlight"],
  RainDance: ["rain", "raindance"],
  Sandstorm: ["sand", "sandstorm"],
  Snowscape: ["snow", "snowscape", "hail"],
};
const TERRAIN_ALIASES = {
  "Electric Terrain": ["electric", "electricterrain"],
  "Grassy Terrain": ["grassy", "grass", "grassyterrain"],
  "Misty Terrain": ["misty", "mistyterrain"],
  "Psychic Terrain": ["psychic", "psychicterrain"],
};
const aliasLookup = (aliases) => new Map(Object.entries(aliases)
  .flatMap(([canonical, ids]) => ids.map((id) => [id, canonical])));
const WEATHER_BY_ALIAS = aliasLookup(WEATHER_ALIASES);
const TERRAIN_BY_ALIAS = aliasLookup(TERRAIN_ALIASES);

export function normalizeWeather(weather) {
  if (!weather) return "";
  return WEATHER_BY_ALIAS.get(normalizeId(weather)) ?? weather;
}

export function normalizeTerrain(terrain) {
  if (!terrain) return "";
  return TERRAIN_BY_ALIAS.get(normalizeId(terrain)) ?? terrain;
}

/** Copy of `field` with weather/terrain aliases resolved to their canonical values. */
export function normalizeField(field) {
  const source = field ?? {};
  return { ...source, weather: normalizeWeather(source.weather), terrain: normalizeTerrain(source.terrain) };
}

export function createField(overrides = {}) {
  return normalizeField({
    format: "doubles", // "singles" | "doubles"
    weather: "", // "" | "SunnyDay" | "RainDance" | "Sandstorm" | "Snowscape" (or "sun"/"rain"/"sand"/"snow")
    terrain: "", // "" | "Electric Terrain" | "Grassy Terrain" | "Misty Terrain" | "Psychic Terrain" (or "electric"/...)
    gravity: false,
    trickRoom: false,
    attackerSide: {
      helpingHand: false,
      powerSpot: false,
      battery: false,
      steelySpirit: false,
      flowerGift: false,
      tailwind: false,
    },
    defenderSide: {
      reflect: false,
      lightScreen: false,
      auroraVeil: false,
      friendGuard: false,
      flowerGift: false,
      tailwind: false,
    },
    ...(overrides ?? {}),
  });
}

export function isGrounded(pokemon, state = {}, field = {}) {
  if (field.gravity) return true;
  if (typeof state.grounded === "boolean") return state.grounded;

  const abilityId = normalizeId(state.ability?.id ?? state.ability?.name);
  const itemId = normalizeId(state.item?.id ?? state.item?.name);
  if (abilityId === "levitate" || itemId === "airballoon") return false;

  const types = state.teraType ? [state.teraType] : pokemon?.types ?? [];
  return !types.includes("Flying");
}

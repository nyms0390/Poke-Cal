const AMBIENT_FIELD_KEYS = new Set(["format", "weather", "terrain", "gravity"]);

export function createAmbientFieldState(overrides = {}) {
  return {
    format: overrides.format ?? "doubles",
    weather: overrides.weather ?? "",
    terrain: overrides.terrain ?? "",
    gravity: Boolean(overrides.gravity),
  };
}

export function applyAmbientFieldControl(state, { key, value } = {}) {
  if (!AMBIENT_FIELD_KEYS.has(key)) return state;
  return {
    ...state,
    [key]: key === "gravity" ? Boolean(value) : value,
  };
}

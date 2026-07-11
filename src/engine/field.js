export function createField(overrides = {}) {
  return {
    format: "doubles", // "singles" | "doubles"
    weather: "", // "" | "sun" | "rain" | "sand" | "snow"
    terrain: "", // "" | "electric" | "grassy" | "misty" | "psychic"
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
    ...overrides,
  };
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

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

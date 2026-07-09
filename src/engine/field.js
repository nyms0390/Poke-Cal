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
      tailwind: false,
    },
    ...overrides,
  };
}

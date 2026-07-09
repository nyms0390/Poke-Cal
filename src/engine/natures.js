export const NATURES = {
  Hardy: {},
  Lonely: { up: "atk", down: "def" },
  Brave: { up: "atk", down: "spe" },
  Adamant: { up: "atk", down: "spa" },
  Naughty: { up: "atk", down: "spd" },
  Bold: { up: "def", down: "atk" },
  Docile: {},
  Relaxed: { up: "def", down: "spe" },
  Impish: { up: "def", down: "spa" },
  Lax: { up: "def", down: "spd" },
  Timid: { up: "spe", down: "atk" },
  Hasty: { up: "spe", down: "def" },
  Serious: {},
  Jolly: { up: "spe", down: "spa" },
  Naive: { up: "spe", down: "spd" },
  Modest: { up: "spa", down: "atk" },
  Mild: { up: "spa", down: "def" },
  Quiet: { up: "spa", down: "spe" },
  Bashful: {},
  Rash: { up: "spa", down: "spd" },
  Calm: { up: "spd", down: "atk" },
  Gentle: { up: "spd", down: "def" },
  Sassy: { up: "spd", down: "spe" },
  Careful: { up: "spd", down: "spa" },
  Quirky: {},
};

const NATURE_STAT_LABELS = {
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

export function natureMultiplier(natureName, stat) {
  const nature = NATURES[natureName] ?? NATURES.Hardy;
  if (nature.up === stat) return 1.1;
  if (nature.down === stat) return 0.9;
  return 1;
}

export function natureOptionLabel(natureName) {
  const nature = NATURES[natureName] ?? NATURES.Hardy;
  if (!nature.up || !nature.down) return natureName;
  return `${natureName} +${NATURE_STAT_LABELS[nature.up]} -${NATURE_STAT_LABELS[nature.down]}`;
}

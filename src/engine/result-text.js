const STAT_LABELS = {
  hp: "HP",
  atk: "Atk",
  def: "Def",
  spa: "SpA",
  spd: "SpD",
  spe: "Spe",
};

const WEATHER_LABELS = {
  sunnyday: "Sun",
  raindance: "Rain",
  sandstorm: "Sand",
  snowscape: "Snow",
};

const SCREEN_LABELS = {
  reflect: "Reflect",
  lightScreen: "Light Screen",
  auroraVeil: "Aurora Veil",
};

export function resultDescription({ attackerState, defenderState, move, field = {}, result }) {
  if (!result?.supported) return result?.reason ?? "No direct damage";

  const attackStat = result.attackStat ?? defaultAttackStat(move);
  const defenseStat = result.defenseStat ?? defaultDefenseStat(move);
  const clauses = fieldClauses({ attackerState, defenderState, field, result });

  return [
    [
      statPrefix(attackerState, attackStat),
      relevantAttackerItem(attackerState, result),
      attackerState.pokemon?.name ?? "Attacker",
      move.name,
      "vs.",
      defenderSpread(defenderState, defenseStat),
      defenderState.pokemon?.name ?? "Defender",
      ...clauses,
    ].filter(Boolean).join(" "),
    `${result.minDamage}-${result.maxDamage} (${result.minPercent} - ${result.maxPercent}%) -- ${result.ko.text}`,
  ].join(": ");
}

function defaultAttackStat(move) {
  if (move?.overrideOffensiveStat) return move.overrideOffensiveStat;
  return move?.category === "Special" ? "spa" : "atk";
}

function defaultDefenseStat(move) {
  if (move?.overrideDefensiveStat) return move.overrideDefensiveStat;
  return move?.category === "Special" ? "spd" : "def";
}

function statPrefix(state, stat) {
  return [stagePrefix(state.stages?.[stat] ?? 0), state.sp?.[stat] ?? 0, STAT_LABELS[stat] ?? stat]
    .filter((part) => part !== "")
    .join(" ");
}

function defenderSpread(state, defenseStat) {
  return [
    stagePrefix(state.stages?.[defenseStat] ?? 0),
    `${state.sp?.hp ?? 0} HP / ${state.sp?.[defenseStat] ?? 0} ${STAT_LABELS[defenseStat] ?? defenseStat}`,
  ].filter(Boolean).join(" ");
}

function stagePrefix(stage) {
  if (stage > 0) return `+${stage}`;
  if (stage < 0) return String(stage);
  return "";
}

function relevantAttackerItem(state, result) {
  const itemName = state.item?.name;
  if (!itemName) return "";
  return result.notes?.includes(itemName) ? itemName : "";
}

function fieldClauses({ attackerState, defenderState, field, result }) {
  const clauses = [];
  if (result.critical) clauses.push("on a critical hit");
  if (field.terrain) clauses.push(`in ${field.terrain}`);

  const weather = WEATHER_LABELS[normalizeId(field.weather)];
  if (weather) clauses.push(`in ${weather}`);

  for (const [key, label] of Object.entries(SCREEN_LABELS)) {
    if (field.defenderSide?.[key] && result.notes?.includes(label)) clauses.push(`through ${label}`);
  }

  if (attackerState.teraType) clauses.push(`Tera ${attackerState.teraType}`);
  if (defenderState.teraType) clauses.push(`Tera ${defenderState.teraType}`);
  return clauses;
}

function normalizeId(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

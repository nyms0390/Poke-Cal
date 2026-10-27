import { calculateStat } from "../engine/stats.js";
import { normalizeId } from "../identifiers.js";

// HP number rules: HP values that take less fixed-fraction chip or get more fixed-fraction
// healing. Showdown floors every such amount (min 1), so a 1/k chip costs the smallest share of
// HP at kn − 1 and a 1/k heal restores the largest share at kn. In Champions each HP SP adds
// exactly 1 HP, so any target is reachable within the 33-value HP range. Research and the
// Champions availability check are summarized in docs/DECISIONS.md "HP number rules".

// Opponent and field effects the user opts into; the set's own item, ability and moves are
// read automatically.
export const HP_EFFECTS = ["sand", "burn", "grassy", "contact"];

const SAND_IMMUNE_TYPES = ["Rock", "Ground", "Steel"];
const SAND_IMMUNE_ABILITIES = ["overcoat", "sandveil", "sandrush", "sandforce", "magicguard"];

// Effects that can hit this set, in HP_EFFECTS order.
export function availableHpEffects(user, moves = []) {
  if (!user?.pokemon) return [];
  const types = user.pokemon.types ?? [];
  const ability = entryId(user.ability);
  return HP_EFFECTS.filter((effect) => {
    if (effect === "grassy") return isGrounded(user);
    // Magic Guard takes no indirect damage at all.
    if (ability === "magicguard") return false;
    if (effect === "sand") {
      return !types.some((type) => SAND_IMMUNE_TYPES.includes(type)) &&
        !SAND_IMMUNE_ABILITIES.includes(ability);
    }
    if (effect === "burn") return !(types.includes("Fire") && types.some((type) => ["Poison", "Steel"].includes(type)));
    if (effect === "contact") return ability !== "longreach" && moves.some((move) => move?.flags?.contact);
    return false;
  });
}

// The rules that apply to a set, highest priority first: Sitrus Berry combos, then the item,
// the ability, Substitute, and the opted-in effects. Chip and heal rules with the same target
// share one entry; `sources` names what triggers each rule as { kind, id } catalog references.
export function hpNumberRules(user, { moves = [], effects = [] } = {}) {
  if (!user?.pokemon) return [];
  const item = entryId(user.item);
  const ability = entryId(user.ability);
  const moveIds = moves.map((move) => entryId(move));
  const types = user.pokemon.types ?? [];
  const magicGuard = ability === "magicguard";
  const rules = [];
  const add = (goal, modulus, remainder, source) => {
    const existing = goal === "chip" || goal === "heal"
      ? rules.find((rule) => rule.goal === goal && rule.modulus === modulus && rule.remainder === remainder)
      : null;
    if (existing) existing.sources.push(source);
    else rules.push({ goal, modulus, remainder, sources: [source] });
  };

  const sitrus = item === "sitrusberry";
  const bellyDrum = moveIds.includes("bellydrum")
    ? "bellydrum"
    : moveIds.includes("curse") && types.includes("Ghost") ? "curse" : "";
  if (sitrus && bellyDrum) add("halfCost", 2, 0, { kind: "move", id: bellyDrum });
  if (sitrus && moveIds.includes("substitute")) add("substituteSitrus", 4, 0, { kind: "move", id: "substitute" });

  if (item === "leftovers") add("heal", 16, 0, { kind: "item", id: item });
  if (item === "lifeorb" && !magicGuard) add("chip", 10, 9, { kind: "item", id: item });
  if (sitrus && !moveIds.includes("substitute")) add("heal", 4, 0, { kind: "item", id: item });

  if (ability === "regenerator") add("heal", 3, 0, { kind: "ability", id: ability });
  if (ability === "raindish" || ability === "icebody") add("heal", 16, 0, { kind: "ability", id: ability });
  if (ability === "solarpower") add("chip", 8, 7, { kind: "ability", id: ability });

  if (!sitrus && moveIds.includes("substitute")) add("substitute", 4, 1, { kind: "move", id: "substitute" });

  const available = availableHpEffects(user, moves);
  for (const effect of HP_EFFECTS.filter((id) => effects.includes(id) && available.includes(id))) {
    if (effect === "sand") add("chip", 16, 15, { kind: "move", id: "sandstorm" });
    if (effect === "burn") add("chip", 16, 15, { kind: "status", id: "burn" });
    if (effect === "grassy") add("heal", 16, 0, { kind: "move", id: "grassyterrain" });
    if (effect === "contact") {
      add("chip", 8, 7, { kind: "ability", id: "roughskin" });
      add("chip", 6, 5, { kind: "item", id: "rockyhelmet" });
    }
  }
  return rules;
}

export function hpRuleMatches(rule, hp) {
  return ((hp % rule.modulus) + rule.modulus) % rule.modulus === rule.remainder;
}

// Keeps every rule, in priority order, that can share one HP value with the rules kept before
// it inside this Pokémon's HP range, and lists the rest as dropped. `matches(hp)` checks the
// kept rules. `below` is the closest fitting HP at or under the current HP (it frees SP);
// `above` is the closest fitting HP over it, with `affordable` when the unassigned SP cover it.
export function hpNumberPlan(user, { moves = [], effects = [], unassignedSp = 0 } = {}) {
  if (!user?.pokemon) return null;
  const base = user.pokemon.baseStats.hp;
  const hpAt = (sp) => calculateStat({ base, stat: "hp", sp });
  const values = Array.from({ length: 33 }, (_, sp) => ({ sp, hp: hpAt(sp) }));
  const currentSp = clampSp(user.sp?.hp);
  const current = values[currentSp];
  const rules = [];
  const dropped = [];
  for (const rule of hpNumberRules(user, { moves, effects })) {
    const together = [...rules, rule];
    if (values.some(({ hp }) => together.every((kept) => hpRuleMatches(kept, hp)))) rules.push(rule);
    else dropped.push(rule);
  }
  const matches = (hp) => rules.every((rule) => hpRuleMatches(rule, hp));
  const below = rules.length
    ? values.slice(0, currentSp + 1).reverse().find(({ hp }) => matches(hp)) ?? null
    : null;
  const aboveValue = rules.length
    ? values.slice(currentSp + 1).find(({ hp }) => matches(hp)) ?? null
    : null;
  return {
    hp: current.hp,
    sp: currentSp,
    rules,
    dropped,
    fits: rules.length > 0 && matches(current.hp),
    matches: rules.length ? matches : null,
    below,
    above: aboveValue && {
      ...aboveValue,
      affordable: aboveValue.sp - currentSp <= Math.max(0, Math.trunc(Number(unassignedSp) || 0)),
    },
  };
}

// HP gained each time a chip or heal rule's effect applies when HP moves from `fromHp` to
// `toHp`: less chip taken or more healed (the modulus is the effect's 1/k). Negative when the
// move makes it worse; null for the Sitrus Berry and Substitute combos, which are not per tick.
export function hpRuleGain(rule, fromHp, toHp) {
  if (rule.goal === "chip") return Math.floor(fromHp / rule.modulus) - Math.floor(toHp / rule.modulus);
  if (rule.goal === "heal") return Math.floor(toHp / rule.modulus) - Math.floor(fromHp / rule.modulus);
  return null;
}

// The trade-off of moving from the most-bulk spread's HP to a fitting one: the first chip or heal
// rule's gain per tick and how many ticks repay `bulkCostHp`. `turns` is null without such a rule
// or when the gain is not positive.
export function hpTradeoff(rules, { fromHp, toHp, bulkCostHp }) {
  const rule = rules.find(({ goal }) => goal === "chip" || goal === "heal") ?? null;
  const gain = rule ? hpRuleGain(rule, fromHp, toHp) : null;
  return {
    rule,
    gain,
    bulkCostHp,
    // Counted from the cost as shown (0.1 HP), so "about 1.0 HP" never reads as 2 ticks.
    turns: gain > 0 ? Math.max(1, Math.ceil(Math.round(bulkCostHp * 10) / 10 / gain)) : null,
  };
}

// "16n − 1", "4n + 1", "3n": the target written the way players write it.
export function hpRuleTarget({ modulus, remainder }) {
  if (remainder === 0) return `${modulus}n`;
  if (remainder === modulus - 1) return `${modulus}n − 1`;
  return `${modulus}n + ${remainder}`;
}

function isGrounded(user) {
  return !(user.pokemon.types ?? []).includes("Flying") && entryId(user.ability) !== "levitate";
}

function entryId(entry) {
  if (!entry) return "";
  if (typeof entry === "string") return normalizeId(entry);
  return normalizeId(entry.id ?? entry.name);
}

function clampSp(value) {
  const sp = Number(value);
  if (!Number.isFinite(sp)) return 0;
  return Math.max(0, Math.min(32, Math.trunc(sp)));
}

// Critical-hit stage, following Showdown's getDamage: a move starts at its critRatio
// (default 1), ModifyCritRatio handlers add to it, and from Gen 7 on a ratio of 4 or more
// always critical-hits (critMult = [0, 24, 8, 2, 1]). Status-dependent volatiles such as
// Focus Energy are not tracked by the calculator, so they are not counted here.

import { normalizeId } from "../identifiers.js";
import { moveEffect } from "./move-effects.js";

export const GUARANTEED_CRIT_RATIO = 4;

const CRIT_ITEMS = {
  scopelens: { stages: 1 },
  razorclaw: { stages: 1 },
  // Showdown checks the holder's base species, so Farfetch'd-Galar counts too.
  leek: { stages: 2, species: ["farfetchd", "sirfetchd"] },
  luckypunch: { stages: 2, species: ["chansey"] },
};

/**
 * Showdown's crit ratio for `move` used by `attacker` (before clamping to 0–4).
 * Returns 0 for status moves. Merciless needs the target's state.
 */
export function critRatio({ move, attacker, attackerState = {}, defenderState = {}, suppressAttackerAbility = false } = {}) {
  if (!move || move.category === "Status") return 0;
  let ratio = Number(move.critRatio) || 1;
  const item = CRIT_ITEMS[normalizeId(attackerState?.item?.id ?? attackerState?.item?.name)];
  if (item && (!item.species || item.species.includes(baseSpeciesId(attacker)))) ratio += item.stages;
  const ability = suppressAttackerAbility ? "" : normalizeId(attackerState?.ability?.id ?? attackerState?.ability?.name);
  if (ability === "superluck") ratio += 1;
  if (ability === "merciless" && ["poison", "toxic"].includes(defenderState?.status)) ratio = 5;
  return ratio;
}

/** True when the move always critical-hits: willCrit moves, or a crit ratio of 4 or more. */
export function isGuaranteedCritical(input = {}) {
  const move = input.move;
  if (!move || move.category === "Status") return false;
  if (move.willCrit === true || moveEffect(normalizeId(move.id ?? move.name)).alwaysCrit === true) return true;
  return critRatio(input) >= GUARANTEED_CRIT_RATIO;
}

function baseSpeciesId(pokemon) {
  return normalizeId(pokemon?.baseSpecies ?? pokemon?.name ?? pokemon?.id);
}

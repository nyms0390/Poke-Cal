import { normalizeId } from "../identifiers.js";

// Abilities that make a Pokémon immune to a whole attacking type, for Lookup's defensive
// matchup note. The damage engine applies these in abilityImmunityResult (src/engine/damage.js);
// test/ability-immunities.test.js checks the two agree.
export const ABILITY_TYPE_IMMUNITIES = Object.freeze({
  levitate: "Ground",
  eartheater: "Ground",
  eelevate: "Ground",
  flashfire: "Fire",
  wellbakedbody: "Fire",
  voltabsorb: "Electric",
  motordrive: "Electric",
  lightningrod: "Electric",
  waterabsorb: "Water",
  stormdrain: "Water",
  dryskin: "Water",
  sapsipper: "Grass",
});

// The attacking type `ability` blocks, or "" when it blocks none.
export function abilityTypeImmunity(ability) {
  const id = normalizeId(typeof ability === "string" ? ability : ability?.id ?? ability?.name);
  return ABILITY_TYPE_IMMUNITIES[id] ?? "";
}

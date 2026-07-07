# P2-06 — Type-changing and offensive abilities

Status: TODO
Depends on: P1-03
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Normal-type move conversion with power boost" (Pixilate, Aerilate, Galvanize, Refrigerate,
Normalize, Dragonize) · "Sound move type conversion" (Liquid Voice) · "Low-HP type attack
boost" (Blaze, Torrent, Overgrow, Swarm) · "Move-flag power boost" remaining (Sheer Force,
Punk Rock) · "Sun-dependent SpA boost" (Solar Power) · "Ally-paired SpA multiplier"
(Plus, Minus) · "Attack multipliers with drawback" (Hustle, Gorilla Tactics) ·
"Status-conditioned attack boost" (Flare Boost, Toxic Boost) · "Last-to-move" (Analytic) ·
"Gender-based" (Rivalry) · "Switched-in target" (Stakeout) · "Fainted-ally boost"
(Supreme Overlord) · "Sandstorm type boost" (Sand Force) · "Specific type power boost"
remaining (Fire Mane, Steely Spirit self) · "Aura field type power boost" (Fairy Aura,
Dark Aura) · "Water damage boost / Fire reduction" (Water Bubble — offense half; defense half
in P2-07) · "Offensive type-chart immunity bypass" (Scrappy, Mind's Eye)

## Files to change
- `src/engine/modifiers.js`, `src/engine/move-effects.js` (type conversion hook),
  `src/engine/damage.js` (type-immunity bypass), `src/ui/battle-page.js` (small toggles),
  `MECHANICS_CHECKLIST.md`

## Steps
1. -ate abilities: Normal-type moves become the ability's type AND get power ×1.2. Implement
   as an ability hook consulted in the same place as `moveEffect().moveType`
   (ability conversion applies first, then ×1.2 as a "power" modifier with the ability label).
   Normalize: all moves → Normal, ×1.2. Liquid Voice: sound-flag moves → Water (no boost).
   Requires move flags — confirm `public/moves.json` includes `flags` (sound/punch/bite…);
   if missing, extend `scripts/sync-pokemon-data.mjs` and regenerate (flags are already
   needed by Iron Fist etc., so likely present).
2. Simple modifiers (one registry entry each; multipliers per Bulbapedia — verify each):
   Blaze/Torrent/Overgrow/Swarm ×1.5 attack-type-matching at ≤1/3 HP (uses
   `currentHpFraction`); Solar Power SpA ×1.5 in sun; Plus/Minus SpA ×1.5 — gate behind a UI
   checkbox "ally has Plus/Minus"; Hustle Atk ×1.5 (note "accuracy ×0.8"); Gorilla Tactics
   Atk ×1.5 (note "locked into one move"); Flare Boost SpA ×1.5 when burned; Toxic Boost
   Atk ×1.5 when poisoned; Analytic power ×1.3 when moving last (use `compareMoveOrder`
   result like P2-03); Rivalry — UI select Off/Same/Opposite → ×1.25/×0.75; Stakeout ×2 —
   UI checkbox "target switched in"; Supreme Overlord — UI count 0–5 fainted allies, power
   ×(1 + 0.1×n); Sand Force ×1.3 Rock/Ground/Steel in sand; Fire Mane (Champions ability —
   check `public/abilities.json` for its exact effect text; implement per that text);
   Fairy Aura / Dark Aura ×1.33 matching type for BOTH sides' moves (field-wide — read from
   either combatant's ability).
3. Sheer Force: ×1.3 power for moves with a secondary effect (`move.secondaries` in Showdown
   data — confirm sync captures `secondary`; extend sync if not) + note "Life Orb recoil
   ignored" interaction NOT modeled (Life Orb still shown separately).
4. Punk Rock: ×1.3 sound moves (offense); ×0.5 incoming sound (defense — implement both here).
5. Scrappy / Mind's Eye: Normal/Fighting moves hit Ghost neutrally — hook into
   `typeEffectiveness` via a bypass parameter.
6. Tick each checklist line as implemented; UI toggles grouped in a collapsible
   "assumptions" row per side.

## Acceptance criteria
- Golden vs NCP: Pixilate Hyper Voice (type+boost+spread), Blaze at 30% HP, Supreme Overlord
  n=2, Scrappy Fake Out vs Ghost.
- Every multiplier verified against Bulbapedia (cite in test comments).

## Tests
```sh
npm run test:damage && npm test
```

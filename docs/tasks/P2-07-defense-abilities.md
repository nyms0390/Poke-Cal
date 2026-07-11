# P2-07 — Defensive abilities and ability suppression

Status: Done
Depends on: P1-04, P1-05
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Full-HP damage reduction" (Multiscale, Shadow Shield) · "Type-specific incoming stat halving"
(Thick Fat, Heatproof, Purifying Salt) · "Defensive stat multipliers" (Fur Coat, Marvel Scale)
· "Terrain-dependent Defense" (Grass Pelt) · "Ignore stat stages" (Unaware) ·
"Super-effective-only filter" (Wonder Guard) · "Full-HP type-effectiveness reduction"
(Tera Shell) · "Type immunity with boost/heal" (Volt/Water Absorb, Motor Drive, Sap Sipper,
Well-Baked Body) · "Redirected attack immunity" (Lightning Rod, Storm Drain) ·
"Full-HP survival" (Sturdy) · "Snow-restored hit negation" (Ice Face) · "Ability ignore or
suppression" (Mold Breaker, Teravolt, Turboblaze, Neutralizing Gas) · "Weight modification"
(Heavy Metal) · "Powder immunity" (Overcoat — note-only) · "Move redirection bypass"
(Stalwart, Propeller Tail — note-only) · "Status move reflection" (Magic Bounce — note-only) ·
"Switch trapping" (Magnet Pull — note-only)

## Files to change
- `src/engine/modifiers.js`, `src/engine/damage.js`, `src/engine/type-chart.js` (immunity
  hooks), `MECHANICS_CHECKLIST.md`

## Steps
1. Final-damage modifiers (pipeline step 12): Multiscale/Shadow Shield ×0.5 at full HP
   (`currentHpFraction === 1`); Tera Shell — at full HP all effectiveness > 1 becomes 0.5
   (note label).
2. Stat halving/boosting on defense: Thick Fat (incoming Fire/Ice: attacker's offensive stat
   ×0.5); Heatproof (Fire ×0.5 damage); Purifying Salt (Ghost ×0.5 offensive stat);
   Fur Coat Def ×2; Marvel Scale Def ×1.5 when statused; Grass Pelt Def ×1.5 in Grassy
   Terrain; Water Bubble defense half (incoming Fire ×0.5) if not done in P2-06.
3. Unaware: attacker's Unaware ignores defender's Def/SpD stages; defender's Unaware ignores
   attacker's Atk/SpA stages. Reuse the `ignoreDefenderStages` machinery; add the offensive
   direction.
4. Immunities: Volt Absorb/Motor Drive/Lightning Rod (Electric → 0×), Water Absorb/Storm
   Drain (Water → 0×), Sap Sipper (Grass → 0×), Well-Baked Body (Fire → 0×), Wonder Guard
   (all effectiveness ≤ 1 → 0×). Show "Immune (ability)" in the damage card.
5. Sturdy: damage uncapped, but KO text becomes "survives with Sturdy at full HP" when
   min damage ≥ max HP and `currentHpFraction === 1` (adjust ko-chance input: cap first-hit
   damage at HP−1). Ice Face: first physical hit → 0 damage note + checkbox "Ice Face intact".
6. Suppression: Mold Breaker/Teravolt/Turboblaze on the attacker, or Neutralizing Gas on
   either side, disables the defender's damage-relevant abilities (reuse
   `ignoreDefenderAbility` machinery from Moongeist Beam; Neutralizing Gas disables BOTH
   sides' abilities — including the attacker's own modifiers).
7. Heavy Metal: defender weight ×2 (feeds Grass Knot/Low Kick/Heavy Slam ctx).
8. Note-only entries (Overcoat, Stalwart, Propeller Tail, Magic Bounce, Magnet Pull): they
   never change displayed damage ranges → annotate their checklist lines
   "no damage-range effect — excluded by design" and tick.

## Acceptance criteria
- Golden vs NCP: Multiscale Dragonite at full vs chipped HP; Thick Fat vs Fire; Mold Breaker
  Earthquake vs Levitate; Wonder Guard; Lightning Rod immunity display.
- Suppression tested in both directions (Neutralizing Gas kills Huge Power too).

## Tests
```sh
npm run test:damage && npm test
```

## Completion notes

- Added suppression-aware defensive ability handling for Multiscale, Shadow Shield, Tera Shell,
  Thick Fat, Heatproof, Purifying Salt, Fur Coat, Marvel Scale, Grass Pelt, Water Bubble,
  Unaware, Wonder Guard, Volt/Water Absorb-style immunities, Lightning Rod, Storm Drain,
  Levitate, Sturdy, Ice Face, Heavy Metal, Mold Breaker, Teravolt, Turboblaze, and Neutralizing Gas.
- Marked note-only abilities (Overcoat, Stalwart, Propeller Tail, Magic Bounce, Magnet Pull) as
  excluded by design because they do not change the displayed damage range.
- Verified with `npm run test:damage`.

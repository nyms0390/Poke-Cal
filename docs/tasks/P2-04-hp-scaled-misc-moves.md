# P2-04 — HP-scaled and remaining miscellaneous moves

Status: TODO
Depends on: P1-04, P1-05
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Target HP-scaled base power" (Hard Press, Crush Grip, Wring Out) · "Target HP threshold"
(Brine) · "Low-user-HP-scaled" (Flail, Reversal) · "Target HP equalization" (Endeavor) ·
"No held item doubling" (Acrobatics) · "Held-item thrown" (Fling) · "Stat-boost-count scaling"
(Stored Power, Power Trip, Punishment) · "Grounding override" (Smack Down) · "IV-derived type"
(Hidden Power) · "Residual trapping damage" (Salt Cure — as a note only) ·
"Calculator-assumed" leftovers: friendship (Return/Frustration/Pika Papow/Veevee Volley),
Spit Up, Trump Card, Pursuit, Fickle Beam, Magnitude, Present, Psywave ·
"Counter last received damage" (Counter/Mirror Coat/Metal Burst/Comeuppance — explicit
unsupported) · Future Sight, Bide

## Files to change
- `src/engine/move-effects.js`, `src/engine/damage.js` (only if a new handler key is needed),
  `MECHANICS_CHECKLIST.md`

## Steps (formulas — implement in registry)
1. Hard Press `floor(100 × currentHP/maxHP)+? (min 1, ×100/100 → use Bulbapedia: 1–100 scaled)`;
   Crush Grip / Wring Out `floor(120 × currentHP/maxHP)` (min 1); Brine ×2 when defender ≤50%.
2. Flail/Reversal thresholds on user HP fraction: >68.75% → 20, >35.4% → 40, >20.8% → 80,
   >10.4% → 100, >4.2% → 150, else 200.
3. Endeavor: `fixedDamage = max(0, defenderCurrentHp − attackerCurrentHp)`.
4. Acrobatics: ×2 when `attackerState.item` is empty.
5. Fling: power from item's `fling.basePower` in `public/items.json` — check the sync captures
   it; if not, extend `scripts/sync-pokemon-data.mjs` to include Showdown's `fling` data and
   regenerate.
6. Stored Power / Power Trip: `20 + 20 × (sum of positive stages)` (all 5 boostable stats +
   acc/eva not in our model — use the 5); Punishment: `60 + 20 × positive stages`, cap 200.
7. Smack Down / Thousand Arrows grounding: hit airborne (Flying/Levitate) targets neutrally —
   Thousand Arrows is done; mirror for Smack Down.
8. Hidden Power: fixed 60 BP, type from a per-move UI select (no IVs in SP model); default Dark.
9. Salt Cure: normal damage + note "1/8 (1/4 Water/Steel) residual per turn".
10. Friendship moves: assume maximum power for all → 102 BP (Return/Pika Papow/Veevee Volley
    at max friendship; Frustration at zero friendship). Append the assumption as a note.
11. Spit Up: assume 3 stockpiles (300) + note; Trump Card: assume 5+ PP → 40 + note;
    Pursuit: 40, note "×2 on switch not modeled"; Fickle Beam: 80 + note "30% chance 140";
    Magnitude: default Magnitude 7 (70) + note; Present: 80 + note; Psywave: fixed 50
    (level-50 average) + note.
12. Counter / Mirror Coat / Metal Burst / Comeuppance / Future Sight / Bide: keep in
    `UNSUPPORTED_MOVE_IDS` with clear reasons ("depends on damage taken"). Tick their
    checklist entries as resolved-by-design and annotate the checklist line.

## Acceptance criteria
- Every listed move either computes (with test) or reports a precise unsupported reason.
- Golden vs NCP: Hard Press at 100%/50%/1%, Acrobatics itemless, Stored Power +2/+2.

## Tests
```sh
npm run test:damage && npm test
```

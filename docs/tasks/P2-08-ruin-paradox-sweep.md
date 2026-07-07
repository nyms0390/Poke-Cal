# P2-08 — Ruin abilities, paradox boosts, Intimidate, Parental Bond, final sweep

Status: TODO
Depends on: P2-05, P2-06, P2-07
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Global ruin stat modifiers" (Beads/Sword/Tablets/Vessel of Ruin) · "Sun or Booster Energy
highest-stat boost" (Protosynthesis) · "Electric Terrain or Booster Energy" (Quark Drive) ·
"Switch-in stat-stage changes" (Intimidate, Intrepid Sword) · "Second hit with reduced damage"
(Parental Bond) · "Berry effect doubling" (Ripen) · "Post-KO boost" (Beast Boost) ·
"Commander" · "HP-threshold penalty" (Defeatist) · "Turn-count penalty" (Slow Start) ·
"Weather-dependent form typing" (Forecast) · "Sun-dependent Atk/SpD" (Flower Gift) ·
"Weather and terrain removal" (Teraform Zero) · "Critical-hit damage amplification" — done ·
plus anything still unticked after P2-01…07: Hex-family leftovers, Skill Link edge cases, etc.

## Files to change
- `src/engine/modifiers.js`, `src/engine/damage.js`, `src/ui/battle-page.js`,
  `MECHANICS_CHECKLIST.md`

## Steps
1. Ruin abilities (×0.75, field-wide, like NCP's field checkboxes):
   Tablets of Ruin → all OTHER Pokémon Atk ×0.75; Vessel → SpA; Sword → Def; Beads → SpD.
   Read from both combatants' abilities; a Pokémon is unaffected by its own Ruin, and two
   identical Ruins don't stack. Add field-panel indicators (auto-derived, not manual toggles).
2. Protosynthesis / Quark Drive: boosts the holder's highest stat ×1.3 (×1.5 if Speed) when
   sun / Electric Terrain active — or when a "Booster Energy" checkbox is on. Compute highest
   stat from final stats (after SP/nature, before stages).
3. Intimidate / Intrepid Sword: convenience defaults — when the OPPOSING Pokémon has
   Intimidate, default the side's Atk stage to −1 (once, user-overridable, same pattern as
   P2-05 `impliedField`); Intrepid Sword defaults own Atk stage +1.
4. Parental Bond: total = first hit + second hit at ×0.25 power; implement as `hits` +
   per-hit power scaling in the pipeline (needs a small extension: per-hit power multiplier
   array like Triple Kick already uses).
5. Ripen: resist-berry ×0.25 instead of ×0.5 (interacts with `RESIST_BERRIES` producer).
6. Beast Boost / Commander / Defeatist / Slow Start / Forecast / Flower Gift / Teraform Zero:
   - Defeatist: ≤50% HP → Atk/SpA ×0.5 (implement — it reads currentHpFraction).
   - Flower Gift: sun → ally+self Atk & SpD ×1.5 (implement; ally exposure via
     `field.attackerSide.flowerGift` checkbox already in the field shape).
   - Beast Boost/Commander/Slow Start: stage-based or turn-based — cover via default stage
     suggestions + notes (document per entry in the checklist line).
   - Forecast: typing follows weather for Castform (moveType/defender-typing hook).
   - Teraform Zero: note-only ("clears weather/terrain — set field manually"), tick with
     annotation.
7. **Final sweep**: run through MECHANICS_CHECKLIST.md top to bottom. Every line must now be
   either ticked (with a test) or annotated with an explicit by-design reason. Update the
   checklist header text to reflect completion status.

## Acceptance criteria
- Golden vs NCP: Miraidon (Hadron+Electric Terrain) Electro Drift vs Vessel of Ruin target;
  Protosynthesis Flutter Mane in sun; Parental Bond Kangaskhan? — Champions catalog check:
  use whatever Parental Bond user exists in `public/pokemon.json`.
- `grep -c "\- \[ \]" MECHANICS_CHECKLIST.md` returns 0 (all lines ticked or converted to
  annotated `[x]`).

## Tests
```sh
npm run test:damage && npm test
```

# P1-02 — Side conditions: screens, Helping Hand, Friend Guard, Power Spot, Battery, Steely Spirit

Status: TODO
Depends on: P1-01
Phase: 1 (calculator foundations)

## Files to read
- `src/engine/field.js` (attackerSide/defenderSide shape), `src/engine/damage.js` (pipeline
  fold), `ROADMAP.md` pipeline steps 1 and 12
- `src/ui/battle-page.js` field card from P1-01

## Files to change
- `src/engine/damage.js`, `src/engine/modifiers.js`, `battle.html`,
  `src/ui/battle-page.js`, `src/ui/battle-state.js`

## Goal
None of these exist anywhere yet (engine or UI). They are the most common VGC damage modifiers
after items, so they come before the Phase 2 burn-down.

## Steps — engine
1. Pipeline step 1 (power modifiers), reading `field.attackerSide`:
   - Helping Hand ×1.5; Battery ×1.3 (special moves only); Power Spot ×1.3;
     Steely Spirit ×1.5 (Steel moves only).
2. Pipeline step 12 (final modifiers), reading `field.defenderSide`:
   - Reflect ×0.5 vs physical, Light Screen ×0.5 vs special, Aurora Veil ×0.5 vs either —
     all skipped on crit, never stacking with each other (Aurora Veil implies the other two
     are redundant; apply at most one screen multiplier);
     in doubles the screen multiplier is ×(2/3) — use format from `field`.
   - Friend Guard ×0.75.
3. Each applied condition appends a `notes` label (e.g. `"Reflect"`).

## Steps — UI
4. Add per-side checkbox rows to the field card (two columns, one per side, like NCP):
   Helping Hand / Power Spot / Battery / Steely Spirit on the attacking side of each panel;
   Reflect / Light Screen / Aurora Veil / Friend Guard on the defending side.
   Wire into `field.attackerSide`/`defenderSide`. Remember: for the left Pokémon attacking,
   the left column is attackerSide and the right column is defenderSide — and the reverse for
   the right Pokémon. Build the field object per-direction in `buildCalcInput`.

## Acceptance criteria
- Golden tests vs NCP: physical move through Reflect in doubles (×2/3); special through
  Light Screen; crit ignores screens; Helping Hand stacks with Life Orb correctly
  (order: power vs final damage).
- Direction handling proven by a test: side A's Helping Hand must not boost side B's move.

## Tests
```sh
npm run test:damage
npm test
```

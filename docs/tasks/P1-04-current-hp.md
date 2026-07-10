# P1-04 — Current HP input

Status: Done
Depends on: P0-07
Phase: 1 (calculator foundations)

## Files to read
- `src/engine/damage.js` — where `state.currentHp` is read (Eruption/Water Spout/Dragon Energy
  group already implemented but unreachable: no UI populates it)
- `src/ui/battle-state.js`, `src/ui/battle-page.js`

## Files to change
- `src/engine/damage.js`, `src/ui/battle-state.js`, `src/ui/battle-page.js`, `battle.html`

## Goal
Add a per-side "Current HP" input (absolute value + % display, like NCP) so HP-scaled
mechanics work: already-implemented Eruption group, plus P2-04 (Hard Press/Brine/Flail) and
defender-side percent output (damage % should be % of max HP, KO math needs current HP).

## Steps
1. Side state already has `currentHpFraction: 1` (from P0-07). Add UI: numeric input showing
   `currentHp / maxHp` next to each side's HP; editing either number or the percent updates
   `currentHpFraction`. Recompute max HP when SP/nature changes and clamp current HP.
2. Engine: standardize on `attackerState.currentHpFraction` / `defenderState.currentHpFraction`
   (convert to absolute HP internally where formulas need it). Remove the never-populated
   `state.currentHp` convention.
3. Damage output: percentages remain relative to **max** HP (NCP convention), but the KO label
   (and later ko-chance in P1-06) must compare damage against **current** HP.
4. Tests: Eruption at full/half HP; KO label flips when current HP is lowered.

## Acceptance criteria
- Setting defender to 50% makes a move that deals 60% of max HP read as a guaranteed KO.
- Eruption at 50% HP power = 75 (golden-check vs NCP).

## Tests
```sh
npm run test:damage
npm test
```

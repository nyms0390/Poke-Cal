# P2-03 — Speed-scaled and turn-order-conditional moves

Status: Done
Depends on: P1-06
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"User-versus-target speed-scaled base power" (Gyro Ball, Electro Ball) ·
"Acting before the target base-power doubling" (Bolt Beak, Fishious Rend) ·
"Acting after the target base-power doubling" (Payback) ·
"Calculator-assumed base power for unavailable damage-before-moving state"
(Avalanche, Assurance, Revenge)

## Files to read
- `src/engine/speed.js` (`finalSpeed`), `src/engine/battle-order.js`
- `src/engine/move-effects.js`

## Files to change
- `src/engine/move-effects.js`, `src/ui/battle-page.js` (assumption toggles),
  `MECHANICS_CHECKLIST.md`

## Steps
1. Speed-scaled — compute both sides' effective speed inside `basePower(ctx)` via
   `finalSpeed` (import from engine, pass states through ctx; extend ctx with both side
   states if not already available):
   - Gyro Ball: `min(150, floor(25 × targetSpeed / userSpeed) + 1)`
   - Electro Ball: thresholds on `userSpeed / targetSpeed`: ≥4 → 150, ≥3 → 120, ≥2 → 80,
     ≥1 → 60, else 40.
2. Order-conditional — the calculator KNOWS move order (battle-order.js). Default behavior:
   use `compareMoveOrder` outcome to decide the doubling for Bolt Beak / Fishious Rend
   (attacker moves first → ×2) and Payback (attacker moves second → ×2); append a note
   stating the assumption. Add a per-move override checkbox ("target already moved"-style,
   NCP has similar toggles).
3. History-assumed — Avalanche / Assurance / Revenge cannot know "was hit this turn".
   Default: unboosted power + note; add the same override checkbox to double.
4. Tests for each formula branch; golden vs NCP for Gyro Ball (slow vs fast) and Bolt Beak
   both orders.

## Acceptance criteria
- All nine moves ticked with tests; assumption notes visible in the damage card.

## Tests
```sh
npm run test:battle && npm test
```

# P2-02 — Status-conditional power moves

Status: TODO
Depends on: P1-03
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Target status base-power doubling" (Hex, Venoshock, Barb Barrage, Infernal Parade,
Smelling Salts, Wake-Up Slap) · "User status base-power doubling" (Facade)

## Files to read
- `src/engine/move-effects.js`, P1-03 status model (`state.status` values)
- Bulbapedia exact rules (fetch if unsure):
  Hex/Infernal Parade double vs ANY status; Venoshock/Barb Barrage vs poison/toxic only;
  Smelling Salts vs paralysis; Wake-Up Slap vs sleep; Facade doubles with user
  burn/poison/toxic/paralysis AND ignores the burn ×0.5 physical drop.

## Files to change
- `src/engine/move-effects.js`, `src/engine/damage.js` (Facade burn exception, next to the
  existing Guts exception), `MECHANICS_CHECKLIST.md`

## Steps
1. One `basePower(ctx)` registry entry per move using `ctx.defenderState.status` /
   `ctx.attackerState.status`.
2. Facade: `basePower` doubling + include in the burn-skip condition in pipeline step 11.
3. Remove these moves from `UNSUPPORTED_MOVE_IDS` if listed.
4. Tests: each move at both statuses (doubled / not); Facade burned attacker deals full
   doubled damage (golden vs NCP).

## Acceptance criteria
- All six + Facade ticked in MECHANICS_CHECKLIST.md with tests.
- Venoshock does NOT double vs burn (rule precision check).

## Tests
```sh
npm run test:damage && npm test
```

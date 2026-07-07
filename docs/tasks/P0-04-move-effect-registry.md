# P0-04 — Replace move string-ladders with a move-effect registry

Status: TODO
Depends on: P0-03
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` — "Effect registries" section (ctx contract)
- `src/damage.js` — `effectiveMoveType` (~523–550), `effectiveMovePower` (~552–607),
  `fixedDamageKind` (~470–477), `hitCountRange` (~491–505), `successiveHitBasePowers`
  (~507–511), the move-id `Set`s near the top, and the Photon Geyser special case inlined in
  `calculateDamage` (~325–335)
- `test/damage.test.js` — tests for Weather Ball, Grass Knot, Eruption, multi-hit moves, etc.

## Files to create
- `src/engine/move-effects.js`

## Files to change
- `src/damage.js`

## Goal
Move-specific behavior is scattered across long `if (moveId === "…")` ladders in several
functions. Convert it to one registry `MOVE_EFFECTS = { [moveId]: handlers }` so that Phase 2
can add ~60 mechanics as one-line entries. **No mechanic is added or changed in this task** —
only re-encoded.

## Handler contract (implement exactly)
```js
// every handler is optional; ctx = {move, attacker, defender, attackerState, defenderState, field}
{
  basePower(ctx) -> number,        // replaces effectiveMovePower branch
  moveType(ctx) -> string,         // replaces effectiveMoveType branch
  hits(ctx) -> [min, max] | n,     // replaces hitCountRange / fixed multi-hit sets
  hitPowers(ctx) -> number[],      // replaces successiveHitBasePowers (Triple Axel/Kick)
  fixedDamage(ctx) -> number|null, // replaces fixedDamageKind (Seismic Toss, Super Fang…)
  offensiveStat(ctx) -> "atk"|"spa"|"def",  // Body Press, Foul Play, Photon Geyser
  defensiveStat(ctx) -> "def"|"spd",        // Psyshock group
  ignoreDefenderStages: true,      // Sacred Sword group
  ignoreDefenderAbility: true,     // Moongeist Beam group
  spread: true|false,              // override target-based spread detection (rare)
}
```

## Steps
1. Create `src/engine/move-effects.js` exporting `MOVE_EFFECTS` and
   `moveEffect(moveId)` (returns `{}` when unknown).
2. Migrate every existing special case from the functions listed above into registry entries.
   Work function by function; keep each formula identical.
3. Rewrite `effectiveMovePower`/`effectiveMoveType`/`fixedDamageKind`/`hitCountRange`/
   `successiveHitBasePowers` in `damage.js` as thin lookups into the registry, or inline the
   lookups at their call sites and delete the functions.
4. Replace the Photon Geyser inline branch and the Body Press / Foul Play / Psyshock stat
   selection with `offensiveStat`/`defensiveStat` handlers.
5. Keep `UNSUPPORTED_MOVE_IDS` and `unsupportedMoveReason` as-is (they shrink during Phase 2).

## Acceptance criteria
- `damage.js` contains **zero** `moveId === "..."` comparisons afterward (verify with
  `grep -n 'moveId ===' src/damage.js`).
- Every migrated move has at least one existing test exercising it; all expected values
  unchanged. If a migrated move has no test, add one (hand-computed, note in comment).

## Tests
```sh
npm run test:damage
npm test
```

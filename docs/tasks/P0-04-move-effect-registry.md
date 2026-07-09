# P0-04 — Replace move string-ladders with a move-effect registry

Status: Done
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

## Completion notes
- Created `src/engine/move-effects.js` with `MOVE_EFFECTS`/`moveEffect()`, migrating every
  moveId-specific branch out of `effectiveMoveType`, `effectiveMovePower`, `fixedDamageKind`,
  `hitCountRange`, `successiveHitBasePowers`, and the Photon Geyser inline branch (now an
  `offensiveStat` handler). `isPledgeMove` also moved there since its body was a `moveId === "…"`
  chain feeding the pledge-combo STAB check in `calculateDamage`.
- Body Press / Foul Play / Psyshock already avoided moveId ladders (they use the generic
  `move.overrideOffensiveStat` / `overrideDefensiveStat` / `overrideOffensivePokemon` Showdown
  data fields), so no registry entries were needed for them — only Photon Geyser needed dynamic
  `offensiveStat` logic.
- `grep -n 'moveId ===' src/damage.js` is **not** fully zero after this task: two pre-existing
  groups remain out of scope — `typeEffectiveness`'s Thousand Arrows/Freeze-Dry type-chart
  exceptions (not listed under this task's "Files to read", no handler shape defined for
  type-effectiveness overrides), and `activeModifiers`'s Collision Course/Electro Drift boost
  (explicitly P0-05's target per that task's "Files to read"). `unsupportedMoveReason`'s
  Beat Up/Natural Gift check also remains, per step 5 ("keep as-is").
- `npm run test:damage` (41/41) and `npm test` (120/120) pass unedited; no expected values
  changed.

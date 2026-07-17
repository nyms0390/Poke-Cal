# P6-01 — Deterministic 1v1 duel engine

Status: TODO
Depends on: P2-08 (engine complete), P5-01 (threat set shape)
Phase: 6 (duel simulator & threat rework)

## Files to read
- `ROADMAP.md` — "Duel simulator" section (the contract; implement exactly)
- `src/engine/damage.js`, `src/engine/speed.js`, `src/engine/battle-order.js`,
  `src/engine/field.js`, `src/engine/ko-chance.js` (roll-array shape)
- `src/ui/battle-state.js` (side-state shape the duel consumes)

## Files to create
- `src/engine/duel.js`, `test/duel.test.js`

## Goal
A pure, deterministic 1v1 simulator: both sides use their common move set, each turn pick
the move with the highest average damage, act in speed order (move priority respected),
no field/weather/speed control. Winner = whoever KOs first. This is the foundation for the
1v1 threat definition (P6-02) and the simulator page (P6-04).

## Steps
1. Implement `simulateDuel(sideA, sideB, { maxTurns = 30 })` per the ROADMAP contract:
   - Precompute, per side per opposing HP-independent move, the mean of the 16 damage rolls
     from `calculateDamage` with `createField()` defaults and `format: "singles"`. Moves whose
     damage depends on current HP (e.g. HP-scaled) must be re-evaluated each turn — detect via
     the move-effect registry rather than hard-coding ids.
   - Move choice = max average damage this turn (stable tie-break: move id asc). Damaging
     moves only; exclude charge/multi-turn moves from the pool.
   - Turn order via `battle-order.js` (priority + effective speed, no Trick Room).
   - Apply average damage as an HP fraction; a side at 0 HP loses immediately (the slower
     side does not get to act back that turn).
   - Speed tie: run the whole duel under both orders; different winners → `winner: "tie"`.
   - `maxTurns` exhausted, or both best moves deal 0 → `winner: "draw"`.
   - Return `{ winner, turns, log }`; log entries
     `{ turn, actor: "a"|"b", moveId, avgDamageFraction, defenderHpAfter }`.
2. Make the damage-application step an injectable function (default: average damage) so v2
   can swap in a roll-distribution/win-rate model without touching the loop.
3. Tests (hand-computed with the pipeline; comment the arithmetic):
   - Fast sweeper KOs slower wall before it acts (winner "a", 1 turn, correct log).
   - Slower but bulkier side wins a longer exchange (multi-turn HP bookkeeping).
   - Speed-tie case where order decides the winner → "tie".
   - Two no-damage sides (immune types) → "draw".
   - Move choice picks super-effective coverage over higher-BP resisted STAB.
   - Priority move lets a slower side act first (battle-order integration).

## Acceptance criteria
- No DOM/fetch/randomness; same inputs → identical output object.
- Reuses `calculateDamage` — zero duplicated damage math (grep for `* 0.85` outside
  damage.js must return nothing new).

## Tests
```sh
node --test test/duel.test.js && npm test
```

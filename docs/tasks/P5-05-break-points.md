# P5-05 — Builder: break points (offensive breakpoints)

Status: Done
Depends on: P5-04 (shares patterns and scenario plumbing)
Phase: 5 (builder utility)

## Files to read
- `src/data/bulk-points.js` (mirror its structure), `src/data/threats.js`

## Files to create
- `src/data/break-points.js`, `test/break-points.test.js`

## Goal
The reverse question: for each of YOUR damaging moves vs each top threat, what offensive SP
turns a 3HKO into a 2HKO, or a roll into a guaranteed OHKO?

## Definitions
- **Defense scenario**: threat as DEFENDER at `spPresets.bulk` (2 HP fast-offense bulk —
  documented assumption from P5-01), most-used item/ability, no active Tera; neutral field.
- **Break point**: smallest Atk (or SpA — whichever your move uses) SP at which the KO tier
  improves versus your current SP: tiers ordered
  `no KO ≤5 < 5HKO < … < 2HKO (x%) < 2HKO guaranteed < OHKO (x%) < OHKO guaranteed`.

## Steps
1. `src/data/break-points.js` (pure):
   - `yourDamage(userState, move, scenario)` → `{minPct, maxPct, koText}` (user is ATTACKER).
   - `breakPoints(userState, move, scenario)` → iterate the offensive sp 0…32 (33 calcs),
     record every sp where the tier label changes; return
     `[{sp, achieves, minPct, maxPct}]` (ascending sp). Include the +nature variant when
     32 SP with current nature doesn't reach the next tier but +nature does
     (`requiresPlusNature: true`).
2. UI "Break points" section: matrix — rows = your 4 selected moves, columns = top threats
   (scrollable); each cell shows current KO text colored by tier; clicking a cell opens the
   breakpoint list with "apply" buttons.
3. Reuse the scenario table/expansion components from P5-04 (extract shared pieces into
   `src/ui/components.js` if duplication appears — small refactor allowed here).
4. Tests mirror P5-04: tier ordering function unit-tested; breakpoint minimality; nature
   variant triggering.

## Acceptance criteria
- One hand-verified cell cross-checked against battle.html with identical inputs.
- Tier-ordering comparator is a single exported function used by both bulk- and break-points
  (no duplicated tier logic).

## Tests
```sh
node --test test/break-points.test.js && npm test
```

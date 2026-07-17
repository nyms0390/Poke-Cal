# P5-04 — Builder: bulk points (defensive breakpoints)

Status: Done
Depends on: P5-02
Phase: 5 (builder utility)

## Files to read
- `src/data/threats.js`, `src/engine/damage.js`, `src/engine/ko-chance.js`
- `src/ui/builder-state.js`

## Files to create
- `src/data/bulk-points.js`, `test/bulk-points.test.js`

## Goal
For each top threat's strongest moves against YOUR Pokémon, show current damage and the SP
investments at which survival tiers change — "with 12 HP / 4 SpD you survive Miraidon's
Electro Drift" style answers.

## Definitions (implement exactly)
- **Attack scenario**: one threat + one of its damaging moves (from `threats.js`), threat at
  `spPresets.offense`, its most-used item/ability, no active Tera, neutral field (no weather/terrain/
  screens — field toggles can come later; note the assumption in the UI).
- **Survives**: `maxDamage < your max HP` (guaranteed survival, 16/16 rolls).
- **Bulk point**: a `(hpSp, defSp)` or `(hpSp, spdSp)` allocation where the KO tier improves
  (e.g. from "possible OHKO" to "guaranteed survive one hit", or 2HKO rolls change).

## Steps
1. `src/data/bulk-points.js` (pure):
   - `threatDamage(userState, scenario)` → wraps `calculateDamage` + `koChance`; returns
     `{minPct, maxPct, koText}`. The user is the DEFENDER here.
   - `bulkPoints(userState, scenario, { budget = 64 })` → search allocations: for total
     spent 0…budget, iterate splits between HP and the relevant defense stat
     (HP sp 0…32 × def sp 0…32, skip pairs whose sum exceeds budget; ≤ 33×33 ≈ 1089 calcs
     per scenario — fine). Return the Pareto frontier: allocations where survival tier
     improves over any cheaper allocation, as
     `[{hpSp, defSp, totalSp, achieves: "survives 1 hit (guaranteed)" | "…", maxPct}]`.
2. UI "Bulk points" section: table of scenarios (threat sprite/name, move, current
   min–max % and KO text against your current spread), expandable per scenario to show its
   Pareto list; "apply" button sets your HP/Def(SpD) SP.
3. Sort scenarios by max damage % descending (scariest first). Cap at top 20 threats × top 2
   moves each to keep render fast; compute lazily per expansion if slow.
4. Tests: fixture threat; monotonicity (more SP never increases damage %); frontier
   minimality (each entry's tier unreachable with fewer total SP — brute-check in test);
   defender-side item (Assault Vest analog if in catalog) flows through.

## Acceptance criteria
- One hand-verified scenario cross-checked against battle.html with identical inputs
  (same numbers — same engine).
- No UI jank: initial render < ~1s with 20 threats (measure with `console.time` during dev,
  remove after).

## Tests
```sh
node --test test/bulk-points.test.js && npm test
```

# P4-02 — Snapshot: defensive type-matchup chart

Status: Done
Depends on: P0-07
Phase: 4 (snapshot polish)

## Files to read
- `src/engine/type-chart.js` (`TYPE_EFFECTIVENESS`)
- `src/ui/lookup-page.js`, `src/ui/components.js` (`typeBadge`)

## Files to create
- `test/type-matchup.test.js`

## Files to change
- `src/engine/type-chart.js` (add helper), `src/ui/lookup-page.js`, `src/styles.css`

## Goal
Standard dex feature: what hits this Pokémon for 4×/2×/½×/¼×/0×, accounting for dual types.

## Steps
1. Engine helper in `type-chart.js`:
   `defensiveMatchups(defenderTypes)` → `{ x4: [], x2: [], x1: [], x05: [], x025: [], x0: [] }`
   by multiplying the chart across both types. Pure function, unit-tested (e.g. Abomasnow:
   Fire 4×; Rotom-Wash: Ground 0×… pick 3 known cases).
2. Snapshot card "Defensive matchups": one row per bucket that has entries, rendered with the
   existing `typeBadge` component. Skip empty buckets.
3. Optional ability footnote: if the Pokémon's abilities include an immunity ability
   (Levitate, Volt Absorb, etc. — reuse the immunity table from P2-07 if done, else hard-code
   Levitate only), add a note line "Levitate: immune to Ground". Do not alter the buckets.

## Acceptance criteria
- Three hand-verified Pokémon match Bulbapedia's type-effectiveness.
- Renders cleanly at mobile width (badges wrap).

## Tests
```sh
node --test test/type-matchup.test.js && npm test
```

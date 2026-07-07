# P1-06 — Exact KO-chance engine + golden test harness

Status: TODO
Depends on: P1-04
Phase: 1 (calculator foundations)

## Files to read
- `src/engine/damage.js` — `koSummary` (~435–441; min/max-only label) and the `rolls` array in
  the result object
- `src/ui/battle-page.js` — where `koSummary` output is rendered

## Files to create
- `src/engine/ko-chance.js`
- `test/ko-chance.test.js`
- `test/golden.test.js`

## Files to change
- `src/engine/damage.js` (export shape), `src/ui/battle-page.js`

## Goal
Replace the coarse "Possible 1–2HKO" label with exact probabilities like NCP:
"43.8% chance to 2HKO", "guaranteed OHKO". The 16 damage rolls are already computed but unused.

## Steps
1. `src/engine/ko-chance.js`:
   - `koChance({ rolls, targetHp, maxHits = 5, hitsPerTurn = 1 })` → for n = 1…maxHits compute
     `P(sum of n uniform picks from rolls ≥ targetHp)` by convolution:
     start with distribution `{0: 1}`, fold in one hit at a time
     (`Map<damage, probability>`, each roll weight 1/16), summing the mass ≥ targetHp.
     Return `[{hits: 1, chance}, ...]` stopping at the first `chance === 1`.
   - `koText(result)` → NCP wording: `chance === 1` → `"guaranteed {n}HKO"`;
     `0 < chance < 1` → `"{(chance*100).toFixed(1)}% chance to {n}HKO"`;
     nothing within maxHits → `"not a KO within 5 hits"`.
   - Multi-hit moves: `rolls` for one full move use (all hits summed) is what damage.js
     already returns; document that assumption in a comment.
2. `damage.js`: include `koChance` results in `formatDamageResult` /
   the returned object (`{ ko: { hits, chance, text } }`), using **current** HP (P1-04).
3. UI: damage card shows `"178–211 (82.4–97.6%) — guaranteed 2HKO"`.
4. Create `test/golden.test.js`: a table-driven suite `GOLDEN_CASES = [{name, input, expected:
   {min, max, koText}}]` recorded from the NCP calculator. Seed it with at least 5 cases
   spanning: plain STAB hit, spread move in doubles, weather-boosted, screen-reduced,
   Choice item + tera. Each case comment links the NCP settings used.

## Acceptance criteria
- `koChance` unit tests: single roll ≥ HP → guaranteed OHKO; classic 15/16 case shows 93.8%;
  convolution matches brute-force enumeration (write the brute force in the test for n ≤ 3).
- Golden cases match NCP exactly (min, max, KO text).

## Tests
```sh
node --test test/ko-chance.test.js test/golden.test.js
npm test
```

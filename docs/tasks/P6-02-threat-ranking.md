# P6-02 — Threats redefined: 1v1 winners vs the target

Status: TODO
Depends on: P6-01
Phase: 6 (duel simulator & threat rework)

## Files to read
- `src/data/threats.js` (P5-01 — keep `threatList`/`speedPresets` intact)
- `src/engine/duel.js` (P6-01)
- `src/data/usage-defaults.js` (`championsDefaultsForPokemon`)

## Files to change
- `src/data/threats.js` (extend), `test/threats.test.js` (extend)

## Goal
Replace "threat = most-used Pokémon" with "threat = Pokémon that wins the 1v1 against the
target". Pure module extension; every UI that says "threats" reads this ranking.

## Design (implement exactly)
```js
threatRanking(target, pokemonCatalog, { pool = 40, count = 10, moveLookup } = {})
// candidates = threatList(catalog, { count: pool }) — the usage pool has observed sets
// target side  = target's own common set (championsDefaultsForPokemon) + same SP presets
// each candidate side = its threat set: common moves/item/ability, offense 32 SP,
//   bulk 0 SP, `likely` speed preset nature/SP  → one simulateDuel(candidate, target)
// → up to `count` entries, only candidates with winner "candidate" or "tie", sorted:
//   wins before ties, then fewer turns (faster kill = scarier), then usage desc, then name.
// Each entry: { threat, result: { winner: "win"|"tie", turns }, usagePercent }
```

## Steps
1. Add a `duelSide(threatOrTarget)` helper that assembles the side-state shape from a threat
   set — one place that maps SP presets/nature/item/ability/moves to duel input. Exclude the
   target itself from its own candidate pool (mirror matches are not threats).
2. Implement `threatRanking` as above. Keep it lazy-friendly: ~40 duels per target is cheap,
   but do not simulate at module load — only when called.
3. Document in the module comment block: move sets and SP presets are usage approximations
   (same caveats as P5-01); the duel ignores field/speed control by design.
4. Tests with a fixture catalog: winner filter (losers excluded), sort order
   (win < tie, turns, usage), self-exclusion, determinism, `count`/`pool` limits.

## Acceptance criteria
- `threatList` (usage order) still exists and passes its old tests — the snapshot page
  toggle (P6-03) needs both orderings.
- No DOM/fetch; deterministic.

## Tests
```sh
node --test test/threats.test.js && npm test
```

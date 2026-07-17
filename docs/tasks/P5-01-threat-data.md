# P5-01 — Threat-list module (top-usage sets with SP presets)

Status: Done
Depends on: P1-05 (tera usage), P2-08 (engine complete enough to trust numbers)
Phase: 5 (builder utility)

## Files to read
- `ROADMAP.md` — "Data reality" (Limitless has NO SP spreads; do not invent them)
- `src/data/usage-defaults.js` (`championsDefaultsForPokemon`)
- `public/pokemon.json` champions.usage shape

## Files to create
- `src/data/threats.js`, `test/threats.test.js`

## Goal
One pure module that turns Champions usage into concrete opposing sets ("threats") that the
builder computes against. Every builder feature (P5-03/04/05) reads ONLY from this module, so
assumptions live in one place.

## Design (implement exactly)
```js
threatList(pokemonCatalog, { count = 20 } = {})
// → top `count` by champions.usagePercent, each mapped to:
{
  pokemon,                       // catalog entry
  usagePercent,
  nature,                        // most-used nature
  natureShare,                   // its usagePercent (confidence signal)
  item, ability, teraType,       // most-used each
  moves,                         // top 4 damaging + priority-relevant moves (keep Protect out:
                                 //   filter to move.category !== "Status")
  spPresets: {
    offense: { atk: 32, spa: 32 },          // assume max offensive investment
    bulk:    { hp: 0, def: 0, spd: 0 },     // assume uninvested bulk (worst case for them,
                                            //   conservative for the user) — document!
    speed:   speedPresets(...)              // see below
  },
}

speedPresets({ baseSpe, nature })
// → [{ label: "max (+spe 32)", value }, { label: "max (neutral 32)", value },
//    { label: "uninvested", value }, { label: "min (-spe 0)", value }]
// computed with calculateStat; if the threat's most-used nature is +Spe, flag
// `likely: "max (+spe 32)"`; if -Spe (Brave/Quiet/Relaxed/Sassy), flag `likely: "min"`.
```

## Steps
1. Implement `threatList` + `speedPresets` as above, pure functions over the loaded catalog.
2. Document the SP assumptions in a comment block at the top of the file (they are
   approximations because Limitless doesn't publish spreads).
3. Tests with a fixture catalog (3 fake Pokémon with usage): ordering, nature selection,
   damaging-move filter, speed preset math (hand-computed), likely-flag from nature.

## Acceptance criteria
- No DOM/fetch in the module; works on the already-loaded catalog array.
- `threatList` is deterministic (stable sort: usage desc, then name).

## Tests
```sh
node --test test/threats.test.js && npm test
```

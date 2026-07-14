# P3-03 — Saved sets (localStorage) and usage-default sets

Status: Done
Depends on: P3-02
Phase: 3 (calculator UX parity)

## Files to read
- `src/data/usage-defaults.js` (`championsDefaultsForPokemon` — current default seeding)
- `src/data/set-paste.js` (serialization from P3-02)

## Files to create
- `src/data/saved-sets.js`, `test/saved-sets.test.js`

## Files to change
- `src/ui/battle-page.js`, `battle.html`

## Goal
NCP's "Save Calc Set" / named custom spreads. Users store their own sets per Pokémon and pick
them from the set dropdown next to usage defaults.

## Steps
1. `src/data/saved-sets.js`: `listSets(pokemonId)`, `saveSet(pokemonId, name, sideState)`,
   `deleteSet(pokemonId, name)` over `localStorage` key `pokecal.sets.v1` (one JSON blob).
   Wrap all storage access in try/catch (private browsing) — degrade to in-memory Map.
   Storage format = the paste format from P3-02 (text, human-readable, versioned).
2. UI per side: set dropdown listing `"Champions default"` + saved sets; "Save set…" prompt
   for a name; delete button. Selecting a set applies it via the P3-02 parser.
3. Tests run in Node without localStorage: inject a storage stub (constructor parameter or
   module-level `setStorage()` — keep `src/data/` DOM-free; `localStorage` is passed in from
   the UI layer).

## Acceptance criteria
- Save → reload page → set still listed and applies identically (manual check).
- `src/data/saved-sets.js` has no direct `localStorage` reference
  (`grep -n localStorage src/data/` → empty; only `src/ui/` touches it).

## Tests
```sh
node --test test/saved-sets.test.js && npm test
```

## Completion notes

- Added versioned `pokecal.sets.v1` storage with per-Pokémon named paste text, reload persistence,
  deletion, and an in-memory fallback when storage access fails.
- Added per-side Champions-default/saved-set dropdowns, save-name prompt, and delete controls;
  saved sets apply through the P3-02 paste parser.
- `node --test test/saved-sets.test.js` and `npm test` pass. Desktop browser QA confirmed the
  controls render and default state; the in-app browser does not support native `prompt()`, so
  name-entry/reload was covered by the storage reload test instead.

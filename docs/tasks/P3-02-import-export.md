# P3-02 — Set import/export (paste format)

Status: Done
Depends on: P1-05
Phase: 3 (calculator UX parity)

## Files to read
- `src/data/showdown-data.js` (existing Showdown export parsing — check what it already
  handles; `test/showdown-data.test.js`)
- `src/ui/battle-state.js` (side-state shape)

## Files to create
- `src/data/set-paste.js`, `test/set-paste.test.js`

## Files to change
- `src/ui/battle-page.js`, `battle.html`

## Goal
NCP's "Import to Left/Right Team" textbox. Champions sets circulate in Showdown-paste-like
format with SP lines. Support both directions.

## Format (define as the canonical PokéCal paste)
```
Miraidon @ Choice Specs
Ability: Hadron Engine
Tera Type: Electric
SPs: 4 HP / 32 SpA / 32 Spe
Modest Nature
- Electro Drift
- Draco Meteor
- Volt Switch
- Dazzling Gleam
```
Parser must ALSO accept standard Showdown `EVs:` lines by mapping EV→SP with
`sp = round(ev / 8)` (252→32, 4→1) and a warning note, so real pastes still import.

## Steps
1. `parseSetPaste(text)` → side-state partial (pokemon id via catalog alias lookup, item,
   ability, teraType, nature, sp map, move ids). Unknown names → collect into
   `warnings: []`, never throw.
2. `formatSetPaste(sideState, pokemon)` → the canonical text above.
3. UI: textarea + "Import left" / "Import right" buttons + per-side "Export set" button
   (fills the textarea + copies). Place below the two panels like NCP.
4. Round-trip test: format → parse → identical state. Fuzz with a real Showdown paste
   (EV mapping) and a paste with a TC name alias.

## Acceptance criteria
- Round-trip identity for every field in the side state that the paste covers.
- Malformed input shows warnings and applies what it could; page never crashes.

## Tests
```sh
node --test test/set-paste.test.js && npm test
```

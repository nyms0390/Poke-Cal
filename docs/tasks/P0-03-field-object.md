# P0-03 — Introduce the Field object and thread it through the engine

Status: TODO
Depends on: P0-02
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` — "Field object" section (exact shape to implement)
- `src/damage.js` — `calculateDamage` signature (~line 252) and every use of
  `battleFormat`, `weather`, `terrain`, `gravity`, `pledgeCombo`, `critical`, `burned`
- `src/battle-page.js` — `renderDamageCard` (~lines 488–537) where `calculateDamage` is called
- `src/speed.js`, `src/battle-order.js` — where `trickRoom`/`tailwind` are read
- `test/damage.test.js` — every `calculateDamage(` call site (there are many; use search)

## Files to create
- `src/engine/field.js`

## Files to change
- `src/damage.js`, `src/battle-page.js`, `test/damage.test.js`

## Goal
Replace the ten loose named parameters of `calculateDamage` with one `field` object, so that
Phase 1 can add screens/side conditions without another signature change. Today
`battle-page.js` doesn't even pass `weather`/`terrain`/`gravity` — after this task the wiring
point exists even though the UI toggles arrive in P1-01.

## Steps
1. Create `src/engine/field.js` with `createField(overrides)` exactly as specified in
   ROADMAP.md (format, weather, terrain, gravity, trickRoom, attackerSide, defenderSide).
2. Change `calculateDamage` to
   `calculateDamage({attacker, defender, move, attackerState, defenderState, field, critical})`.
   Inside, read `field.format` where `battleFormat` was read, `field.weather`, `field.terrain`,
   `field.gravity`. Move `pledgeCombo` to `field.pledgeCombo` (boolean, default false).
   Keep `burned` OUT of field — burn belongs to `attackerState` and is reworked in P1-03; for
   now read `attackerState.burned` (battle-page already stores it there).
3. Default: `field = createField()` when omitted, so minimal calls stay short.
4. Update `battle-page.js`: build one `field` per render from the existing DOM reads
   (`battleFormat`, `trickRoom`) via `createField({...})` and pass it to every
   `calculateDamage` call. Pass `field.trickRoom` into `compareMoveOrder` from the same object.
5. Mechanically update every `calculateDamage` call in `test/damage.test.js`:
   `weather: "sun"` → `field: createField({ weather: "sun" })`, etc. Expected values must not
   change.

## Acceptance criteria
- `calculateDamage` has exactly the new signature; no loose field params remain.
- All damage test expected values are byte-identical to before (only call syntax changed).
- `battle-page.js` builds `field` in exactly one place per render.

## Tests
```sh
npm run test:battle
npm test
```

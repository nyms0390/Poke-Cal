# P1-01 — Field UI panel (format, weather, terrain, gravity, Trick Room)

Status: Done
Depends on: P0-07
Phase: 1 (calculator foundations)

## Files to read
- `src/engine/field.js`, `src/ui/battle-page.js`, `src/ui/battle-state.js`, `battle.html`
- NCP reference: field section sits between the two Pokémon panels — Singles/Doubles toggle,
  terrain row (None/Electric/Grassy/Misty/Psychic), weather row (None/Sun/Rain/Sand/Snow),
  Gravity, Trick Room

## Files to change
- `battle.html`, `src/ui/battle-page.js`, `src/ui/battle-state.js`, `src/styles.css`

## Goal
The engine already applies weather/terrain/gravity (Weather Ball, Terrain Pulse, Solar Beam,
Rising Voltage, Grav Apple, Psyblade, Expanding Force, Hydro Steam are implemented) but the UI
never passes them — those params are dead. Add a field panel so every existing field mechanic
becomes reachable.

## Steps
1. Add a centered "Field" card to `battle.html` between the two side panels with radio groups:
   format (`singles`/`doubles`, default doubles), weather (none/sun/rain/sand/snow),
   terrain (none/electric/grassy/misty/psychic), and checkboxes gravity + Trick Room
   (move the existing Trick Room control into this card).
2. Store the selections in a module-level `fieldState` in `battle-page.js`; build the engine
   `field` from it via `createField` in `buildCalcInput`. Any change re-renders damage and
   move order.
3. Weather/terrain damage multipliers (pipeline steps 6 and 1) must apply: verify
   rain-boosted Water, sun-weakened Water, terrain ×1.3 for grounded users' matching moves,
   ×0.5 Misty Terrain dragon reduction against grounded targets, Grassy Terrain halving
   Earthquake/Bulldoze. **If any of these multipliers are missing in the engine, add them now**
   (registry/pipeline, with tests) — they are field basics, not Phase-2 mechanics.
4. Show active field effects as a note line in each damage card (reuse the engine `notes`).

## Acceptance criteria
- Golden checks vs the NCP calculator (record in tests): Charizard Weather Ball in sun vs a
  neutral target; Raichu Rising Voltage in Electric Terrain; Earthquake in Grassy Terrain.
- Field selections survive re-render (changing a Pokémon doesn't reset weather).
- Mobile width: the field card wraps cleanly.

## Tests
```sh
npm run test:battle
npm test
```
Add new cases to `test/damage.test.js` for each multiplier verified in step 3.

## Completion notes
- **Engine gap found and fixed** (step 3): the weather Fire/Water damage multiplier already
  existed in `src/engine/modifiers.js` (`weatherModifier`) and already worked once a real
  Showdown-style weather string reaches it (`SunnyDay`/`RainDance`/etc. — confirmed by the
  pre-existing tests at `test/damage.test.js` lines ~750–998, which already pass). What was
  genuinely missing were the three "field basics" the roadmap called out: Electric/Grassy/
  Psychic Terrain's own ×1.3 STAB-type boost for a grounded attacker, Misty Terrain's ×0.5
  Dragon-move reduction into a grounded target, and Grassy Terrain's ×0.5 reduction on
  Earthquake/Bulldoze/Magnitude into a grounded target. Added all three as new generic
  attacker-side modifiers in `src/engine/modifiers.js` (`terrainPowerModifier`,
  `mistyTerrainDragonModifier`, `grassyTerrainGroundMoveModifier`), gated on the same
  `state.grounded !== false` "auto = grounded" convention already used by `terrainpulse`/
  `risingvoltage` in `move-effects.js`. `field.js` itself needed no changes — `createField`
  already just spreads whatever string the caller passes.
- Added 4 new hand-computed golden tests to `test/damage.test.js` (Charizard Weather Ball in
  sun; Electric Terrain STAB boost, grounded vs. ungrounded; Misty Terrain Dragon reduction,
  grounded vs. ungrounded; Grassy Terrain Earthquake/Bulldoze reduction, grounded vs.
  ungrounded) — every assertion is exact `minDamage`/`maxDamage`, worked out by hand against
  the pipeline in ROADMAP.md (not the live NCP calculator), with the arithmetic shown in each
  test's comment.
- Added the Field card to `battle.html` as the middle column of `.damage-controls` (now a
  3-column grid: Attacker | Field | Defender), so it sits between the two side panels on
  desktop and stacks between them in DOM order on mobile (existing `max-width: 720px` rule
  already collapses `.damage-controls` to one column). Radio groups for Format/Weather/Terrain,
  checkboxes for Gravity + the moved Trick Room control. Weather/terrain radio values are the
  Showdown-style strings the engine already keys off of (`SunnyDay`, `Electric Terrain`, etc.)
  so they resolve correctly through `normalizeId` with no engine-side vocabulary change needed.
  The old "Battle conditions" fieldset now holds only the Critical hit checkbox.
- `src/ui/battle-state.js`: `buildCalcInput`'s `fieldInputs` now also forwards
  `weather`/`terrain`/`gravity` into the `Field` overrides (previously only `format`/
  `trickRoom`). Added a `battle-state.test.js` case covering the pass-through.
- `src/ui/battle-page.js`: added a module-level `fieldState` (format/weather/terrain/gravity/
  trickRoom) per the roadmap's step 2, populated by a new `handleFieldControl` listener on the
  Field card's inputs, and spread into `buildCalcInput` in `renderDamage`. It's intentionally
  never touched by `seedDamageSide`, so changing either side's Pokémon can't reset it —
  satisfies "Field selections survive re-render."
- `renderDamageCard` now appends a `.damage-notes` line reusing `result.notes` verbatim (step
  4) — this already surfaces field-driven notes like "Harsh sunlight", "Electric Terrain
  boost", and "Misty Terrain weakens Dragon moves" alongside the existing ability/item notes.
- Verified: `npm test` — 137/137 passing (was 132 before this task; +1 battle-state case, +4
  golden damage cases). `node --check` on the three edited engine/UI JS files. A Python
  `html.parser` pass over `battle.html` confirms every tag is balanced (no mismatched/unclosed
  elements from the markup restructure). Started `scripts/serve.mjs` and curled
  `battle.html`/`src/ui/battle-page.js`/`src/styles.css` (all 200).
- **Manual browser check completed** (2026-07-09, after the user started `npm start` and
  shared the local server): drove their real Chrome via the browser tools at 1440px. The
  Field card renders as the centered middle column between Attacker and Defender exactly as
  designed, zero console errors/messages on load. Selected Electric Terrain, then Rising
  Voltage's damage card updated live to "Guaranteed 1HKO" with a
  "Rising Voltage power 140 · Light Ball · Electric Terrain boost" notes line — confirms the
  new terrain modifier, the fieldState wiring, and the notes-line feature all work together
  end-to-end in a real browser. Selected Sun weather, then changed the attacker from Pikachu to
  Charizard-Mega-X via the search box: Sun stayed selected throughout, confirming field
  selections survive a Pokémon change as required.
  **Mobile width verified** (retried after the first attempt's `resize_window` call didn't
  stick — a second resize + reload got `window.innerWidth` down to 500, comfortably under the
  720px breakpoint). Screenshots confirm `.damage-controls` collapses to a single column and
  stacks Attacker → Field card → Defender in that order: the Format/Weather/Terrain radio rows
  and the Gravity/Trick Room checkboxes all render full-width and wrap onto their own lines with
  no clipping or overflow, and the layout flows directly from the end of the Field card into the
  "Defender" heading. Both acceptance criteria ("centered... between the two side panels" on
  desktop, "wraps cleanly" on mobile) confirmed visually.

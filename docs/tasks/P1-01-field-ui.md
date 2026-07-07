# P1-01 — Field UI panel (format, weather, terrain, gravity, Trick Room)

Status: TODO
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

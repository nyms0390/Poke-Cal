# P3-04 — Team slots (up to 6 Pokémon per side)

Status: Done
Depends on: P3-03
Phase: 3 (calculator UX parity)

## Files to read
- `src/ui/battle-page.js` (`damageState` two-side structure), `src/ui/battle-state.js`
- NCP layout: 6 mini-slots above each panel; clicking swaps the active Pokémon; each slot
  keeps its full configuration

## Files to change
- `src/ui/battle-page.js`, `src/ui/battle-state.js`, `battle.html`, `src/styles.css`

## Goal
Configure a whole team once, then flip between matchups without re-entering sets — the core
NCP workflow for practice sessions.

## Steps
1. Extend page state: `teams = { left: [sideState × up to 6], right: [...] }` with
   `activeIndex` per side. `damageState.attacker/defender` become views onto the active slot.
2. UI: slot bar per side — small buttons with the Pokémon name (blank slots show "+").
   Click = activate; long-press/x button = clear slot. Active slot highlighted.
3. All existing controls keep writing to the active slot's state; switching slots re-renders
   everything (moves, SP, damage results, move order).
4. Persist teams to localStorage (`pokecal.teams.v1`) through the same storage wrapper as
   P3-03.
5. Unit-test the slot state transitions in `test/battle-state.test.js` (activate, clear,
   edit-active-only).

## Acceptance criteria
- Configure 2 Pokémon on each side, flip between all 4 pairings — each shows its own damage
  results with no state bleed.
- Reload restores teams (manual check). Mobile: slot bar wraps, stays tappable.

## Tests
```sh
npm run test:catalog && npm test
```

## Completion notes

- Added immutable six-slot team state transitions with per-side active indices, active-slot
  views for the calculator, and isolated edit/clear behavior.
- Added responsive slot bars with `+` empty slots, active highlighting, and per-slot clear
  buttons; switching slots re-renders the full saved configuration.
- Persisted teams under `pokecal.teams.v1` with catalog rehydration on reload and an in-memory
  fallback when storage access fails.
- `npm run test:catalog`, `npm test`, `node --check`, and local HTTP serving checks pass. The
  browser plugin could not initialize in this environment, so interactive reload/mobile QA
  remains an environment limitation rather than an unverified code claim.

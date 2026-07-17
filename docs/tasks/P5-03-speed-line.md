# P5-03 — Speed tiers page (`speed.html`, dedicated tab)

Status: Done
Depends on: P5-01 (threat sets/presets). NOT on P5-02 anymore — this is its own page.
Phase: 5 (builder utility)

Reference for the presentation: Smogon's
[Champions OU Speed Tiers thread](http://www.smogon.com/forums/threads/champions-ou-speed-tiers.3780503/)
— a single descending list `Spe | +/- | EVs | Pokémon`, ties comma-merged on one row,
boosted rows interleaved purely by numeric speed. We build the interactive version of that.

## Files to read
- `src/engine/speed.js` (`calculateSpeed`, `finalSpeedInField` — already handles stage,
  tailwind, paralysis, scarf, Trick Room order; do not add speed math anywhere else)
- `src/data/threats.js` (`threatList`, `speedPresets`, `likely` flag)
- `src/ui/battle-page.js` + `src/ui/components.js` (search, SP inputs, bootstrap patterns)

## Files to create
- `speed.html`, `src/ui/speed-page.js`
- `src/data/speed-line.js`, `test/speed-line.test.js`

## Files to change
- Nav links in `index.html`, `battle.html` (and `builder.html`/`duel.html` if they exist),
  `src/styles.css`

## Goal
A dedicated speed-tiers tab: one **vertical axis** (descending final speed) ranking the
popular Pokémon — plus any manually added ones — against **one chosen Pokémon**. Two modes:

- **Base** — rank by raw base Speed stat only. All toggles and spreads disabled/hidden.
- **Battle** — final speed from the engine. Your side: full nature + Speed SP control.
  Opposing side: NO spread control — each opponent appears at 4 fixed presets
  (**Max** +Spe 32 · **Fast** neutral 32 · **Neutral** 0 · **Slow** −Spe 0 — relabel
  `speedPresets` output, same math). Speed-control toggles exist on BOTH sides.

## Design (pure module `src/data/speed-line.js`)
```js
speedTiers(user, opponents, options)
// user:      { pokemon, nature, spe /* SP */, mods }
// opponents: [{ pokemon, likelyPresetLabel }]   — from threatList + manual additions
// options:   { mode: "base" | "battle", trickRoom: false,
//              presetFilter: ["max","fast","neutral","slow"],
//              userMods: { tailwind, paralysis, choiceScarf, stage },
//              opponentMods: { tailwind, paralysis, choiceScarf, stage } /* applies to all */ }
// → rows sorted by speed desc, ties merged:
//   { speed, entries: [{ id, name, presetLabel, likely, isUser }],
//     stage, actsBefore /* vs user, Trick Room-aware */ }
// Base mode: speed = baseStats.spe, one entry per Pokémon, no presets/mods.
nextBreakpoints(user, rows)   // battle mode only — minimum Speed SP (and +Spe-nature
// variant when 32 isn't enough) to strictly exceed each not-yet-beaten tier above you:
// [{ tierSpeed, names, requiredSp, requiresPlusNature }]
```
All battle-mode numbers must come from `calculateSpeed` (stage/tailwind/paralysis/
multiplier/Trick Room order) — hand-compute nothing in this module.

## Steps
1. Implement `speedTiers` + `nextBreakpoints` with tests first (fixture of 3 opponents):
   tie merging; preset interleaving order; Trick Room flips `actsBefore` but NOT the sort;
   paralysis+tailwind stacking matches `calculateSpeed`; stage −1/+1/+2; breakpoint
   minimality (sp−1 fails, sp succeeds); base mode ignores every mod.
2. `speed.html` + `src/ui/speed-page.js` (bootstrap conventions, `?pokemon=<id>` param):
   - Chosen-Pokémon panel: search, nature, Speed SP input, its mod toggles.
   - Opponents panel: defaults to top-10 usage (`threatList`) with a Top 10/20/30/40/50
     selector; legal Mega forms for those ranked Pokémon are included without consuming
     popularity slots; search-to-add any Pokémon as removable chips; preset filter chips
     (default: all 4, `likely` preset marked ●); one shared mod-toggle group for the opposing side.
   - Mode switch **Base | Battle** at the top; Base grays out both toggle groups, SP,
     and presets. Global Trick Room toggle (battle only).
   - The axis: Smogon-style rows `speed · stage · preset · icons+names`, your row
     highlighted with an "acts before / after you" divider line at your speed; equal speed
     = speed tie (never "outspeeds"). Reuse the minisprite approach from P6-03.
   - Breakpoints list under the axis (battle mode): "+3 SP → outspeed Fast Chien-Pao";
     clicking applies the SP to your input and the axis re-sorts.
3. Builder note: builder.html gets NO speed section — it links here
   (`speed.html?pokemon=<id>`). P5-02's placeholder list drops "Speed line".
4. Manual QA desktop + mobile; long lists scroll within the axis, header stays visible.

## Acceptance criteria
- Zero speed math in the UI layer; `speed-line.js` fully tested without DOM.
- Base mode shows raw base stats identical to catalog values; Battle mode row for a
  Scarf+Tailwind+paralyzed case verified by hand against `calculateSpeed` in a test comment.
- Toggling any mod/preset/mode never loses manually added opponents.

## Tests
```sh
node --test test/speed-line.test.js && npm test
```

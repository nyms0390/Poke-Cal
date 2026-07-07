# P2-01 — Standard multi-hit moves, Skill Link, fixed three-hit moves

Status: TODO
Depends on: P1-06
Phase: 2 (mechanics burn-down)

## Checklist sections covered (MECHANICS_CHECKLIST.md)
"Standard two-to-five-hit damage" (Bullet Seed, Icicle Spear, Bone Rush, Rock Blast,
Water Shuriken, Arm Thrust, Barrage, Comet Punch, Double Slap, Fury Attack, Fury Swipes,
Pin Missile, Spike Cannon, Tail Slap) · "Fixed three-hit damage" (Surging Strikes,
Triple Dive) · "Maximum multi-hit count" (Skill Link) · "Multi-hit damage with stat changes"
(Scale Shot) · "Berry effect doubling" is NOT here (P2-08).

## Files to read
- `src/engine/move-effects.js` (`hits` handler contract, existing Dual Wingbeat entries)
- `src/engine/damage.js` (how fixed two-hit moves roll damage today)
- NCP behavior: 2–5-hit moves default to 3 hits with a hit-count dropdown

## Files to change
- `src/engine/move-effects.js`, `src/engine/modifiers.js` (Skill Link),
  `src/ui/battle-page.js` + `battle.html` (hit-count select), `src/ui/battle-state.js`,
  `MECHANICS_CHECKLIST.md`

## Steps
1. Registry entries `hits: [2, 5]` for the fourteen standard moves; `hits: 3` for
   Surging Strikes (also `alwaysCrit: true` — add this handler key; crit already exists in the
   pipeline) and Triple Dive.
2. Loaded Dice is not in Champions data? Check `public/items.json`; if present, item modifier
   forcing 4–5 hits (then hit-count select clamps).
3. Skill Link ability: force max hits. Implement as an ability that overrides the selected
   count.
4. UI: per-move hit-count `<select>` (visible only for `[min,max]` ranged moves), default 3
   like NCP. Selected count flows into `ctx` and multiplies per-hit damage (each hit re-rolls;
   the rolls array for n identical hits should be the n-fold convolution — reuse the ko-chance
   convolution helper rather than 16^n enumeration; keep min/max exact).
5. Scale Shot: standard 2–5 hits; note "-1 Def / +1 Spe after use" appended (no stat change to
   the calc itself).

## Acceptance criteria
- Golden vs NCP: Bullet Seed ×3 (default) and ×5 (Skill Link) — min/max match.
- Surging Strikes always-crit interacts with screens correctly (crit ignores screens).
- Tick every listed move in MECHANICS_CHECKLIST.md.

## Tests
```sh
npm run test:damage && npm test
```

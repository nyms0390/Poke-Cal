# P4-03 — Snapshot: speed-tier snippet vs top threats

Status: Done
Depends on: P4-01, P5-01 (threat module — do P5-01 first if reaching this task early)
Phase: 4 (snapshot polish)

## Files to read
- `src/engine/stats.js`, `src/engine/speed.js`
- `src/data/threats.js` (P5-01 — speed-tier presets per threat)

## Files to change
- `src/ui/lookup-page.js`, `src/styles.css`

## Goal
On the snapshot page, show where this Pokémon's speed lands: its own min/neutral/max speed at
level 50 and which of the top-10 usage Pokémon it out-speeds at each preset.

## Steps
1. Compute the Pokémon's speed presets with `calculateStat`:
   max (+nature, 32 SP), fast (neutral, 32 SP), uninvested (neutral, 0 SP),
   min (−nature, 0 SP).
2. From `threats.js`, take the top 10 by usage with their nature-weighted speed presets
   (use each threat's most common nature and 32 SP as its "expected max"; P5-01 defines
   `speedPresets(threat)` — reuse it, do not re-derive).
3. Render a compact 4-row summary: each row = preset name, speed number, and "outspeeds
   7/10 top threats" with a hover/expand list of names.
4. Keep it pure: computation in a small exported function
   (`speedTierSummary(pokemon, threats)`) living in `src/data/threats.js` or a sibling —
   testable without DOM.

## Acceptance criteria
- Numbers verified by hand for one Pokémon (comment the arithmetic in the test).
- Renders only when catalog + usage data are loaded; no card without threat data.

## Tests
```sh
npm run test:data && npm test
```

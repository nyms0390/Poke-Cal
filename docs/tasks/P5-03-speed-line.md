# P5-03 — Builder: speed line vs popular Pokémon

Status: TODO
Depends on: P5-02
Phase: 5 (builder utility)

## Files to read
- `src/data/threats.js` (`speedPresets`, `likely` flag), `src/engine/speed.js`
- `src/ui/builder-state.js`

## Files to create
- `src/data/speed-line.js`, `test/speed-line.test.js`

## Files to change
- `src/ui/builder-page.js`, `src/styles.css`

## Goal
The classic speed-tier sheet, personalized: one sorted column of speed values — yours
(with your exact SP/nature/item) interleaved with every threat's speed presets — so you can
see exactly whom you outspeed, tie, or underspeed, and what SP gets you past the next tier.

## Steps
1. `src/data/speed-line.js` (pure):
   - `speedLine(userState, threats, { tailwind = false, trickRoom = false })` →
     sorted array of `{ speed, owner: "you" | threatName, label, likely }` using
     `finalSpeed` for the user (so Choice Scarf/paralysis/tailwind apply) and
     `speedPresets` values for threats.
   - `nextBreakpoints(userState, threats)` → for each beatable-but-not-yet-beaten tier above
     the user's current speed, the minimum Speed SP (and, if 32 SP is not enough, the
     +Spe-nature variant) that strictly exceeds it: iterate sp 0…32 with `calculateStat`,
     find the smallest sp with speed > tier value. Return
     `[{ threatName, presetLabel, tierSpeed, requiredSp, requiresPlusNature }]`.
2. UI "Speed line" section: vertical sorted list, your row highlighted; threat rows show the
   preset label and a dot when it's the `likely` preset; toggles for Tailwind (yours) and
   Trick Room (reverses the comparison arrow, not the sort). Below: "breakpoints" list —
   "+3 SP → outspeed max(neutral 32) Chien-Pao" style lines, click applies the SP.
3. Tests: hand-computed three-threat fixture; tie handling (equal speed = tie, not outspeed);
   Trick Room reversal; breakpoint minimality (sp−1 fails, sp succeeds).

## Acceptance criteria
- Clicking a breakpoint updates the SP input and the line re-sorts consistently.
- All arithmetic tested without DOM; UI only renders module output.

## Tests
```sh
node --test test/speed-line.test.js && npm test
```

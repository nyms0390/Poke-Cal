# P3-01 — NCP-style result description line

Status: TODO
Depends on: P1-06
Phase: 3 (calculator UX parity)

## Files to read
- `src/engine/damage.js` — `formatDamageResult`, `notes`
- `src/ui/battle-page.js` — damage card rendering
- NCP output format example:
  `"32 SpA Choice Specs Miraidon Electro Drift vs. 32 HP / 0 SpD Calyrex-Ice in Electric
  Terrain: 178-211 (82.4 - 97.6%) -- guaranteed 2HKO"`

## Files to create
- `src/engine/result-text.js`, `test/result-text.test.js`

## Files to change
- `src/ui/battle-page.js`

## Goal
One canonical, copyable sentence per calc — the thing players paste into chats. This is the
most-used NCP feature after the numbers themselves.

## Steps
1. `src/engine/result-text.js`: `resultDescription({attackerState, defenderState, move,
   field, result})` assembling, in order:
   attacker SP + offensive stat label (use the stat the move actually used — `spa`/`atk`/`def`)
   + item (if damage-relevant) + attacker name + move name + " vs. " + defender HP SP +
   relevant defensive SP + defender name + field clauses ("in Electric Terrain", "in Sun",
   "through Reflect", "Tera Fire") + ": " + `min-max (minPct - maxPct%) -- koText`.
   Always print SP values even when zero (NCP prints "0 SpD"): `{n} HP / {n} SpD`.
2. Stage prefixes when non-zero: `"+2 32 Atk …"`.
3. Add a copy button on each damage card that copies the description
   (`navigator.clipboard.writeText`).
4. Unit-test the string assembly for: plain, crit, tera, screen, weather, stage cases.

## Acceptance criteria
- Format matches NCP word-for-word for the golden cases (adapted to SP numbers instead of
  EVs); add the description string to two golden cases in `test/golden.test.js`.
- Copy button works (manual check).

## Tests
```sh
node --test test/result-text.test.js && npm test
```

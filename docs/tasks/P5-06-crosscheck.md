# P5-06 — Builder/battle cross-check and release QA

Status: TODO
Depends on: P5-03, P5-04, P5-05
Phase: 5 (builder utility) — final task of the roadmap

## Files to read
- `test/golden.test.js`, all three `src/data/*-points.js` / `speed-line.js` modules

## Files to create
- `test/builder-crosscheck.test.js`

## Files to change
- `README.md`, `AGENTS.md`, `ROADMAP.md` (mark complete)

## Goal
Prove the builder never disagrees with the calculator, then close out the roadmap.

## Steps
1. `test/builder-crosscheck.test.js`: for 5 representative (user, threat, move) triples,
   assert `threatDamage`/`yourDamage` output equals a direct `calculateDamage` +
   `koChance` call with manually-assembled identical inputs — byte-equal min/max/koText.
   (This catches scenario-assembly bugs: wrong side, missing item, wrong tera.)
2. Re-run the FULL golden suite against the NCP calculator manually — spot-check 5 cases in
   the browser to catch drift since P1-06 (NCP updates its mechanics; note any intentional
   differences in `test/golden.test.js` comments).
3. Docs: update README.md (three-page overview, builder usage, assumptions section from
   P5-01), AGENTS.md (new modules, new test groups — also add `test:builder` script to
   package.json running threats/speed-line/bulk/break/crosscheck suites).
4. Full manual QA: run the P3-05 script plus a builder script (configure a meta Pokémon,
   check one speed breakpoint and one bulk point by hand on battle.html).
5. Mark all task files `Done`, set the roadmap status line, and note follow-up ideas at the
   bottom of ROADMAP.md (e.g. real spread data if Limitless ever publishes it, field-aware
   builder scenarios).

## Acceptance criteria
- Cross-check suite green; full `npm test` green.
- README/AGENTS accurate for a newcomer (no stale paths/commands:
  re-run the P0-07 grep checks).
- `grep -rn "Status: TODO" docs/tasks/` returns nothing.

## Tests
```sh
npm test
```

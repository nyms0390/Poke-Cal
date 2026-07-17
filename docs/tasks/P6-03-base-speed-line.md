# P6-03 — Snapshot: horizontal base-speed line

Status: TODO
Depends on: P6-02 (for the threat toggle; the "popular" mode only needs P5-01)
Phase: 6 (duel simulator & threat rework)

## Files to read
- `src/ui/lookup-page.js` (current speed-tier card, `speedTierRow` — to be replaced)
- `src/data/threats.js` (`threatList`, `threatRanking`)

## Files to create
- `src/data/speed-line-points.js`, `test/speed-line-points.test.js`

## Files to change
- `src/ui/lookup-page.js`, `src/styles.css`, `src/data/threats.js` (delete
  `speedTierSummary` + its tests once the card is replaced)

## Goal
Replace the 4-row preset summary card with a **horizontal line**: the 10 most popular
Pokémon plotted by **base Speed stat**, each shown as its icon sitting on the line with its
exact base speed number; the selected Pokémon highlighted on the same line. A toggle switches
the plotted set between "Popular" (top 10 usage) and "Threats" (top 10 from `threatRanking`).

## Steps
1. `src/data/speed-line-points.js` (pure):
   - `speedLinePoints(target, pokemonList)` → `{ min, max, points }` where each point is
     `{ id, name, baseSpeed, xPercent, isTarget, stackIndex }`.
   - `xPercent` = linear position on a padded axis (pad the domain ~5 base-speed on each
     side so end icons don't clip). Equal base speeds share `xPercent` and get incrementing
     `stackIndex` so the UI can offset them vertically instead of overlapping.
   - Target is always included as a point even if also in the list (dedupe by id,
     `isTarget: true` wins).
2. UI: one horizontal axis (CSS, not canvas) in the existing card slot. Each point: Pokémon
   mini-icon above the line, exact base speed number below it; target point visually
   distinct (accent color + name label). Icons via Showdown minisprites
   (`https://play.pokemonshowdown.com/sprites/gen5/<id>.png`, lazy-loaded, `alt` = name,
   graceful text-chip fallback on error — the app must stay usable offline).
   Stacked points offset upward; keep the row height fixed so the layout doesn't jump.
3. Toggle "Popular | Threats": Popular = `threatList(catalog, { count: 10 })`; Threats =
   `threatRanking(selected, catalog).map(e => e.threat)`. Threat mode may be async-ish
   (40 duels) — compute on toggle, not on every selection.
   This card stays deliberately simple (base stats, no toggles). Add a "Full speed tiers →"
   link to `speed.html?pokemon=<id>` (P5-03) once that page exists; render the link only
   if the page is present.
4. Remove `speedTierSummary` and its render path/tests; check nothing else imports it.
5. Check desktop and mobile widths (`npm start`); on narrow screens allow horizontal scroll
   of the line rather than shrinking icons below legibility.

## Acceptance criteria
- Base speed values are the raw `baseStats.spe` — no SP/nature/level math anywhere in this
  card, and exact numbers are visible without hover.
- Equal-speed Pokémon are all visible (stacked), none hidden.
- `speedLinePoints` fully tested without DOM (positions, padding, stacking, target dedupe).
- No regression on the rest of the snapshot page.

## Tests
```sh
node --test test/speed-line-points.test.js && npm test
```

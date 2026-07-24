# P5-04a — Builder: joint bulk coverage sections

Status: DONE
Depends on: P5-02, P5-04
Phase: 5 (builder utility follow-up)

## Files to read

- `src/data/bulk-points.js`
- `src/ui/builder-page.js`, `src/ui/builder-state.js`
- `builder.html`
- `src/styles.css`
- `src/locales/en.js`, `src/locales/zh-tw.js`
- `test/bulk-points.test.js`, `test/builder-state.test.js`, `test/i18n.test.js`
- `README.md` ("Builder breakpoint priority")

## Files to change

- `src/data/bulk-points.js`
- `src/ui/builder-page.js`, `src/ui/builder-state.js`
- `builder.html`
- `src/styles.css`
- `src/locales/en.js`, `src/locales/zh-tw.js`
- `test/bulk-points.test.js`, `test/builder-state.test.js`
- `README.md`

## Goal

Turn the bulk tab into an actionable coverage queue. Classify every Pokémon-family card as
**Possible**, **Covered**, or **Unreachable** by comparing the current spread with a zero-bulk
baseline and the next KO-tier breakpoint. Keep Possible open; collapse Covered and Unreachable.

Coverage must preserve every modeled tier:

```text
OHKO → 2HKO
2HKO → 3HKO
3HKO → 4HKO
4HKO → 5HKO
5HKO → not KO'd within 5 hits
```

Do not reduce coverage to "survives one hit." Do not create an "Already covered at 0 SP"
section.

## Definitions

### Analyzed matchup

One supported damaging move returned by the existing bulk analysis. Keep the current scope:
the top two damaging moves for each threat/form. A base Pokémon and all displayed Mega forms
belong to one family stack, and every form's analyzed matchups participate in that stack's
coverage calculation even when another form tab is active.

User-facing copy must say **analyzed moves**, not **all moves**.

### Zero-bulk baseline

Clone the current user state and set only `sp.hp`, `sp.def`, and `sp.spd` to `0`. Preserve the
current Pokémon, Nature, ability, item, Tera, status, Atk/SpA/Spe SP, stages, field, and every
threat build. Recompute the baseline whenever any preserved input changes.

### Stack breakpoint

Use `koHitCount()` for the ordered tier values:

```text
OHKO = 1, 2HKO = 2, …, 5HKO = 5, not KO'd within 5 hits = 6
```

For one family stack:

```js
originHits = Math.min(...baselineMatchups.map(({ damage }) =>
  koHitCount(damage.koText)));
targetHits = Math.min(6, originHits + 1);
currentHits = Math.min(...currentMatchups.map(({ damage }) =>
  koHitCount(damage.koText)));
```

The target applies to every analyzed matchup in the stack. Matchups already above the target
at zero bulk need no further improvement; matchups tied at the stack's worst origin tier are
the constraints that must improve. This prevents a secondary physical/special move or Mega
form from remaining below the advertised covered tier.

An origin at tier `6` is terminal: `targetHits` stays `6`, its required SP is `0`, and the
stack is Covered.

### Defensive budget

Use the builder's existing 66-point total-SP rule. Add
`availableBulkSpBudget(sp)` to `src/ui/builder-state.js`:

```js
Math.max(0, 66 - sp.atk - sp.spa - sp.spe)
```

Clamp each defensive stat to `0…32`. The joint search replaces the complete HP/Def/SpD
allocation, so it may find a cheaper redistribution than the current defensive spread. Pass
the resulting defensive budget into the pure data helper; `src/data/` must not import from
`src/ui/`.

### Minimum joint SP

Search legal `(hp, def, spd)` triples in ascending `hp + def + spd` order. The first total for
which every analyzed matchup reaches `targetHits` is `requiredSp`. This must be one allocation
that covers the entire family stack, not the sum or minimum of independent per-move answers.

Precompute each matchup's KO tier for its `33 × 33` `(hp, relevantDefense)` grid, using the
damage result's `defenseStat` and the existing move-category fallback. Score joint triples by
table lookup so live builder renders do not run a fresh damage calculation for every
`(hp, def, spd, matchup)` combination.

### Coverage section

Assign exactly one status:

```js
if (currentHits >= targetHits) status = "covered";
else if (Number.isFinite(requiredSp)) status = "possible";
else status = "unreachable";
```

Possible means a single legal HP/Def/SpD allocation can raise the whole stack to the target.
Unreachable means no such allocation exists within the defensive budget, even if individual
moves have independently reachable thresholds.

### Per-move Covered badge

A move is Covered when its current exact KO hit count is greater than its own zero-bulk hit
count. Keep the exact current KO badge (`guaranteed 2HKO`, `25.0% chance to OHKO`, and so on)
unchanged. Replace the closed disclosure's `View threshold spreads` prompt with a clickable
`✓ Covered` prompt only for moves meeting this definition.

Opening a bulk move disclosure shows:

1. Zero-bulk exact min–max damage and exact KO text.
2. Current exact min–max damage and exact KO text.
3. The first zero-bulk frontier allocation whose tier is reached by the current spread, when
   the move is Covered.
4. The existing threshold choices that remain reachable from the current spread.

Do not replace exact KO text with generic text such as "guaranteed survival." Do not lower the
opacity of the entire move disclosure; mute only its meter/background so its text and controls
remain readable and do not appear disabled.

## Ordering

Render sections in this order:

1. **Possible** — open as a normal card grid.
2. **Covered** — `<details>`, collapsed by default.
3. **Unreachable** — `<details>`, collapsed by default.

Remember Covered/Unreachable disclosure state in the existing `openAnalysisPanels` set so a
live input update does not close a section the user opened. Omit an empty section.

Within every section, use the original bulk breakpoint-priority tuple:

```js
[originHits, requiredSp]
```

Lower origin tiers sort first, so OHKO → 2HKO remains ahead of 2HKO → 3HKO, followed by the
later tiers. For equal origin tiers, lower joint `requiredSp` sorts first. Use `Infinity` for
Unreachable SP cost while retaining its real `originHits`, so an unreachable OHKO still sorts
before an unreachable 2HKO. Preserve catalog order when both values tie.

The bulk tab always uses this section order and breakpoint ranking. Hide the existing
`Breakpoint priority`/`Default order` toggle while Bulk is selected; retain its present
behavior for the Break points tab.

## Implementation

1. In `src/data/bulk-points.js`:
   - Add `zeroBulkState(userState)` without mutating the supplied state.
   - Extend `bulkPointMatchups()` so every matchup carries `baselineDamage` and
     `baselinePoints` alongside the existing current `damage` and `points`.
   - Add `bulkCoverage(userState, matchups, { budget })`, returning
     `{ status, originHits, targetHits, currentHits, requiredSp }`.
   - Add `rankBulkCoverageGroups(groups)`, reading `group.coverage` and sorting by
     `[originHits, requiredSp ?? Infinity]`.
   - Remove `rankBulkPokemonGroups()` after its callers/tests move to the coverage ranker.
2. In `src/ui/builder-state.js`:
   - Export `availableBulkSpBudget(sp)` using the existing 66-point rule.
   - Replace the obsolete 3HKO `partitionBulkMatchups()` helper with
     `partitionBulkCoverageGroups(groups)`, returning
     `{ possible, covered, unreachable }` without reordering within each array.
3. In `src/ui/builder-page.js`:
   - Pass `availableBulkSpBudget(state.user.sp)` into baseline/current bulk calculations.
   - Attach `bulkCoverage()` results to every family after all form matchups are grouped.
   - Rank once with `rankBulkCoverageGroups()`, then partition into the three sections.
   - Remove the old primary-versus-more-detail rendering path.
   - Render Possible directly and Covered/Unreachable with reusable section disclosures and
     localized card/matchup counts.
   - Preserve the active form switch and compute family status from all forms, not only the
     visible form.
   - Keep the exact KO badge in `analysisMovePanel()` and add the Covered prompt plus expanded
     baseline/current comparison only for defensive bulk panels.
   - Hide the sort toggle on the Bulk tab and restore it on the Break points tab.
   - Update `builder.html`'s bulk-assumption fallback copy to say that family coverage checks
     the two analyzed damaging moves for every displayed form.
4. In `src/styles.css`:
   - Reuse the current `.builder-more-detail` disclosure shape for section disclosures.
   - Add section-heading/count styles and a success-colored Covered prompt.
   - Add selective covered-move muting without applying `opacity` to the disclosure container.
   - Keep the section summaries and grids single-column at `max-width: 720px`.
5. Add matching English and Traditional Chinese messages for the three sections, counts,
   zero-bulk/current comparison labels, Covered prompt, and the revised
   `builder.bulkAssumption` explanation. Update the corresponding exact fallback sentence in
   `STATIC_ZH_TW` and preserve `test/i18n.test.js` catalog parity.
6. Rewrite README.md's "Builder breakpoint priority" bulk bullet to document the zero-bulk
   origin tier, joint required SP, three sections, all-form coverage, and fixed section order.

## Tests

### `test/bulk-points.test.js`

Add fixtures/tests that:

1. `zeroBulkState()` zeros only HP/Def/SpD and does not mutate the source.
2. An OHKO-origin stack targets 2HKO; a 2HKO-origin stack targets 3HKO; 3HKO, 4HKO, and 5HKO
   origins target their next modeled tiers.
3. A terminal `not a KO within 5 hits` stack is Covered with `requiredSp: 0`.
4. A family with two forms is not Covered until every form's constraining matchup reaches the
   target.
5. A physical and special pair that are independently reachable but cannot be reached by one
   allocation within the supplied budget is Unreachable.
6. Raising that fixture's budget makes it Possible; applying a covering fixture spread makes
   it Covered.
7. `requiredSp` equals a brute-force reference minimum over all legal HP/Def/SpD triples.
8. Ranking orders origin tiers `1…6`, uses lower joint SP within one tier, keeps unreachable
   tiers ordered by origin, and preserves input order on a complete tie.
9. A move receives Covered status only when its exact hit count improves from its own baseline;
   probability changes within the same KO tier do not count.

### `test/builder-state.test.js`

Add fixtures/tests that:

1. `availableBulkSpBudget()` subtracts Atk/SpA/Spe but replaces, rather than subtracts, current
   HP/Def/SpD.
2. Coverage partitioning places every group in exactly one section and preserves ranked order.
3. The former 3HKO/detail partition test is removed because later KO tiers now participate in
   the same coverage workflow.

Run:

```sh
node --test test/bulk-points.test.js test/builder-state.test.js test/i18n.test.js
npm test
```

## Manual QA

Run `npm start`, then verify `builder.html` at desktop width and at `390px`:

1. Possible is visible; Covered and Unreachable are collapsed on first render.
2. Opening a collapsed section survives HP/Def/SpD, field, threat-build, and form updates.
3. Changing defensive SP moves a family only when its whole-stack target changes status.
4. A partially covered family stays Possible and marks only its improved move disclosures.
5. Covered disclosures retain exact KO text and expose zero-bulk/current exact results plus
   threshold choices.
6. Mega-form switching cannot reveal a move below the Covered section's target.
7. The sort toggle is absent on Bulk and still works on Break points.
8. Top-20 threat rendering and one live SP edit each complete in under one second; remove any
   temporary timing instrumentation before finishing.

## Acceptance criteria

- Every supported KO tier participates; 3HKO and later cards are lower priority, not hidden in
  a separate detail bucket.
- Possible is the only section expanded by default.
- Covered is truthful for every analyzed move across every displayed form at the stack target.
- Possible/Unreachable uses one legal joint defensive allocation and the builder's available
  total-SP budget.
- Exact damage ranges and KO text remain visible and localized.
- Focus, disclosure state, desktop/mobile layout, and Break-point sorting continue to work.
- Narrow tests and the complete `npm test` suite pass.

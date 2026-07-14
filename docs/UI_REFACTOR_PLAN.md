# Battle Page UI Refactor Plan

Status: TODO
Depends on: P0-07, P1-01, P1-02, P2-01 (all Done)
Scope: `battle.html`, `src/ui/battle-page.js`, `src/ui/battle-state.js`, `src/ui/components.js`, `src/styles.css`, `src/engine/natures.js`, `src/engine/move-effects.js`, `src/data/catalog.js`, tests.

## Goals

1. Field card owns the format (Singles/Doubles) tag and per-side Tailwind.
2. Remove Terastallize, Power Spot, Battery, Steely Spirit, Flower Gift from the UI.
3. One unified six-row `.battle-stat-editor` per side (`Stat | Base | SP | Final | Stage`), em dash for HP's stage.
4. Fixed side-card order: team → search → set preset → stat editor → nature/ability/item/status → current HP → four full-width move rows → Speed → collapsed assumptions.
5. No usage rates in ability/item/move option labels.
6. Move selection via search panel (combobox), like Pokémon search.
7. Nature labels formatted `Bold (+Def, -Atk)`.
8. Crit is a per-move toggle placed after each move row (global crit checkbox removed).
9. Multi-hit moves get a hit-count dropdown; condition-based moves get a fulfilled/not-fulfilled toggle.

## Decisions (defaults taken; flag if wrong)

- **Removals are UI + UI-state only.** Engine support for tera/aura/screen-adjacent modifiers in `src/engine/` stays (registry-driven, inert without input). Only `battle.html` controls, `battle-page.js` wiring, and `battle-state.js` field keys are removed.
- **Base column is read-only** (species base stat). PokéCal has no base-stat override state; adding one is out of scope.
- **Stage becomes a `<select>`** (+6 … −6, default 0) instead of the current number input, matching the reference UI.
- **Tailwind stays per-side semantically** but renders in the field card's side panels; it keeps feeding `attackerState.tailwind`/`defenderState.tailwind` in `buildCalcInput`.
- **Conditional-move toggle is an override**: unset = engine derives from state (current behavior, e.g. Hex reads defender status); set = forced on/off.

---

## R1 — Field grid: format tag + Tailwind

Files: `battle.html:142-212`, `src/ui/battle-page.js` (`fieldState :182-190`, `neutralFieldSidePanel :164-175`, `handleFieldControl :606-620`, `syncFieldInputs :694-703`, `ID_CONTROL_KINDS :136-146`), `src/ui/battle-state.js` (`createSideState :75-99`, `applyControl` case `tailwind`, `buildCalcInput :204-238`), `src/styles.css` (`.field-card :787-796`).

Steps:
1. Restructure `.field-card` contents into a `.field-grid`: row 1 = Singles/Doubles segmented tag (restyle the existing `field-format` radio-group as a `.segmented-tag`), row 2 = weather, row 3 = terrain, row 4 = Gravity + Trick Room inline toggles, row 5 = two side-condition panels side by side (`grid-template-columns: 1fr 1fr`, collapsing to 1 col at 720px).
2. Add a `Tailwind` checkbox (`data-kind="field-side" data-key="tailwind"`) to each side panel in `battle.html`; delete `#attacker-tailwind`/`#defender-tailwind` from the side cards (`battle.html:107-120`, `:288-301`).
3. Add `tailwind: false` to `neutralFieldSidePanel()`; remove `tailwind` from `ID_CONTROL_KINDS` and from `createSideState`; drop the `tailwind` case from `applyControl`.
4. In `buildCalcInput`, source tailwind from the field panels: `attackerState.tailwind = fieldInputs.attackerSide.tailwind` (and mirrored for defender / `reverseField`). Keep `swap-sides` behavior correct — panels already swap with `fieldState`.
5. Update `syncFieldInputs` so the new checkbox rehydrates on swap.

Acceptance: Tailwind toggles live only in the field card; speed order output (`#move-order`, `renderMoveOrder :1203-1225`) still reflects tailwind; swap sides carries tailwind with the side panel.

## R2 — Remove Tera, Power Spot, Battery, Steely Spirit, Flower Gift

Files: `battle.html:101-106/187-190/203-206/282-287`, `src/ui/battle-page.js` (`ID_CONTROL_KINDS`, tera-type population `renderSideSelects :564-568`), `src/ui/battle-state.js` (`BOOST_FIELD_KEYS`/`SCREEN_FIELD_KEYS :186-187`, `applyControl` cases `tera`/`teraType`, `createSideState.teraType`), `test/battle-state.test.js`.

Steps:
1. Delete the Tera row (`.condition-row` with `#…-tera`, `#…-tera-type`) from both side cards; delete the four side-panel checkboxes (`powerSpot`, `battery`, `steelySpirit`, `flowerGift`) from both field panels.
2. `BOOST_FIELD_KEYS = ["helpingHand", "tailwind"…]` → becomes `["helpingHand"]` (+ whatever screen keys remain: `SCREEN_FIELD_KEYS = ["reflect", "lightScreen", "auroraVeil", "friendGuard"]`). Note: this also retires the known `neutralFieldSidePanel` bug where `flowerGift` was missing from the initial object.
3. Remove `tera`/`teraType` from `ID_CONTROL_KINDS`, `applyControl`, `createSideState`; remove tera handling from set import/export (`applyParsedSet :705-806`) — parse-and-ignore `Tera Type:` lines so pastes don't error.
4. Update `test/battle-state.test.js` shape assertions (`:68-92`) and `buildCalcInput` slicing tests (`:220-353`).

Acceptance: no tera/aura-toggle DOM remains; `npm test` green; importing a Showdown paste containing `Tera Type:` succeeds with a warning at most.

## R3 — Unified `.battle-stat-editor`

Files: `battle.html:93-100/274-281`, `src/ui/components.js` (`spInput :121-132`, `stageInput :134-145`), `src/ui/battle-page.js` (`renderSideInputs`, `renderFinalStats :1050-1069`), `src/styles.css` (`.stat-inputs :870`, `.stage-inputs :874`, `.final-stat-readout :971-979`).

Steps:
1. New component `statEditorRow(stat, { base, sp, final, stage })` in `components.js` producing one grid row; container `renderStatEditor(side)` builds header row + six stat rows into `#attacker-stat-editor` / `#defender-stat-editor`.
2. Grid: `.battle-stat-editor { display: grid; grid-template-columns: auto 1fr 1fr 1fr 1fr; }` with cells `.stat-cell-label | .stat-cell-base | .stat-cell-sp | .stat-cell-final | .stat-cell-stage`. Header row: `Stat | Base | SP | Final | Stage`.
3. Base: read-only text from species. SP: number input 0–32, `data-kind="sp"` (unchanged control contract). Final: computed value, re-rendered on every state change (replaces `.final-stat-readout`). Stage: `<select>` +6…−6 with `data-kind="stage"`; **HP row renders `—` (em dash, `&mdash;`) in the Stage cell** — a plain `<span>`, no control.
4. Delete `#…-sp-inputs`, `#…-stage-inputs`, and `.final-stat-readout` markup + CSS; delete `spInput`/`stageInput` or reduce them to internals of `statEditorRow`.
5. Stage select shows nature-colored final values optionally later — out of scope now.
6. Responsive: at ≤720px keep five columns but shrink paddings; do not wrap rows.

Acceptance: exactly one stat grid per side; six rows in HP/Atk/Def/SpA/SpD/Spe order; HP stage cell is an em dash; `applyControl` kinds `sp`/`stage` unchanged so `test/battle-state.test.js` control tests pass untouched.

## R4 — Side-card order + full-width move rows

Files: `battle.html:32-140/214-321`, `src/styles.css` (`.damage-side :650`, `.damage-picks :848`, `.damage-move-picks :852-868`, `.condition-row :942`).

Target order inside each `.damage-side`:
1. Panel heading + summary
2. Team slots (`.team-slots`)
3. Pokémon search combobox
4. Set preset row (`.saved-set-controls` + `#…-spread` select, merged into one row)
5. `.battle-stat-editor` (R3)
6. Nature / Ability / Item / Status — one `.damage-picks` grid, 2×2 (`repeat(2, 1fr)`), status select moves up from the old condition-row
7. Current HP row (`.hp-inputs`: current / max / %) — kept as its own row, no longer visually inside a stat grid
8. Four move rows, **full width**: `.damage-move-picks { grid-template-columns: 1fr; }` — each row is one line (R6/R8/R9 define its contents)
9. Speed row: `#…-speed-multiplier` + computed Speed readout (the Spe chip formerly in `.final-stat-readout`)
10. `<details class="assumption-panel">` (collapsed) — unchanged contents minus removed toggles

Steps: reorder markup in `battle.html` for both sides identically; update `elements` map (`battle-page.js:47-120`) for any renamed IDs; keep all `data-kind`/id contracts stable where possible so `controlFromTarget` (`:809-816`) is untouched.

Acceptance: DOM order matches the list above on both sides; mobile (≤720px) stacks in the same order.

## R5 — Strip usage rates from option labels

Files: `src/ui/battle-page.js:553, 559, 898`.

Steps: labels become `ability.name`, `item.name`, and `` `${move.name} · ${move.type ?? "—"}` ``. Keep `rankByUsage` ordering and `championsDefaultsForPokemon` defaults — only the visible percentage/uses text goes. `formatChampionsUsage` (`catalog.js:113-121`) stays for the lookup page.

Acceptance: no `%`/`uses` text in any battle-page select; option order unchanged.

## R6 — Move search panel

Files: `battle.html` move-picks blocks, `src/ui/battle-page.js` (`renderDamageMovePickers :881-954`, Pokémon combobox handlers `:323-392`), `src/ui/components.js` (`searchResultButton :106-118`), `src/data/catalog.js` (`filterMoves :156-175`), `src/styles.css` (`.search-results :189`, `.search-result :204-241`).

Steps:
1. Generalize the Pokémon combobox into a reusable `attachCombobox({ input, resultsEl, getMatches, onSelect, renderRow })` helper (extract from `renderPokemonSearchResults`/`handlePokemonSearchKeydown`, keep arrow/Enter/Escape + outside-click close).
2. Each move row replaces its `<select>` with: hidden value holder + search input (`role="combobox"`, placeholder = current move name) + `.search-results` dropdown. Matches come from the Pokémon's learnset ranked by usage, filtered with `filterMoves(moves, { query })`; result rows show name, type, BP, category (reuse `searchResultButton` layout with type in `small`, BP in `strong`).
3. Selecting fires the existing `damage-move` control path (kind `move`, index) so `applyControl`'s move-slot reset logic (`battle-state.js:148-155`) is untouched.
4. Refactor the Pokémon combobox to consume the same helper (deduplicates ~70 lines).

Acceptance: typing filters within the learnset; keyboard navigation works; empty query on focus shows top-usage moves; selection updates damage cards; Pokémon search behavior unchanged.

## R7 — Nature label format

Files: `src/engine/natures.js:44-48`, `test` snapshots if any.

Step: `natureOptionLabel` returns `` `${natureName} (+${up}, -${down})` `` → e.g. `Bold (+Def, -Atk)`. Neutral natures stay bare (`Hardy`). Grep tests for the old `+Def -Atk` format and update.

Acceptance: nature select shows `Brave (+Atk, -Spe)` style labels on battle and lookup pages.

## R8 — Per-move Crit toggle

Files: `battle.html:344-347` (delete `#damage-critical`), `src/ui/battle-page.js` (`renderDamageMovePickers`, `buildCalcInput` call site, `moveOptionsForDamage :1040-1048`, `renderDamageCard :1118-1132`), `src/ui/battle-state.js` (`createSideState`, `applyControl`), `src/engine/damage.js` (per-move critical via options), tests.

Steps:
1. State: add `critMoves: [false, false, false, false]` to `createSideState`; new `applyControl` case `crit` (index-based, same pattern as `singleTarget`); reset to `false` on move change inside the `move` case.
2. UI: append a `Crit` toggle button (`.move-toggle`, `aria-pressed`) after each move row's search input; `data-kind="crit" data-index`.
3. Calc: remove global `critical` from `buildCalcInput`; pass `critical: state.critMoves[i]` through `moveOptions` per damage card; moves with `alwaysCrit` (Surging Strikes, `move-effects.js`) render the toggle pressed + disabled.
4. Delete `#damage-critical` markup, element entry, and wiring; update `test/battle-state.test.js` (state shape + new case) and any `test/damage.test.js`/`test/ko-chance.test.js` fixtures using the global flag.

Acceptance: crit applies per move only; toggling one move's crit changes only that damage card; always-crit moves show a locked pressed toggle.

## R9 — Hit-count dropdown + condition-fulfilled toggle

Files: `src/engine/move-effects.js` (`MOVE_EFFECTS`, `isOrderConditionalMove :459`), `src/ui/battle-state.js`, `src/ui/battle-page.js` (`renderDamageMovePickers :908-938`), `docs/tasks/P2-01-multi-hit.md` (reference).

Steps:
1. Multi-hit: keep the existing `hit-count` select (only rendered when `hitCountRange` min≠max) but move it inline into the new full-width move row, labeled `× hits`. Skill Link/Loaded Dice interplay (`modifiers.js:140-177`) unchanged.
2. Conditional moves: add registry metadata to `MOVE_EFFECTS` entries whose BP is condition-gated — `condition: { label: "Target statused" }` for `hex`, `venoshock`, `barbbarrage`, `infernalparade`, `smellingsalts`, `wakeupslap`, `facade` ("User statused"), `acrobatics` ("No item") — and export `moveCondition(move)`.
3. State: `conditionOverrides: [null, null, null, null]`; `applyControl` case `moveCondition` (`null` = auto); reset on move change.
4. UI: for moves with `moveCondition`, render a three-state control (Auto / Yes / No — a small select, consistent with the hits dropdown) after the move; the existing `target-moved` checkbox migrates into the same slot for order-conditional moves.
5. Engine: `moveOptions.conditionOverride` threaded into the effect ctx; each conditional entry checks the override before deriving from `attackerState`/`defenderState`.
6. Tests: extend `test/battle-state.test.js` for the new state/case; add engine tests asserting override beats derived state (e.g. Hex vs healthy defender with override=yes → 130 BP path).

Acceptance: Facade/Hex show the condition control; override forces the 2× branch regardless of status selects; Auto reproduces current behavior exactly (golden tests unchanged with overrides unset).

---

## Test impact summary

- `test/ui.test.js` — safe (no DOM assertions).
- `test/battle-state.test.js` — must update: state shape (tailwind out, tera out, `critMoves`/`conditionOverrides` in), removed/added `applyControl` cases, `BOOST_FIELD_KEYS`/`SCREEN_FIELD_KEYS` slicing.
- `test/damage.test.js`, `test/ko-chance.test.js`, `test/golden.test.js` — only if fixtures use global `critical`; goldens must stay byte-identical with overrides unset.
- `test/set-paste.test.js` — tera-line tolerance (R2.3).

## Rollout order

R7 → R5 (label-only, zero risk) → R2 (removals shrink surface) → R1 (field grid) → R3 (stat editor) → R4 (reorder) → R6 (move search) → R8 (crit) → R9 (conditions). Each step lands with `npm test` green and a manual browser check (both sides, swap, mobile width, damage output sanity vs a known calc).

## Verification

```sh
npm test
```

Plus manual checks per step: DOM order audit against R4's list, keyboard-only pass on both comboboxes, swap-sides state round-trip, and one golden hand-check (e.g. Aegislash Poltergeist vs a saved defender) before/after each mechanical change (R8/R9).

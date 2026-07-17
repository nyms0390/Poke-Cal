# P6-04 — Duel simulator page (`duel.html`)

Status: TODO
Depends on: P6-01, P6-02, P6-03 (ship the engine-backed features first)
Phase: 6 (duel simulator & threat rework) — last task of the phase

## Files to read
- `src/engine/duel.js`, `src/data/threats.js` (`duelSide` helper from P6-02)
- `src/ui/bootstrap.js`, `src/ui/components.js`, `battle.html` + `src/ui/battle-page.js`
  (page skeleton / nav / selector patterns to copy)

## Files to create
- `duel.html`, `src/ui/duel-page.js`

## Files to change
- Nav links in `index.html`, `battle.html` (and `builder.html` if it exists by then),
  `src/styles.css`, `README.md`

## Goal
A dedicated tab where the user picks two Pokémon and watches the deterministic duel:
who moves first, which move each side auto-picks and why, average damage per hit, HP bars
per turn, and the verdict. Think of it as the explainer for the threat list — every
"X threatens Y" claim must be reproducible here.

## Steps
1. `duel.html` + `src/ui/duel-page.js` following the bootstrap/page conventions. Two
   selector columns (reuse the battle-page Pokémon selector pattern); each side defaults to
   its common set (moves/item/ability/nature via the P6-02 `duelSide` assembly), shown as
   read-only chips with the SP-preset assumptions labeled.
2. "Fight" renders the `simulateDuel` log: one row per action — turn number, actor icon,
   chosen move (+ "picked over <other moves>" tooltip from average damage), damage %, and
   defender HP bar after. Verdict line for win/tie/draw with turn count.
3. A "why this move" affordance: per turn, list each candidate move's average damage so the
   auto-pick is transparent (this is the tool's whole point — trust through inspection).
4. Prefill support: arriving via `duel.html?a=<id>&b=<id>` pre-selects both sides, and the
   snapshot threat list (P6-03 threat mode) links each threat here against the selected
   Pokémon.
5. Note limitations on-page (one line): common sets, average damage, no field/speed
   control, no switching — link README section. Future win-rate mode (v2) gets a disabled
   placeholder toggle only if trivial; otherwise skip.
6. Manual QA both widths; update README (five-page overview: index/battle/builder/speed/duel).

## Acceptance criteria
- Zero battle math in the UI layer — the page renders `simulateDuel` output only.
- Deep link from the snapshot threat mode reproduces the exact result the ranking claimed
  (same duel inputs — cross-check one case by hand).
- Works served statically (`npm start`), no new dependencies.

## Tests
```sh
npm test   # engine untouched; this task is UI-only
```

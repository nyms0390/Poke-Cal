# PokéCal Roadmap

This document is the master plan for finishing PokéCal. It is written so that any coding agent
(including smaller models) can pick up one task at a time and make correct, verifiable progress.
Individual work units live in `docs/tasks/*.md` — **one task file = one work session = one commit.**

## Product goals

1. **Snapshot** — quick lookup of a Pokémon: stats, forms, abilities, moves, items, Champions
   usage, common build, type matchups, speed tier. (Exists on `index.html`; polished in Phase 4.)
2. **Full calculator** — a two-Pokémon damage calculator with feature parity to the
   [NCP-VGC Damage Calculator](https://nerd-of-now.github.io/NCP-VGC-Damage-Calculator/),
   scoped to the **Champions doubles format only** (no old gens, no Dynamax, no Z-Moves).
   (Exists in reduced form on `battle.html`; completed in Phases 0–3.)
3. **Builder utility** — a team-building page: given your Pokémon and SP spread, show
   **bulk points**, **break points**, and a **speed line** against popular Pokémon derived from
   Limitless Champions usage. (New `builder.html`; Phase 5.)

## Hard constraints (never violate)

- **No build step, no npm dependencies.** Plain ES modules served statically. Tests run with
  `node --test`. Deployment is GitHub Pages serving the repo root.
- **Stat model is Champions "SP"**: one integer 0–32 per stat, level fixed at 50.
  HP = `base + sp + 75`; other stats = `floor((base + sp + 20) × nature)`. Do NOT add EV/IV inputs.
- **`public/*.json` is generated.** Never hand-edit; fix sync scripts / parsers and regenerate.
- **`src/engine/` must stay pure**: no DOM, no `fetch`, no globals — plain functions in/out.
  Everything in `src/engine/` must be unit-testable in Node.
- Named exports, immutable transforms, no frameworks.

## Data reality (verified 2026-07)

The Limitless standings API (`/api/tournaments/<id>/standings`) provides per-Pokémon sets with:
`id`, `name`, `item`, `ability`, `attacks[4]`, `nature`, `tera`. It does **not** provide SP
spreads. Consequences:

- The current sync parser (`src/limitless-data.js` → `countPokemonSet`) already captures
  ability/item/moves/nature but **drops `tera`** — fixed in task P1-05.
- The builder utility (Phase 5) approximates opponent spreads with **SP presets**
  (max 32 / neutral 0 / plus-nature / minus-nature) weighted by observed **nature usage**,
  which we do have. This is documented in P5-01; do not invent spread data.

## Competitive landscape (PokéOmni, verified 2026-07-09)

[pokeomni.com](https://pokeomni.com/) launched 2026-07-07: same niche (Champions doubles), same
primary data source (LimitlessTCG, 4-week window, weekly refresh). React/Vite SPA on Vercel with
Firebase-synced teams; dex data is PokeAPI-shaped and baked into the bundle at build time.

**They beat us on data breadth**: per-Pokémon **win rate**, **common-teammates %**, and **team
archetypes** (count/share/winrate + per-member sets, ~25k team samples/season), all derived from
the same standings endpoint we already sync. **We beat them on calculator depth** (their calc has
no screens, Friend Guard, status, spread modifier, or KO %) and on **spread data** (Smogon ladder
SP overlay — they only have natures).

Takeaways, in priority order:

1. **Win rate + teammate co-occurrence + archetype clustering** in `src/data/limitless-data.js` —
   cheap extension of the standings parse we already do; feeds P5-01 threat data directly.
2. **Freshness + sample-size labels** wherever usage data is shown
   (`LimitlessTCG · M-B · <date> · n samples`) — applies to P4-01 and the builder.
3. **Speed-tier presets** (base / neutral / max / max+nature / scarf variants) — adopt their
   preset-chip UX in P4-03 / P5-03.
4. **Season/regulation switcher** with archived stats — future consideration, not scheduled.

Non-goals from their feature set: accounts/cloud sync, battle-sim matchup grid, i18n — they
conflict with the no-dependency constraint or don't serve the calculator-first product goals.

## Target code structure

Phase 0 migrates the code to this layout. After P0-07, all paths below are canonical:

```
PokéCal/
├── index.html                  # snapshot/lookup page → src/ui/lookup-page.js
├── battle.html                 # calculator page      → src/ui/battle-page.js
├── builder.html                # builder utility      → src/ui/builder-page.js   (Phase 5)
├── src/
│   ├── engine/                 # PURE battle math — no DOM, no fetch
│   │   ├── constants.js        # LEVEL = 50, stat keys, status ids
│   │   ├── natures.js          # NATURES table + natureMultiplier/natureOptionLabel
│   │   ├── type-chart.js       # TYPE_EFFECTIVENESS + typeEffectiveness()
│   │   ├── stats.js            # calculateStat, applyStage (SP model)
│   │   ├── field.js            # createField() — weather/terrain/room/side conditions
│   │   ├── move-effects.js     # registry: moveId → {basePower, moveType, hits, fixed, ...}
│   │   ├── modifiers.js        # registries: ability/item → modifier producers
│   │   ├── damage.js           # the damage pipeline (orchestration only)
│   │   ├── ko-chance.js        # roll distribution → exact n-hit KO probabilities
│   │   ├── speed.js            # effective speed
│   │   └── battle-order.js     # priority + Trick Room
│   ├── data/                   # loading, parsing, usage
│   │   ├── data.js  catalog.js  pokemon.js  showdown-data.js
│   │   ├── limitless-data.js  usage-defaults.js
│   │   └── threats.js          # top-usage threat sets for the builder (Phase 5)
│   ├── ui/                     # DOM only — build inputs for the engine, render outputs
│   │   ├── components.js       # shared DOM factories (single STAT_LABELS source)
│   │   ├── bootstrap.js        # shared page init / catalog loading / error copy
│   │   ├── lookup-page.js  battle-page.js  battle-state.js  builder-page.js
│   └── styles.css
├── public/                     # generated catalogs (unchanged)
├── scripts/                    # sync + serve (unchanged locations)
├── test/                       # node --test suites, mirrors src/ module names
└── docs/tasks/                 # one file per work unit (this roadmap's children)
```

## Engine architecture (reference for all tasks)

### Field object (`src/engine/field.js`, task P0-03)

```js
export function createField(overrides = {}) {
  return {
    format: "doubles",            // "singles" | "doubles"
    weather: "",                  // "" | "sun" | "rain" | "sand" | "snow"
    terrain: "",                  // "" | "Electric Terrain" | "Grassy Terrain" | "Misty Terrain" | "Psychic Terrain"
    gravity: false,
    trickRoom: false,
    attackerSide: { helpingHand: false, powerSpot: false, battery: false,
                    steelySpirit: false, flowerGift: false, tailwind: false },
    defenderSide: { reflect: false, lightScreen: false, auroraVeil: false,
                    friendGuard: false, tailwind: false },
    ...overrides,
  };
}
```

`calculateDamage({ attacker, defender, move, attackerState, defenderState, field, critical })`
replaces today's ten loose parameters. `battleFormat`, `weather`, `terrain`, `gravity`,
`pledgeCombo` all fold into `field`.

### Side state (per Pokémon)

One shape, built by `src/ui/battle-state.js`, consumed everywhere:

```js
{ pokemon, nature, sp: {hp,atk,def,spa,spd,spe}, stages: {atk,def,spa,spd,spe},
  ability, item, status: "" /* "burn"|"poison"|"toxic"|"paralysis"|"sleep"|"freeze" */,
  teraType: "" /* "" = not terastallized */, currentHpFraction: 1,
  selectedMoveIds, speedMultiplier, grounded: undefined /* auto */ }
```

### Effect registries (tasks P0-04, P0-05)

All per-move / per-ability / per-item behavior is data, not `if` ladders. Handlers receive one
context object `ctx = { move, attacker, defender, attackerState, defenderState, field }`:

```js
// move-effects.js
export const MOVE_EFFECTS = {
  hex:        { basePower: (ctx) => ctx.defenderState.status ? 130 : 65 },
  gyroball:   { basePower: (ctx) => Math.min(150, Math.max(1,
                 Math.floor(25 * defSpeed(ctx) / atkSpeed(ctx)) + 1)) },
  weatherball:{ basePower: weatherBallPower, moveType: weatherBallType },
  bulletseed: { hits: [2, 5] },          // range; UI picks count, default 3 like NCP
  suckerpunch:{},                        // no special behavior
};

// modifiers.js — each producer returns {kind, value, label} or null
// kind: "power" | "attack" | "defense" | "damage" | "stab"
export const ABILITY_MODIFIERS = {
  hugepower: (ctx) => ctx.move.category === "Physical"
    ? { kind: "attack", value: 2, label: "Huge Power" } : null,
};
export const ITEM_MODIFIERS = { /* same shape */ };
```

Adding a mechanic = adding one registry entry + one test. Never add new `if (moveId === ...)`
chains to `damage.js`.

### Damage pipeline order (Gen 9, level 50 — implement exactly this order)

1. **Base power**: `MOVE_EFFECTS[id].basePower(ctx)` if present, else `move.basePower`;
   then power modifiers (move-flag abilities, -ate ×1.2, Muscle Band/Wise Glasses ×1.1,
   Helping Hand ×1.5, Battery/Power Spot ×1.3, terrain ×1.3/×0.5, charge etc.).
2. **Attack stat**: attacker stat with stages (crit ignores negative; Unaware/"ignore stages"
   moves ignore all) → ability modifiers (Huge Power, Guts, Hustle, ruin: opposing Tablets −Atk /
   Vessel −SpA ×0.75) → item modifiers (Choice Band/Specs ×1.5, Light Ball ×2).
3. **Defense stat**: defender stat with stages (crit ignores positive) → Fur Coat/Marvel Scale/
   Grass Pelt → ruin: opposing Sword −Def / Beads −SpD ×0.75 → sand ×1.5 Rock SpD, snow ×1.5 Ice Def.
4. **Base damage** = `floor(floor((2×50/5 + 2) × power × A / D) / 50) + 2`.
5. **Spread** ×0.75 (doubles + move targets multiple).
6. **Weather** ×1.5 / ×0.5 (Fire/Water in sun/rain).
7. **Crit** ×1.5.
8. **Random**: 16 rolls, ×0.85 … ×1.00.
9. **STAB** ×1.5 (Adaptability ×2). Tera: tera type = move type → ×1.5 on top of original-type
   STAB (total ×2; Adaptability tera-on-original-type ×2.25).
10. **Type effectiveness** (with Freeze-Dry, Thousand Arrows, ring-target style exceptions,
    Scrappy/immunity bypass, Tera changing the defender's type).
11. **Burn** ×0.5 physical (skip for Guts, Facade).
12. **Final modifiers**: screens ×0.5 (skip crit), Friend Guard ×0.75, Multiscale ×0.5,
    Solid Rock/Filter ×0.75, Tinted Lens ×2, Sniper crit ×1.5, Expert Belt ×1.2,
    Life Orb ×1.3, resist berries ×0.5, Tera Shell.

Each step floors intermediate results the same way the current `calculateDamage` does;
do not change existing rounding behavior without a golden test proving the new value correct.

### KO chance (`src/engine/ko-chance.js`, task P1-06)

From the 16-roll damage array, compute exact KO probability for 1–5 hits by convolving the
uniform roll distribution: `P(KO in n) = P(sum of n independent rolls ≥ remaining HP)`.
Output both the number and NCP-style text: `"43.8% chance to 2HKO"`, `"guaranteed OHKO"`.

## Phases and dependency order

| Phase | Theme | Tasks | Depends on |
|---|---|---|---|
| 0 | Restructure — no behavior change | P0-01 … P0-07 | — |
| 1 | Calculator foundations (field, status, Tera, KO %) | P1-01 … P1-07 | Phase 0 |
| 2 | Mechanics burn-down (MECHANICS_CHECKLIST.md) | P2-01 … P2-08 | Phase 1 |
| 3 | Calculator UX parity with NCP | P3-01 … P3-05 | Phase 1 (P3-02+ need P1-06) |
| 4 | Snapshot page polish | P4-01 … P4-03 | Phase 0 only |
| 5 | Builder utility (bulk/break points, speed line) | P5-01 … P5-06 | Phases 1 + 2 |

Phases 3 and 4 can proceed in parallel with Phase 2. Phase 5 must come last: its numbers are
only as correct as the engine underneath.

## Execution protocol (read before every task)

1. Open the lowest-numbered task in `docs/tasks/` whose `Status` is `TODO` and whose
   `Depends on` tasks are all `Done`.
2. Read the task file completely, then read every file it lists under **Files to read**.
3. Do only what the task says. Do not refactor neighboring code, rename unrelated things, or
   "improve" beyond scope. If the task turns out to be impossible as written, stop and set
   `Status: Blocked` with a note instead of improvising.
4. Write/extend tests for every engine change. Expected damage numbers must be verified against
   the NCP calculator (same inputs) or hand-computed with the pipeline above — say which in the
   test comment.
5. Run the task's listed test command, then the full `npm test`. All green before finishing.
6. For UI changes, run `npm start` and check both desktop and mobile widths.
7. Update the task file `Status` to `Done`, tick any `MECHANICS_CHECKLIST.md` items you
   implemented, and update README.md/AGENTS.md if paths or commands changed.
8. Commit message format: `P0-03: thread Field object through damage engine`.

## Verification strategy

- `test/golden.test.js` (created in P1-06) holds end-to-end scenarios recorded from the NCP
  calculator: full attacker/defender/field setups with exact expected min–max damage and KO text.
  Every Phase 2 task adds at least two golden cases for its mechanics.
- The builder (Phase 5) reuses the same engine functions the battle page uses — never a second
  implementation of damage math. P5-06 cross-checks builder output against battle-page output.

## Task index

Phase 0: P0-01 extract data tables · P0-02 stats module · P0-03 Field object ·
P0-04 move-effect registry · P0-05 modifier registries · P0-06 shared UI components ·
P0-07 directory move + docs.
Phase 1: P1-01 field UI · P1-02 side conditions · P1-03 status model · P1-04 current HP ·
P1-05 Tera · P1-06 KO chance · P1-07 spread targeting.
Phase 2: P2-01 multi-hit · P2-02 status-power moves · P2-03 order/speed moves ·
P2-04 HP-scaled & misc moves · P2-05 weather/terrain abilities · P2-06 type-change & offense
abilities · P2-07 defensive abilities · P2-08 ruin/paradox/remaining + checklist sweep.
Phase 3: P3-01 result line · P3-02 import/export · P3-03 saved sets · P3-04 team slots ·
P3-05 UI QA.
Phase 4: P4-01 common-build card · P4-02 type-matchup chart · P4-03 speed-tier snippet.
Phase 5: P5-01 threat data · P5-02 builder page · P5-03 speed line · P5-04 bulk points ·
P5-05 break points · P5-06 cross-check.

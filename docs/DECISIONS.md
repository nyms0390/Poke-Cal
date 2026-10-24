# PokéCal decisions

This is the single record of owner decisions about scope, mechanics, data, UI, language and workflow. Other documents describe how things work and link here for why. When a decision is made or changed, record it here in the same change.

Each entry is the decision, the date it was made (as far as the history shows), why, and where it is enforced when something enforces it. To change a decision, edit its entry and add the new date and reason rather than adding a contradicting entry. Detailed specs stay where they are: [DESIGN.md](../DESIGN.md) is the design system, [ui-quality-workflow.md](ui-quality-workflow.md) the UI verification policy, and [.translation/decisions.md](../.translation/decisions.md) the zh-TW wording record.

## Scope and product

- **Pokémon Champions doubles (VGC) only.** (2026-06-26) Usage, threats, Matchups and defaults all describe doubles; adding singles data would be a new scope decision. The calculator keeps a singles/doubles format toggle only for spread damage, defaulting to doubles. Enforced: `createField` default `format: "doubles"` (`src/engine/field.js`).
- **No old generations, Dynamax or Z-Moves.** (2026-07) The calculator targets NCP parity within the Champions format only. Recorded in [ROADMAP.md](ROADMAP.md) "Product goals".
- **No OP.GG scraping; the HOME/game battle-data feed is unofficial and risky.** (2026-10-14) Not a data source.
- **Team-coverage (type-chart) page dropped.** (by 2026-10-14) A team type chart says little about doubles.
- **Threat/duel simulator dropped.** (2026-07-27) Out of the finished roadmap scope; Matchups' one-on-one KO race is the supported analysis.
- **Accounts, cloud sync and a battle-sim matchup grid are non-goals.** (2026-07-09) They conflict with the dependency-free, static architecture.
- **Matchups is its own page, linked from Builder; Compare sets is a view of Matchups.** (2026-10-12) Compare sets sits behind an Overview | Compare sets switch under the title and intro, not in the nav. Promote it only if comparison grows beyond the KO race.
- **Nav order follows the tuning flow:** Lookup, Moves, Battle, Speed Tiers, Builder, Matchups, Teams. (2026-10-09) Enforced: `test/ui.test.js`.
- **My teams: your own teams are saved in this browser only,** up to six Pokémon each, stored as Showdown paste text (`pokecal.my-teams.v1`); copying and importing the paste moves a team between devices. (2026-10-24) Keeps the no-accounts, no-sync constraint. Enforced: `test/my-teams.test.js`.
- **Lookup Build details:** Abilities beside Smogon ladder spreads, then Items beside NCP curated sets, each with its own count, source line and empty state; no Speed tiers panel (Speed Tiers covers it). (2026-10-20)

## Architecture and constraints

- **No build step, no npm dependencies, plain ES modules with named exports and immutable transforms.** (2026-06) Dev-only tools such as `@smogon/calc` are installed with `--no-save` to regenerate fixtures and never become dependencies. Recorded in [ROADMAP.md](ROADMAP.md) "Hard constraints".
- **Stat model is Champions SP:** one integer 0–32 per stat, level 50, no EV/IV inputs. (2026-07)
- **`src/engine/` stays pure** (no DOM, `fetch` or globals), and per-move, ability and item behavior lives in registries, not `if (moveId === …)` chains. (2026-07)
- **Generated catalogs are never hand-edited;** fix the sync or parser and regenerate. (2026-07) Enforced: `test/web-catalogs.test.js`, `test/mcp-catalogs.test.js`.

## Mechanics and analysis

- **SP total over 66 is calculated with a warning, not refused.** (2026-10-04) Builder fixes spreads to 66; Speed Tiers does not enforce the total, by design. Enforced: `calculateDamage` `warnings`.
- **Calculator accuracy is recorded by the `@smogon/calc` reference suites,** not a checklist; `MECHANICS_CHECKLIST.md` was retired and its references removed on purpose. (2026-10) A mechanic is done once a reference scenario or a focused test covers it. Enforced: `test/damage-reference.test.js`, `test/speed-reference.test.js`.
- **The builder reuses the battle engine;** there is never a second damage implementation. (2026-07) Enforced: `test/builder-crosscheck.test.js`.
- **No damaging move is excluded from the KO race;** special moves are timed (charge, recharge, one-use, first-turn, delayed, self-lowering). (2026-10-08)
- **KO race shares are count-based, not usage-weighted.** (2026-10-12)
- **The turn grid's 4+/4+ corner is a single No KO cell;** do not split it (a trial was rejected). Stalemate means neither side can 3HKO. (2026-10-12)
- **Four outcomes everywhere:** You beat / Move order / Beat you / No KO, including Compare sets. (2026-10-12)
- **Opponents never assume a crit.** (2026-10-08)
- **"Beyond the usual sets" splits at 20 Limitless teams;** tabs are named "Top N" / "Beyond top N". (2026-10-08)
- **Each Mega form with its own Limitless usage gets its own Builder opponent set,** and Mega Stone holders' set details count only under the Mega form; the base species still counts the team and its teammates. (2026-10-14) Enforced: `test/limitless-data.test.js`, `test/threats.test.js`.

## Data sources and sync

- **Source labels are precise:** Limitless = Champions tournament usage; Smogon ladder stats = SP spreads; NCP = curated Champions sets; Pokémon Showdown = mechanics and catalog seed incl. the Champions mod; PokeAPI = Traditional Chinese aliases and the HOME renders in large sprite slots. (2026-10)
- **Showdown is pinned to a full commit SHA, never a branch;** usage sources are fetched live. Pin bumps arrive as the weekly "Bump Showdown pin" PR. (2026-10-04) Enforced: `test/showdown-pin.test.js`, `showdownDataBaseUrl` refusing non-SHA pins.
- **Syncs fail closed:** absolute minimums plus at most 25% shrink, otherwise nothing is written (`--allow-shrink` skips only the shrink check). (2026-10-02) Enforced: `src/data/catalog-validation.js`, `test/sync-fail-closed.test.js`.
- **Showdown `.ts` sources run only in a permission-model child process.** (2026-10-02) Enforced: `test/showdown-data.test.js`.
- **Browsers load slim Champions-only catalogs** from `public/web/`; the MCP Worker loads `public/mcp-catalogs/`. (2026-10-02)
- **Limitless lists a Mega as its base species plus the held Mega Stone;** Teams search matches a Mega form through the stone rather than dropping Megas from suggestions. (2026-10-20) Enforced: `test/team-search.test.js`.
- **Archived moves and items that don't match the catalog (player typos, non-Champions entries) keep their submitted text without an icon,** and are left as is. (2026-10-20)
- **Data syncs run on the owner's Mac;** the Claude sandbox cannot reach Limitless or sprite hosts. (2026-10-14)

## UI and design

- **[DESIGN.md](../DESIGN.md) is the design system** and [ui-quality-workflow.md](ui-quality-workflow.md) the verification policy; generic upstream guidance does not override teal identity, semantic and type colors, the system font, precise source labels or the dependency-free architecture. (2026-09-26)
- **Text sizes come from `--type-*` role tokens;** a nested heading uses the next role down. (2026-10-14) Enforced: `test/ui.test.js`, `npm run lint:design`.
- **Design lint with a shrink-only baseline:** new violations fail, and baseline entries that no longer match fail too; fix the baseline down, never add to it. (2026-10-21) Enforced: `scripts/lint-design.mjs`, `scripts/design-lint-baseline.json`, `test/design-lint.test.js` (run by `npm test`).
- **Shared workspace and set sheets:** Lookup, Moves, Builder, Matchups, Speed and Teams use the Matchups sidebar layout; set editors move into bottom sheets at 720px and below, Battle and Compare open editors in dialogs. (2026-10-08)
- **Set previews:** Battle set cards use the in-game summary layout (facts on the left, four typed move rows on the right); Teams, Lookup's NCP sets and the Matchups opponent set use the shared one-row `setRow`. (2026-10-20)
- **Moves on Teams use Battle's set-card move chip** (`moveChip`), not the damage-table rows, with no category icon. (2026-10-20)
- **My teams is the second view of Teams** (Tournament teams | My teams switch; Teams stays current in the nav). Battle shows a team strip above the set cards: a tap loads that member into the chosen side, replacing that side's Pokémon without asking, and saving a side puts its set over the team member of the same species or into a free place. Tournament teams can be saved to My teams without a spread, Mega Stone holders as the Mega form. Matchups' set editor has "From my team". (2026-10-24) Enforced: `test/ui.test.js`.
- **Large sprite slots use PokeAPI HOME renders** with the Showdown sprites as fallback. (2026-10-10) Enforced: `test/pokemon-art.test.js`.

## Language

- **English and Traditional Chinese (zh-TW).** zh-TW wording decisions (set = 配置, Speed presets, Rotom names, proper nouns keep catalog names) live in [.translation/decisions.md](../.translation/decisions.md); record new ones there, not here. (2026-10-12)
- **Mechanics descriptions without a translation stay English and are marked `lang="en"`.** (2026-09) This is intentional source content, not a translation gap.

## Workflow

- **Claude commits only when asked and never pushes;** the owner reviews, rebases and pushes. (2026-10)
- **Claude records any new or changed decision in this file** as part of the task. (2026-10-21) No dated task notes (dropped 2026-10-22).
- **Project docs live in `docs/`** (this file, ROADMAP, the UI workflow, move conditions, the Battle concept reference); `AGENTS.md`, `README.md` and `DESIGN.md` stay at the root (Impeccable and other design tooling look for `DESIGN.md` there). One-off reviews and superseded design references are removed rather than kept; git history holds them. (2026-10-22)
- **Run `npm test` before claiming done; verify UI changes in en and zh-TW at phone and desktop widths.** (2026-10)

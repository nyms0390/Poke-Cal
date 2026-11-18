# Calculation model

How Builder and Matchups pick opponent sets and rank results, how calculator accuracy is checked, and which mechanics the shared engine does not model yet. Owner decisions behind these rules are in [DECISIONS.md](DECISIONS.md).

## Accuracy record

The accuracy record for the battle calculator is the `@smogon/calc` reference suite, not a separate checklist: `test/damage-reference.test.js` compares all 16 damage rolls of about 280 scenarios against `test/fixtures/damage-reference.json`, which is generated from `@smogon/calc` (Gen 9 rules, level 50, SP `s` = EV `min(252, 8s)`). The app and tests stay dependency-free; to add scenarios, run `npm install --no-save @smogon/calc@0.12.0 && node scripts/dev/generate-damage-reference.mjs` and commit the regenerated fixture. `test/speed-reference.test.js` does the same for final Speed against `test/fixtures/speed-reference.json` (`@smogon/calc` `getFinalSpeed`; regenerate with `node scripts/dev/generate-speed-reference.mjs`).

## Builder workflow and assumptions

Open `/builder.html`, choose your Pokémon and SP spread, select how many popular opponents to
analyze, and optionally add custom opponents. The Bulk tab searches for the least joint
HP/Def/SpD investment that improves survival against each family; the Break tab searches for
Atk/SpA thresholds that improve your selected moves' KO tier. Opponent cards are editable, and
the Speed tiers link carries the chosen Pokémon to `/speed.html`.

In builder and Speed-tier copy, a "threat" is a Pokémon selected by Limitless Champions usage.
PokéCal keeps Limitless's observed nature, ability, item, and move
choices (Tera usage is not kept), and Limitless has no SP spreads. Threats therefore start with
the most-used nature, ability, item, and damaging moves, with Tera inactive. Offensive checks assume 32 Atk and 32 SpA. Defensive checks
use the top Smogon ladder SP spread when available, otherwise the explicit fast-offense fallback
of 2 HP / 0 Def / 0 SpD. The four Speed presets are max +Speed, max neutral, uninvested neutral,
and minimum −Speed. These defaults are editable comparison assumptions, not submitted Limitless
team spreads.

## Builder breakpoint priority

Builder cards group a base Pokémon with all of its Mega forms into one stack. "Breakpoint
priority" ranks actual SP transitions:

- Break points sort every form/move result in the stack by current maximum-damage percentage
  (`maxPct`) and use only the first, highest-damage result. If its current result takes `H`
  hits, the required breakpoint is the least SP that guarantees `max(1, H - 1)` hits. The
  stack rank is `(H, required SP)`, so a possible OHKO → guaranteed OHKO transition ranks
  before a 2HKO → guaranteed OHKO transition, which ranks before a 3HKO → guaranteed 2HKO
  transition, and so on.
- Bulk points establish each family stack's origin tier from zero HP/Def/SpD SP, using the two
  analyzed damaging moves for every displayed form. The target is the next modeled tier
  (OHKO → 2HKO through 5HKO → not KO'd within five hits), and the required cost is the least
  one legal joint HP/Def/SpD allocation that makes every analyzed matchup reach that target
  within the 66-point total-SP budget left after Atk/SpA/Spe. Families appear in fixed
  **Possible**, **Covered**, then **Unreachable** sections and sort within each section by
  `(zero-bulk origin hit count, joint required SP)`, preserving catalog order on a tie.

Maximum damage still orders move panels. The Break points tab retains its breakpoint/default
sort toggle; the Bulk tab always uses its fixed section order and joint-coverage ranking.

## Matchups workflow and assumptions

Open `/matchups.html` (or **Check matchups →** in the builder, which carries the current set),
choose the top 50 or 100 opponents and how equal-hit races resolve. Each opponent uses its top
Limitless Champions ability and item (a Mega form holds its stone), every damaging move on at
least 5% of its Limitless sets, and its top Smogon ladder SP spread, or a max-offense preset
when the ladder has none. Each side races with the move that KOs in the fewest hits with at
least a 50% chance; fewer hits wins, and equal hits go to whoever moves first (priority, then
Speed, reversed in Trick Room). When neither side KOs within three turns, the race counts as no KO. **Auto** weights normal and Trick Room order by the share of
the opponent's submitted Limitless teams that run Trick Room. Weather and terrain abilities
apply on top of the chosen environment, and Intimidate is applied on entry. The race counts
turns, so no damaging move is left out: charge moves take two turns per use (none in Sun for
Solar Beam), recharge moves add a turn between uses, Future Sight lands two turns later, Fake
Out, First Impression, Explosion and Steel Roller count only as a first-turn KO, and conditional
moves (Last Resort, Focus Punch, Belch, …) race as if their condition holds, with a caveat. Moves
that lower the user's attacking stat (Overheat, Draco Meteor) count for at most two uses, the
second at the lowered stat; Electro Shot and Meteor Beam hit one SpA stage harder on each use. It is a one-on-one measure, not a doubles win rate.

**Beyond the usual sets** checks every Champions Pokémon, not only the top 50 or 100, split at
20 Limitless teams. Theory sets use full-investment spreads (an attacker, or a wall against the
stat your moves hit) with each ability, plausible items (Life Orb, Expert Belt, type boosters,
Sitrus, Focus Sash, resist berries, observed items) and the strongest viable moves.

- **Popular Pokémon, rare choices** (20+ teams): the set that beats you with the fewest rare
  choices (abilities, items, natures or KO moves on fewer than 5% of that Pokémon's Limitless
  sets; two at most). Popular Pokémon outside your top list whose usual set already beats you
  are listed too.
- **Rarely used Pokémon** (fewer than 20 teams, including none): each gets its harshest theory
  set. Only threats whose KO move type and category (and whether they wall you) nothing above
  already covers are listed; the rest are folded by type.

It runs one opponent at a time in the background and restarts when the set or field changes.

## Mechanics not modeled yet

The calculator, Builder, Matchups and the MCP tools share one engine, so these gaps show up in
all of them. An entry is removed when its fix lands.

These rarely matter in practice: Normal Gem, terrain seeds, Light Metal, Long Reach against
Fluffy, Poltergeist into an itemless target, and Tera Shell on neutral hits.

# Strategy workflow

Use this workflow when the answer needs option discovery, matchup coverage, or team-level reasoning instead of one calculation.

## Frame the objective

Separate counterplay into four lanes:

1. Prevent the plan before activation.
2. Reverse or remove it after activation.
3. Mitigate or stall it until it expires.
4. Exploit it with a compatible secondary mode.

Establish whether the user wants options already on a supplied team, legal additions to that team, or the whole Champions catalog. Without a team, give representative legal users and say that team fit is unfiltered.

## Build candidates from evidence

- Read move descriptions, priority, category, target, and flags in `public/moves.json`.
- Cross-reference move candidates against each Pokémon's top-level `moves` in `public/pokemon.json`; the generated catalog has already applied the Champions learnset overlay.
- Inspect `public/abilities.json` and `public/items.json` for equivalent or complementary effects.
- Use Champions usage to distinguish common plans from legal but niche ones.
- Check Mega forms when their stones appear in usage or the requested team.
- For exact timing, suppression, priority, or damage behavior, inspect `src/engine/`; if it is not modeled, consult a primary upstream mechanics source and label that boundary.

Do not equate text matching with exhaustive coverage. Strategic answers can come from speed control, targeting, positioning, damage thresholds, immunities, redirection, or a secondary mode even when no description contains the searched phrase.

## Evaluate each option

For every serious candidate, report:

- Function: what it stops, reverses, stalls, or exploits.
- Timing: when it must act and whether priority or Speed matters.
- Reliability: whether it works immediately or needs prediction/setup.
- Failure cases: immunities, protection, redirection, anti-priority, items, abilities, or survival thresholds.
- Team cost: moveslot, item, ability, board position, or structural commitment.
- Availability: legal users and whether they fit the supplied team.

## Anti–Trick Room example

Search all four lanes rather than listing Taunt and Fake Out only:

- Prevention: flinching, Taunt, Imprison plus Trick Room, sleep, a direct KO, or forced switching before Trick Room resolves.
- Reversal: use Trick Room again or another supported effect that removes it.
- Mitigation: Protect cycles, priority damage, disruption, or removing the slow attackers that benefit from it.
- Exploitation: minimum-Speed attackers, naturally slow partners, or a dedicated slow mode.

Check failure cases such as Ghost immunity to normal Fake Out, anti-flinch abilities, priority blocking, Mental Herb, Aroma Veil, Prankster interactions, redirection, and whether the setter survives the attempted KO. Verify each interaction against repo mechanics or a cited primary source before presenting it as confirmed.

## Present the answer

Lead with the smallest viable coverage package. Then use a compact table:

| Option | Function | Timing | Major failure cases | Team cost | Legal users |
| --- | --- | --- | --- | --- | --- |

End with uncovered gaps and the single missing team or battle fact that would most improve the recommendation.

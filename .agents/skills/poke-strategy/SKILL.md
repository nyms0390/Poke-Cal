---
name: poke-strategy
description: Answer competitive Pokémon Champions questions with PokéCal's local catalogs and battle engine. Use for urgent in-game questions such as "which is faster?" or "can I survive?", damage and Speed comparisons, matchup sweeps, team coverage, counterplay, move/item/ability options, and broader strategy questions such as anti–Trick Room planning. Do not use for implementing or debugging PokéCal unless the request also asks for competitive analysis.
---

# Poké Strategy

Ground answers in this repository's data and mechanics. Choose Quick mode for a turn-timer question; choose Strategy mode for research, enumeration, or team planning.

## Quick mode

Use Quick mode when the user says quick, in game, in battle, one line, or turn timer. Also use it for a bare “which is faster?” or “can I survive?” when both combatants are known from the conversation.

1. Use only the local helper. Do not browse, regenerate data, run the full test suite, or inspect unrelated files.
2. Use exact spreads, stages, field state, HP, items, abilities, and statuses from the conversation. For a generic comparison with absent details, use the helper's Champions defaults and append `Using repo defaults.`
3. Run one command. Answer `UNCERTAIN` only when the user establishes a non-default live state but omits a value required to model it, such as “boosted” without a stage or “damaged” without current HP. Name that missing fact instead of silently assuming it.
4. Put the verdict first. Return one answer line and, only when needed, one caveat line.

Compare Speed:

```sh
node .agents/skills/poke-strategy/scripts/quick.mjs speed \
  --left pelipper --right eelektrossmega \
  --left-spread 'Modest:31/0/1/5/18/11' \
  --right-spread 'Timid:2/0/0/32/0/32'
```

Required: `--left`, `--right`. Optional: side-specific `--spread`, `--speed-stage`, `--item`, `--ability`, `--status`, and `--tailwind`, plus `--weather`, `--terrain`, and `--trick-room`.

Check survival:

```sh
node .agents/skills/poke-strategy/scripts/quick.mjs survive \
  --attacker eelektrossmega --defender milotic --move thunder \
  --attacker-spread 'Quiet:32/2/0/32/0/0' \
  --defender-spread 'Calm:20/0/20/4/8/14' \
  --target-type Water --weather RainDance
```

Required: `--attacker`, `--defender`, `--move`. Optional: spreads, items, abilities, offensive and defensive stages, defender HP fraction, Tera types, target type, weather, terrain, Helping Hand, screens, Friend Guard, Gravity, format, and critical hit. Use item value `none` to clear a usage-default item.

`--target-type` models an already-established battle state, such as a target after Soak. Separately verify that the setup move can apply in the stated position.

Add `--json` only when structured output is needed for follow-on analysis.

## Strategy mode

For broad questions such as team coverage, counterplay, or “all anti–Trick Room plays,” read [references/strategy.md](references/strategy.md) and follow its workflow.

Use evidence in this order:

1. `public/*.json` for Champions legality, learnsets, descriptions, and usage.
2. `src/engine/` for implemented mechanics.
3. `src/data/` for defaults, threats, Mega handling, and breakpoint analyses.
4. Primary external sources only when the repository cannot answer the question. Identify the repository boundary and cite those sources.

Use the Quick helper for individual Speed or survival checks. For large matchup sweeps, write a temporary analysis script that imports the repository's modules rather than copying formulas.

## Answer contract

- Lead with the answer, count, or verdict.
- Separate engine-confirmed results, catalog/model results, and strategic inference.
- State format, spreads, field state, usage cutoff, and other result-changing assumptions.
- Call survival `guaranteed`, `a roll`, or `impossible`; include the damage range when relevant.
- For option lists, group by function and report timing, failure cases, team cost, and legal users.
- Never call a list exhaustive after searching move names alone. Check abilities, items, field interactions, and team-pattern answers too.

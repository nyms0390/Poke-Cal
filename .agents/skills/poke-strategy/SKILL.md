---
name: poke-strategy
description: Answer competitive Pokémon Champions questions with PokéCal's catalogs and battle engine through the pokecal-mcp tools. Use for urgent in-game questions such as "which is faster?" or "can I survive?", damage and Speed comparisons, matchup sweeps, team coverage, counterplay, move/item/ability options, and broader strategy questions such as anti–Trick Room planning. Do not use for implementing or debugging PokéCal unless the request also asks for competitive analysis.
---

# Poké Strategy

Ground answers in this repository's data and mechanics. Prefer the `pokecal-mcp` tools for supported Pokémon and move lookups, Speed comparisons, damage calculations, and survival checks. Choose Quick mode for a turn-timer question; choose Strategy mode for research, enumeration, or team planning.

## Quick mode

Use Quick mode when the user says quick, in game, in battle, one line, or turn timer. Also use it for a bare “which is faster?” or “can I survive?” when both combatants are known from the conversation.

1. Use one `pokecal-mcp` call: `compare_speed` for Speed or `check_survival` for survival. Do not browse, regenerate data, run the full test suite, or inspect unrelated files.
2. Use exact spreads, stages, field state, HP, items, abilities, and statuses from the conversation. For a generic comparison with absent details, use the tool's Champions defaults and append `Using repo defaults.`
3. Make one tool call. Answer `UNCERTAIN` only when the user establishes a non-default live state but omits a value required to model it, such as “boosted” without a stage or “damaged” without current HP. Name that missing fact instead of silently assuming it.
4. Put the verdict first. Return one answer line and, only when needed, one caveat line.

Compare Speed with `compare_speed`, passing `left` and `right` plus any known side-specific spread, Speed stage, item, ability, status, or Tailwind state. Include weather, terrain, and Trick Room when relevant.

Required arguments: `left`, `right`. Optional arguments include `leftSpread`, `rightSpread`, side-specific Speed stages, items, abilities, statuses, and Tailwind state, plus `weather`, `terrain`, and `trickRoom`.

Check survival with `check_survival`, passing `attacker`, `defender`, and `move` plus every known result-changing condition. These include spreads, items, abilities, offensive and defensive stages, defender HP fraction, Tera types, target type, weather, terrain, Helping Hand, screens, Friend Guard, Gravity, format, and critical hit. Use item value `none` to clear a usage-default item.

`targetType` models an already-established battle state, such as a target after Soak. Separately verify that the setup move can apply in the stated position.

## Strategy mode

For broad questions such as team coverage, counterplay, or “all anti–Trick Room plays,” read [references/strategy.md](references/strategy.md) and follow its workflow.

Use evidence in this order:

1. `public/*.json` for Champions legality, learnsets, descriptions, and usage.
2. `src/engine/` for implemented mechanics.
3. `src/data/` for defaults, threats, Mega handling, and breakpoint analyses.
4. Primary external sources only when the repository cannot answer the question. Identify the repository boundary and cite those sources.

Use `lookup_pokemon` and `lookup_move` for focused catalog questions, and use `compare_speed`, `calculate_damage`, or `check_survival` for individual calculations. For large matchup sweeps or exhaustive catalog analysis that the MCP tools do not expose, write a temporary analysis script that imports the repository's modules rather than copying formulas.

## Answer contract

- Lead with the answer, count, or verdict.
- Separate engine-confirmed results, catalog/model results, and strategic inference.
- State format, spreads, field state, usage cutoff, and other result-changing assumptions.
- Call survival `guaranteed`, `a roll`, or `impossible`; include the damage range when relevant.
- For option lists, group by function and report timing, failure cases, team cost, and legal users.
- Never call a list exhaustive after searching move names alone. Check abilities, items, field interactions, and team-pattern answers too.

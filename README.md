# PokéCal

A compact competitive Pokémon toolkit for quick Pokémon lookup, Showdown usage
trends, and two-Pokémon battle calculations.

## Features

- Search by English or Traditional Chinese species name.
- Browse base stats, forms, abilities, common spreads, moves, and items sourced from Pokémon Showdown.
- Review Showdown usage rates and common play-style summaries for the default Champions-style Showdown format.
- Open `battle.html` to configure two Pokémon, moves, SP, natures, stages, abilities, items, and status.
- Compare move order from priority, Speed, Tailwind, paralysis, common item/ability multipliers, and Trick Room.
- Calculate damage ranges and percentages for selected moves on both sides.

## Run

Use Node.js 20 or newer:

```sh
npm run sync-data
npm test
npm start
```

Then open <http://127.0.0.1:4173> for lookup or
<http://127.0.0.1:4173/battle.html> for the battle calculator.

## Data Sources

`sync-data` downloads Pokémon Showdown's Pokédex, learnset, ability, move, item,
text-description, and Smogon usage-stat data, plus PokeAPI's Traditional Chinese
species-name localization CSV. Pokémon Showdown remains the source of stats,
forms, abilities, learnsets, moves, items, descriptions, and usage rates; PokeAPI
only supplies search aliases.

Raw sources:

- Pokémon, learnsets, abilities, moves, items, and descriptions:
  <https://github.com/smogon/pokemon-showdown/tree/master/data>
- Monthly Showdown usage statistics:
  <https://www.smogon.com/stats/>
- Usage format currently synced:
  `gen9championsbssregma-0` from the latest `/chaos/` monthly stats folder.
- Traditional Chinese species search aliases:
  <https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv>

The generated data files are:

- `public/pokemon.json`
- `public/abilities.json`
- `public/moves.json`
- `public/items.json`
- `public/usage-stats.json`

Run `npm run sync-data` again when a future Pokémon Showdown patch updates
Pokémon, items, abilities, moves, descriptions, or Smogon usage stats.

Usage rates are informational Showdown ladder data, not official Pokémon
Champions ranked-ladder data.

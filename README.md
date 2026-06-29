# PokéCal

A compact competitive Pokémon toolkit for quick Pokémon lookup, Champions
catalog popularity, and two-Pokémon battle calculations.

## Features

- Search by English or Traditional Chinese species name.
- Browse base stats, forms, abilities, moves, and items with Pokemon Zone Champions metadata.
- Review Champions popularity counts for abilities, items, and moves.
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
and text-description data, plus PokeAPI's Traditional Chinese species-name
localization CSV. Run `sync-champions-data` after `sync-data` to overlay Pokemon
Zone Champions popularity, descriptions, and catalog metadata.

Pokémon Showdown remains a mechanics/catalog seed for stats, forms, learnsets,
and fields Pokemon Zone does not expose in the list pages. Pokemon Zone is the
source for Champions popularity counts and Champions-specific catalog metadata.
PokeAPI only supplies search aliases.

Raw sources:

- Pokémon, learnsets, abilities, moves, items, and descriptions:
  <https://github.com/smogon/pokemon-showdown/tree/master/data>
- Pokemon Zone Champions catalogs:
  <https://www.pokemon-zone.com/champions/>
- Traditional Chinese species search aliases:
  <https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/pokemon_species_names.csv>

The generated data files are:

- `public/pokemon.json`
- `public/abilities.json`
- `public/moves.json`
- `public/items.json`

Run `npm run sync-data` again when a future Pokémon Showdown patch updates
Pokémon, items, abilities, moves, or descriptions. Run
`npm run sync-champions-data` when Pokemon Zone updates Champions catalog data.
If command-line fetches are blocked, pass `--snapshot-dir` with saved list pages
named `pokemon-zone-champions-pokemon.html`, `pokemon-zone-champions-moves.html`,
`pokemon-zone-champions-items.html`, and `pokemon-zone-champions-abilities.html`.
Pokémon detail snapshots named `pokemon-zone-champions-pokemon-<slug>.html`
replace each Pokémon's move list with the Champions learnable moves from that
detail page.

# PokéCal

A focused Pokémon Champions Speed calculator.

## Features

- Search by English or Traditional Chinese species name.
- Base Speed, forms, abilities, learnsets, moves, and items sourced from Pokémon Showdown.
- Level 50 Champions SP calculation with positive, neutral, and negative natures.
- Speed stages, Tailwind, paralysis, common item/ability multipliers, and Trick Room.

## Run

Use Node.js 20 or newer:

```sh
npm run sync-data
npm test
npm start
```

Then open <http://127.0.0.1:4173>.

`sync-data` downloads Pokémon Showdown's Pokédex, learnset, ability, move, item,
and text-description data from `smogon/pokemon-showdown`, plus PokeAPI's
Traditional Chinese species-name localization CSV. Pokémon Showdown remains the
source of stats, forms, abilities, learnsets, moves, items, and descriptions;
PokeAPI only supplies search aliases.

The generated data files are:

- `public/pokemon.json`
- `public/abilities.json`
- `public/moves.json`
- `public/items.json`

Run `npm run sync-data` again when a future Pokémon Showdown patch updates
Pokémon, items, abilities, moves, or descriptions.

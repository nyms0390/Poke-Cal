# PokéCal

A focused Pokémon Champions Speed calculator.

## Features

- Search by English or Traditional Chinese species name.
- Base Speed and forms sourced from Pokémon Showdown.
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

`sync-data` downloads Pokémon Showdown's generated Pokédex and PokeAPI's
Traditional Chinese species-name localization CSV. Pokémon Showdown remains the
source of base stats and forms; PokeAPI only supplies search aliases.

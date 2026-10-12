# Translation project brief

Status: approved

## Product

- Name: PokéCal
- Summary: Static web toolkit for Pokémon Champions (VGC) players: lookup, battle damage calculator, SP builder, Speed tiers, matchups, tournament teams, move catalog.
- Audience: Competitive Pokémon players in Taiwan who read Traditional Chinese and know game terminology and community shorthand.

## Scope

- Source content: src/locales/en.js (EN_MESSAGES) and the English HTML shell copy mapped in STATIC_ZH_TW; UI term maps in src/i18n.js.
- Surfaces: Web UI labels, buttons, headings, help text, status messages, aria-labels, page titles and meta descriptions.
- Domains: Competitive Pokémon battling (damage calc, Speed, SP/EV spreads, tournament usage).
- Constraints: Keep message keys, ${placeholders} and template logic unchanged; keep the en/zh-TW key parity test passing; do not edit catalog data (public/*.json) or zh-tw-name-overrides.js.

## Authority and approvals

- Explicit requirements: Polish zh-TW UI copy. Proper nouns — Pokémon, move, ability, item names, and other official game nomenclature already sourced from the catalog — stay as they are (not re-translated).
- Approved reviewers: nyms (project owner)
- Approved external specialists: not applicable

## Outputs

- Formats: In-place edits to src/locales/zh-tw.js and src/i18n.js (UI term map only) plus test updates.
- Delivery location: Local repository working tree (uncommitted until the owner asks).
- Acceptance criteria: npm test passes; placeholders preserved; no English UI copy left in zh-TW runtime scan except protected terms and third-party data; terminology consistent with glossary.
- Runtime UI review: auto

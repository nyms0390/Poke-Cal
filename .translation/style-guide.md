# Translation style guide

Status: approved

## Voice and tone

- Voice: Concise, practical tool voice; like a knowledgeable Taiwanese VGC player.
- Formality: Neutral-casual; address the user as 你 (never 您); no marketing exaggeration.
- Audience relationship: Peer tool for competitive players; community shorthand allowed when it is standard in Taiwan (擊倒, 天梯, 極速, 滿速).

## Conventions

- Capitalization: Keep Latin brand/abbreviation casing exactly (PokéCal, Champions, Limitless, Smogon, Showdown, NCP, SP, EV, IV, HP, PP, KO).
- Punctuation: Full-width Chinese punctuation （）「」：，。；！？ inside Chinese sentences; keep · separators, arrows and ASCII / in compact data labels; headings keep the source's sentence-style period only where the English hero headline has one.
- Numbers, dates, and currency: Half-width digits with a space between digits/Latin and CJK (4 個招式, 速度 120); no space between an interpolated localized Pokémon/ability name and adjacent CJK.
- Inclusive language: Gender-neutral; refer to Pokémon as 它.

## Surface constraints

- Length limits: Buttons, tabs and chips should stay as short as or shorter than the English; prefer 2–6 characters for tab and chip labels.
- Accessibility: aria-labels must describe the control in natural Chinese; screen-reader strings must read as full phrases.
- Formatting: Preserve ${placeholders}, arrows (→ ↑ ↓ ↗), ✓, ×, and template-literal logic exactly.

# PokéCal design system

PokéCal is a frequently used competitive Pokémon analysis tool. The interface should make it quick to find Pokémon and moves, edit battle inputs, compare numerical results, identify SP targets, read Speed rankings, and inspect tournament teams.

## Product character

The visual direction is calm, precise, compact, readable, and consistent. All seven routes share the lookup page's slim brand and navigation header, white working surfaces, quiet dividers, and sparse elevation. Deep teal marks interaction; Pokémon sprites, type colors, move-category marks, and aligned battle data provide the domain character. Avoid generic dashboard styling, decorative gradients, glow, and ornamental icon tiles.

PokéCal uses the system font stack already declared in `src/styles.css`. Do not introduce proprietary or downloaded fonts. The historic Kraken reference in `docs/design-references/kraken/` is visual inspiration only; PokéCal owns the decisions in this file.

## Tokens and roles

`src/styles.css` is the implementation source of truth for tokens. Deep teal (`--accent`, `--accent-dark`, `--accent-soft`, `--accent-ring`) marks the active page, selected state, focus, primary actions, and emphasized results. It does not replace semantic colors for success, warning, danger, raised/lowered stats, Pokémon types, move categories, or Speed presets.

Use `--ink` for primary text, `--muted` for supporting text, and `--subtle` only when it still meets ordinary-text contrast. Use `--canvas`, `--surface`, `--surface-soft`, and `--surface-tint` to distinguish the page, working areas, grouped controls, and selected rows. Use a border or the documented soft shadow to establish depth; avoid piling both on decorative wrappers.

Ordinary spacing follows 4, 8, 12, 16, 24, 32, and 48px steps. Small optical adjustments are allowed where controls or table rules need them. Controls use an 8px radius, cards use 12px, and badges or compact categorical chips may be pills. Standard controls are 40px high; frequent mobile controls and navigation targets should reach about 44px while dense numeric cells may stay compact when the surrounding labeled row supplies a usable target.

## Typography and data

The system font family carries headings, labels, controls, body copy, and data. Page titles are the strongest type role; section titles, field labels, primary values, supporting text, and metadata descend clearly from them. Keep visible field labels legible. Field labels and table headers use sentence case; the small uppercase voice is reserved for compact metadata. Page names and section headings follow Matchups’ hierarchy, and source attribution is plain muted text.

Use tabular numerals for stats, percentages, counts, damage ranges, Speed values, and aligned numeric columns. Use an em dash for unavailable values and keep units such as `%`, `SP`, `EV`, and multipliers explicit. Teal may emphasize a selected or primary number; semantic state colors keep their own meanings and must also have text or another non-color cue.

## Components and interaction

Navigation uses the same PokéCal brand, wrapped links, and language control on every page. The current page has both a visible selected state and `aria-current="page"`. Lookup, Moves, Builder, Matchups, Speed, and Teams share the Matchups workspace: a 280–340px input sidebar, a quiet column divider, and results on the right. The page title and introduction sit at the top of the results column; Lookup uses its selected Pokémon identity in that role. Moves and Teams put their filters in the sidebar; Builder and Speed keep their set controls there. Battle uses a full-width paired workspace with attacker and defender summaries side by side (sprite, name and types, spread, ability, item, final Speed, and move chips marked by type), a shared field strip beneath them that lists each active condition as a chip, and damage results across the full width in two columns named by direction ("Pikachu → Blastoise"). Below 950px the two set cards stack; at phone widths each card collapses to its identity row and a one-line Speed and move count. Every page begins with a keyboard-visible skip link and has one `main` landmark target.

Search pickers use a labeled search input and a popup list. They support typing, Arrow Up/Down, Enter, Escape, Tab, Shift+Tab, pointer selection, a visible no-match state, and clear focus. Results must not be clipped by their panel. Forms use native inputs, selects, checkboxes, and radios unless the product needs behavior those controls cannot provide.

Tables remain tables for numerical comparison at wider sizes. On phones, move tables may become labeled rows while retaining the same facts. Dense two-dimensional comparisons such as the Speed axis stay in a clearly bounded scroll region. Keep corresponding labels and values aligned and prevent long names or localized copy from clipping; wrap primary content and reserve truncation for genuinely compact navigation aids whose full accessible name remains available.

Buttons with the same role share height, padding, radius, border, hover, active, disabled, and focus treatment. Inline links used as explicit next actions receive a practical hit area. Destructive controls retain the existing confirmation safeguard. Motion is optional and only communicates state; any added motion must respect reduced-motion preferences.

Pages that edit a set beside its results (Matchups, Builder, Speed Tiers) keep the editor inline on wide screens and move it into a bottom sheet at phone widths (720px and below) through `src/ui/set-sheet.js`. Battle Calculator keeps attacker, defender, and field summaries visible in its paired workspace and opens each original editor in a centered modal dialog on wide screens or a bottom sheet on phones. Each dialog has a title, a close button, and an action that returns to the results; the editor element itself moves, so its controls and state are never duplicated. Phone layouts show a pinned edit bar where useful. Speed Tiers has one sheet for its Pokémon and opponent settings. Moves and Teams keep their compact filters inline on phones. The Matchups turn grid is always visible directly below the KO race chart in its overview; choosing a cell filters the opponent list, while the chart and grid continue to describe the whole selected opponent pool.

## States and responsive behavior

Render real resting, hover, focus, selected, expanded, disabled, loading, empty, error, and success states where the component supports them. Do not invent asynchronous states. Loading and result messages that matter are exposed as polite status updates without announcing every keystroke.

The seven supported entry points are `index.html`, `moves.html`, `battle.html`, `builder.html`, `matchups.html`, `speed.html`, and `teams.html`. Whole-app checks cover English and Traditional Chinese at 390px and 1280px, then stress shared navigation and dense layouts at 320px, 768px, and 1440px. Representative routes must reflow at 200% zoom. Preserve readable labels, localize user-facing interface copy, and leave source-specific English mechanics descriptions marked with `lang="en"` where translations do not exist.

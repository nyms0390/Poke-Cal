# PokéCal UI quality workflow

Use this workflow for UI audits, cleanup, and refinement. It is the authoritative project policy for UI quality; `DESIGN.md` records the incumbent product and design decisions that the workflow preserves.

## Guidance and precedence

Use the project-local Impeccable skill in **Operate** mode as the primary craft process: refinement for cleanup, new-work for redesign. Use the project-local Vercel Web Interface Guidelines as a supplemental technical checklist. The copied skill sources adopted with this policy are:

- The vendored Impeccable skill is pinned to `pbakaus/impeccable` at `cb56ed6c19a07329a9fa0cd4e657bee040156593`.
- The vendored Vercel wrapper is pinned to `vercel-labs/agent-skills` at `063bee94c3f4df8453406c830b0a7df0f2860278`.

The Vercel wrapper fetches its supplemental rules from the living `vercel-labs/web-interface-guidelines` `main` branch. Each audit must record the fetch date and the resolved upstream commit when it can be determined. If resolution is unavailable, record the source URL and that limitation; never describe the live rule content as pinned by the wrapper revision. See `.agents/skills/VENDORED_SOURCES.md` for source and license provenance.

Read upstream guidance through PokéCal's product truth and repository constraints. Generic upstream preferences do not override `DESIGN.md`, the teal identity, semantic or Pokémon type colors, the system-font choice, the dependency-free ES-module architecture, factual source labels, or an explicit task brief. Review and record a new upstream revision before updating either vendored skill.

## Scope and product goal

Treat PokéCal as a frequently used Pokémon analysis tool. Optimize for finding Pokémon and moves, editing battle inputs, comparing results, identifying SP targets, reading Speed rankings, and exploring tournament teams. Users should recognize the current state and next useful action quickly.

A cleanup request authorizes finding and fixing demonstrated issues and repeated instances throughout the requested scope. Preserve behavior and identity. It does not authorize a new brand, framework, product feature, build step, dependency, invented data, or deletion of useful controls. Ask only when an unresolved choice would materially change behavior, identity, or scope.

## Inspect and inventory

Before editing, read `AGENTS.md`, `DESIGN.md`, this file, the target HTML and controller, `src/ui/components.js`, and `src/styles.css`. Check `git status --short` and preserve unrelated changes. `docs/design-references/kraken/DESIGN.md` is historical inspiration, not an accessibility specification or a source of required fonts and measurements.

Run the application and use the interface before judging it. For a whole-app cleanup, inspect all six routes:

| Route | Representative task | Stress cases |
|---|---|---|
| `index.html` | Search, select, and inspect a Pokémon | No match, long or localized names, missing optional usage or spread data |
| `moves.html` | Search and compare moves | Long effects, empty filters, narrow tables |
| `battle.html` | Configure both sides and compare results | Keyboard selection, long set names, numeric boundaries, condition and result updates |
| `builder.html` | Change a spread and inspect matchup targets | Large results, sorting, empty results, long opponent names |
| `speed.html` | Change Speed conditions and compare ranks | Ties, extremes, long labels, selected-Pokémon changes |
| `teams.html` | Browse tournament teams | Loading, failure recovery, long metadata, sparse records, narrow layouts |

Record route or component, viewport, locale, interaction state, symptom, impact, source, correction, and verification for each finding. Separate task-blocking, usability/accessibility, consistency/readability, and optional aesthetic findings. Mark uncertain items as hypotheses and reproduce them before editing. Fix repeated causes at shared tokens or components first.

## Refine the complete path

Keep primary inputs, active selections, and results easy to locate. Use proximity, alignment, tables, separators, and whitespace to show relationships. Add containers only for meaningful groups. Keep comparison labels and columns aligned, use tabular figures, show units and ranges, and never make unavailable data look like zero.

Preserve useful information density. Reuse semantic variables and shared components. Fix the original rule instead of stacking overrides. Keep the type hierarchy and small spacing scale documented in `DESIGN.md`. Give same-role controls consistent sizing and focus treatment, and distinguish decorative badges from interactive hit areas.

Check the states each component actually supports: resting, hover, pressed, keyboard focus, selected, expanded, disabled, loading, empty, error, and success. Prefer native controls. Search pickers must support Arrow keys, Enter, Escape, Tab, and Shift+Tab with accessible names, selection state, visible focus, and pointer behavior. Keep errors near the relevant control, explain recovery, preserve valid work, and use polite live updates without announcing every keystroke.

Keep copy concise and terminology consistent. Preserve precise attribution: Limitless is Champions tournament usage, Smogon ladder stats supply SP spreads, NCP supplies curated Champions sets, Pokémon Showdown seeds mechanics and catalogs including the Champions mod, and PokeAPI supplies Traditional Chinese aliases only. Never invent statistics, claims, testimonials, or placeholder features.

## Accessibility and responsive checks

Check ordinary text for at least 4.5:1 contrast and large text for 3:1, using the WCAG definition of large text. Check control boundaries and focus separately. Aim for roughly 44×44 CSS px on frequent touch controls; distinguish that usability target from WCAG 2.2 AA's 24×24 minimum and its spacing exceptions.

For whole-app work, inspect every route at 390px and 1280px in English and Traditional Chinese. Stress shared navigation, dense forms, and comparisons at 320px, 768px, and 1440px. Check representative routes at 200% zoom and 320 CSS px reflow. Correct overflow at its cause; keep genuinely two-dimensional comparisons inside an obvious local scroll area.

Exercise keyboard and touch interactions where available. Viewport emulation proves layout, not physical-device touch. Name the browser and whether input was emulated, synthesized, or physical, and report unavailable checks rather than claiming they passed.

## Bounded verification and handoff

Use one baseline inspection, one grouped correction pass, and one confirmation pass. If confirmation shows a concrete defect, fix it and recheck the affected scope. Do not continue adding subjective refinements once the agreed checks pass.

Run the narrow relevant tests first and the full suite when shared logic or cross-page UI changes require it. Run `git diff --check`. Inspect the complete diff including untracked files. Unit tests do not replace rendered inspection.

Capture comparable before and after evidence when practical. The handoff states what changed, routes, locales and states verified, test results, evidence location, browser and input limitations, and remaining observed concerns. Detector output is supporting evidence, not proof of usability, accessibility, or craft.

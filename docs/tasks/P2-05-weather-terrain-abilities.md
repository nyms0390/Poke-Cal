# P2-05 — Weather/terrain-setting and weather-suppressing abilities

Status: Done
Depends on: P1-01
Phase: 2 (mechanics burn-down)

## Checklist sections covered
"Weather setting" (Drizzle, Drought, Snow Warning, Sand Stream, Sand Spit, Primordial Sea) ·
"Terrain setting" (Electric/Grassy/Misty/Psychic Surge) · "Weather effect suppression"
(Cloud Nine, Air Lock) · "Electric Terrain setting and Special Attack boost" (Hadron Engine —
the terrain-setting half; its SpA boost belongs here too) · "Sun-setting Attack boost"
(Orichalcum Pulse)

## Files to read
- `src/engine/field.js`, `src/ui/battle-page.js` field panel (P1-01)

## Files to change
- `src/ui/battle-page.js` (auto-suggest), `src/engine/modifiers.js`,
  `src/engine/damage.js` (suppression), `MECHANICS_CHECKLIST.md`

## Design decision (follow exactly)
The calculator has explicit weather/terrain controls, so setter abilities do NOT silently
mutate the field. Instead: when a selected ability implies weather/terrain and the field
doesn't match, the UI sets the field control automatically **once** when the ability/Pokémon
is picked (user can still override afterward) — mirroring NCP's "Auto-Level" style
convenience. Implement as a pure helper `impliedField(ability)` in the engine
(`modifiers.js`), applied by the UI.

## Steps
1. `impliedField(abilityId)` → `{weather}` or `{terrain}` map for the ten setters
   (Primordial Sea → treat as "rain" — the engine has no harsh-rain tier; append note
   "Primordial Sea treated as Rain").
2. UI: on ability/Pokémon change, apply `impliedField` to the field panel (last writer wins;
   do not fight the user's manual choice afterward).
3. Cloud Nine / Air Lock (either side): pipeline skips ALL weather effects (step 6 multipliers,
   Weather Ball, weather-conditional powers, sand SpD boost). Implement as a field-level
   derived flag `weatherSuppressed` computed in `calculateDamage` from both abilities.
4. Orichalcum Pulse: implies sun; in sun grants Attack ×1.3333 (4915/4096) — ability modifier.
   Hadron Engine: implies electric terrain; in electric terrain SpA ×1.3333.
5. Tick checklist lines; also tick Mega Sol only if it exists in Champions data
   (`grep -i "mega sol" public/abilities.json`) — if absent, annotate the checklist line
   "not in Champions catalog" and skip.

## Acceptance criteria
- Selecting Drought Pokémon flips weather to sun; user can flip it back and it stays.
- Golden vs NCP: Orichalcum Pulse Koraidon Attack boost in sun;
  Cloud Nine nullifying rain-boosted Surf.

## Tests
```sh
npm run test:damage && npm test
```

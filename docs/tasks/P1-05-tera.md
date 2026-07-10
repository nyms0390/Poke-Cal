# P1-05 — Terastallization (engine + UI + usage data)

Status: Done
Depends on: P1-03
Phase: 1 (calculator foundations)

## Files to read
- `ROADMAP.md` — pipeline steps 9–10 (Tera STAB and type rules)
- `src/engine/damage.js` — STAB and `typeEffectiveness` call sites
- `src/engine/move-effects.js` — `UNSUPPORTED_MOVE_IDS` contains `terablast`
- `src/data/limitless-data.js` — `countPokemonSet` (drops the `tera` field today)
- `scripts/sync-limitless-champions-usage.mjs`

## Files to change
- `src/engine/damage.js`, `src/engine/move-effects.js`, `src/ui/battle-state.js`,
  `src/ui/battle-page.js`, `battle.html`, `src/data/limitless-data.js`,
  `test/limitless-data.test.js`

## Goal
Tera is absent entirely. Add: tera type per side, STAB math, defender type override,
Tera Blast, and tera usage stats from Limitless.

## Steps — engine
1. Side state `teraType` (from P0-07) drives:
   - **Defender typing**: if `defenderState.teraType`, type effectiveness uses `[teraType]`
     instead of species types.
   - **Attacker STAB** (pipeline step 9): move type == teraType == one of original types →
     ×2 (Adaptability ×2.25); move type == teraType only → ×1.5 (Adaptability ×2);
     move type == original type only (attacker tera'd to something else) → ×1.5.
2. **Tera Blast**: remove from `UNSUPPORTED_MOVE_IDS`; registry entry — if attacker tera'd:
   type = teraType, and it uses the higher of Atk/SpA (like Photon Geyser's `offensiveStat`);
   else Normal, special. Base power 80.
3. Append note `"Tera (Fire)"` when tera affects the result.

## Steps — UI
4. Per side: "Terastallize" checkbox + tera-type `<select>` (18 types), default from
   champions usage when available (see step 5), else first species type.

## Steps — data
5. `countPokemonSet` in `limitless-data.js`: also count `set.tera` into a `teras` map,
   emitted as `usage.teras` alongside abilities/items/moves/natures (same entry shape).
   Extend `mergePokemonUsage` accordingly. Run `npm run sync-champions-data` to regenerate
   `public/pokemon.json` and commit the regenerated files.

## Acceptance criteria
- Golden tests vs NCP: tera-on-own-type STAB ×2; tera to a new type (e.g. Tera Fire Rillaboom
  using Fire Punch) ×1.5; defender tera changes effectiveness; Tera Blast physical/special
  selection.
- `public/pokemon.json` entries with champions data contain `usage.teras`.
- `test/limitless-data.test.js` covers tera counting and merging.

## Tests
```sh
npm run test:damage
npm run test:data
npm test
```

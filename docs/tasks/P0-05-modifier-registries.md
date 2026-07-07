# P0-05 — Convert activeModifiers() into ability/item modifier registries

Status: TODO
Depends on: P0-04
Phase: 0 (restructure, no behavior change)

## Files to read
- `ROADMAP.md` — "Effect registries" and "Damage pipeline order"
- `src/damage.js` — `activeModifiers()` (~lines 665–743) and where its result is folded into
  the damage math (~365–382); the item/ability tables `TYPE_BOOSTING_ITEMS`, `RESIST_BERRIES`,
  `TYPE_POWER_ABILITIES`, `MOVE_FLAG_POWER_ABILITIES`
- `test/damage.test.js` — Choice Band, Life Orb, Adaptability, Technician, resist-berry tests

## Files to create
- `src/engine/modifiers.js`

## Files to change
- `src/damage.js`

## Goal
`activeModifiers()` is one 78-line flat function of stacked `if` blocks covering both abilities
and items. Split it into two data registries so Phase 2 ability work is additive.

## Steps
1. Create `src/engine/modifiers.js` exporting:
   - `ABILITY_MODIFIERS = { [abilityId]: (ctx) => modifier | modifier[] | null }`
   - `ITEM_MODIFIERS   = { [itemId]:    (ctx) => modifier | modifier[] | null }`
   - `collectModifiers(ctx)` — runs the attacker's ability + item producers and the
     **defender's** ability + item producers (resist berries, Solid Rock live on the defender),
     returns a flat array.
   Modifier shape stays `{ kind, value, label }` with
   `kind ∈ "power" | "attack" | "defense" | "damage" | "stab"` (add `"defense"` now — currently
   unused, needed by P2-07).
2. Move the generic tables (`TYPE_BOOSTING_ITEMS`, `RESIST_BERRIES`, `TYPE_POWER_ABILITIES`,
   `MOVE_FLAG_POWER_ABILITIES`) into `modifiers.js` and drive them from generic producer
   functions rather than one entry per item.
3. Replace `activeModifiers()` in `damage.js` with a call to `collectModifiers(ctx)`. The fold
   in `calculateDamage` stays where it is.
4. Keep the `notes`/`label` strings byte-identical (tests may assert on them).

## Acceptance criteria
- `damage.js` no longer defines any per-item or per-ability `if` blocks.
- Registry entries for everything currently listed as done in `MECHANICS_CHECKLIST.md`
  ("Currently implemented named effects" + items sections) — count them and verify none lost.
- All existing tests pass unedited.

## Tests
```sh
npm run test:damage
npm test
```

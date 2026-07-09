# P0-05 — Convert activeModifiers() into ability/item modifier registries

Status: Done
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

## Completion notes
- Created `src/engine/modifiers.js` exporting `ABILITY_MODIFIERS`, `ITEM_MODIFIERS`, and
  `collectModifiers(ctx)`. `collectModifiers` runs each registry once for the attacker's own
  ability/item (`attackerPerspective: true`) and once for the defender's (`false`); every
  producer explicitly gates on that flag so a coincidentally-shared id on the other side can
  never double-fire (e.g. if both sides happened to hold a Choice Band in a test).
- `TYPE_BOOSTING_ITEMS`, `RESIST_BERRIES`, `TYPE_POWER_ABILITIES`, `MOVE_FLAG_POWER_ABILITIES`
  moved into `modifiers.js` and now generate registry entries via a loop instead of one `if`
  per item/ability.
- Three checks in the old `activeModifiers()` weren't item/ability-id-keyed to begin with
  (the Plate check — any item with `.onPlate`, not one id — the weather damage modifier, and
  the Collision Course/Electro Drift super-effective boost, which is move-based, not
  ability/item-based). Kept as small generic functions in `modifiers.js` (`plateModifier`,
  `weatherModifier`, `superEffectiveMoveModifier`) run unconditionally on the attacker side,
  since none of the three handler shapes from `ROADMAP.md`'s registry contract fit them and
  they aren't part of an `if (moveId === "…")`/`if (item === "…")` ladder — they're each a
  single check, not a chain.
- `weatherDamageModifier`/`weatherModifierLabel` moved wholesale into `modifiers.js` (renamed
  `weatherDamageValue`/`weatherDamageLabel`) since they were only ever called from
  `activeModifiers()`.
- `damage.js`'s `weather`/`terrain`/`gravity` destructures were already dead after P0-04 (the
  move-effect handlers read `field` directly); removed them along with the `activeModifiers`
  call site.
- Verified against `MECHANICS_CHECKLIST.md`'s "Currently implemented named effects" + items
  sections: every ability/item listed there that lived in `activeModifiers()` (Choice Band,
  Choice Specs, Life Orb, Light Ball, Expert Belt, Muscle Band, Wise Glasses, Adaptability,
  Huge Power, Pure Power, Guts, Technician, Tinted Lens, Reckless, Tough Claws, Sharpness,
  Iron Fist, Mega Launcher, Strong Jaw, Solid Rock, Prism Armor, Dragon's Maw, Rocky Payload,
  Steelworker, Transistor, the 17 type-boosting items, the 18 resist berries) has a registry
  entry. Sniper and Shell Armor/Battle Armor were never in `activeModifiers` (they're read
  directly in `calculateDamage` for crit/effectiveCritical) and are untouched.
- `npm run test:damage` (41/41) and `npm test` (120/120) pass unedited; no expected values
  changed.

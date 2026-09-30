# Move damage conditions

Inventory checked against `public/moves.json` at base commit `db453fe2fdfeb6d7a5896781003ce598a6dc6b27` on 2026-09-29. The catalog contains **954 moves: 515 marked `champions.legal: true` and 439 marked false**. These flags describe this generated Champions catalog; a false flag does not mean the move is absent from the lookup data. This inventory concerns the damage of a selected hit at level 50. It does not simulate the probability that a move is chosen, hits, or activates a secondary effect.

The battle calculator and SP builder use the same condition descriptors in `src/ui/move-conditions.js` and pass the selected `moveOptions` to `calculateDamage`. **Auto** means the engine uses available side, field, item, and opposing-move state where possible, or the documented baseline when the required history is absent. Choosing a finite option fixes that scenario for the damage calculation; it does not claim that the scenario occurs automatically in a battle.

## Conditions selectable beside a move

Every move below is Champions-legal in this catalog. The move IDs are included so this list can be compared directly with `public/moves.json` and the registry.

| Condition | Move IDs | Choices and damage interpretation |
| --- | --- | --- |
| Hits that land | `bonerush`, `bulletseed`, `iciclespear`, `pinmissile`, `rockblast`, `scaleshot`, `tailslap`, `watershuriken` | Auto or 2–5. Each choice is a completed number of hits, not an accuracy probability. |
| Population Bomb hits that land | `populationbomb` | Auto or 1–10. The outcome can stop after a miss; selecting a count does not model the chance of that outcome. |
| Dragon Darts hits on this target | `dragondarts` | Auto or 1–2. In doubles, the two darts may target different foes or both hit one foe, depending on battle state that the two-Pokémon view does not model. |
| Triple Axel hits that land | `tripleaxel` | Auto or 1–3, with successive hit powers 20/40/60. Each additional hit has its own accuracy check; the choice describes the resulting hit count. |
| Fainted allies | `lastrespects` | Auto or 0–5: 50 + 50 per fainted ally, up to 300 BP for an ordinary six-member team. Auto uses the existing side's fainted-allies field. Repeated faint events after revival can exceed this ordinary-team range and are outside the selector. |
| Hits received during the battle | `ragefist` | Auto or 0–6: 50 + 50 per counted hit, capped at 350 BP. A counted hit need not remove HP. |
| Stockpile layers | `spitup` | Auto or 0–3. Zero layers makes the move fail; 1/2/3 layers give 100/200/300 BP. Auto retains the previous three-layer assumption. |
| Eligible party members | `beatup` | Auto or 1–6 hits. The user and each non-fainted, status-free ally contribute. **This is an estimate:** the engine uses the user's species base Attack for every hit; exact damage requires each eligible member's species and base Attack. |
| Fickle Beam outcome | `ficklebeam` | Auto, normal 80 BP, or all-out 160 BP. Auto uses the normal outcome; Showdown gives the doubled outcome a 30% chance. |
| Target already took damage this turn | `assurance` | Auto/Yes/No; Yes doubles base power. Moving later by itself does not satisfy this condition. |
| User took damage from this target this turn | `avalanche` | Auto/Yes/No; Yes doubles base power. The trigger requires damage from the target, not merely that the target moved first. |
| User's stats were lowered this turn | `lashout` | Auto/Yes/No; Yes doubles base power. Current stat stages alone cannot establish when the drop happened. |
| User's previous move failed | `stompingtantrum`, `temperflare` | Auto/Yes/No; Yes doubles base power. The condition concerns the previous move result, not the current move's accuracy. |
| A prior Round occurred this turn | `round` | Auto/Yes/No; a subsequent Round doubles from 60 to 120 BP. The first Round remains at 60 BP. |
| Target is using Dig | `earthquake` | Auto/Yes/No; Yes doubles damage against that target. |
| Target is using Dive | `surf`, `whirlpool` | Auto/Yes/No; Yes doubles final hit damage against that target. Whirlpool's residual damage is outside this calculation. |
| Target has used Minimize while active | `bodyslam`, `dragonrush`, `flyingpress`, `heatcrash`, `heavyslam`, `supercellslam` | Auto/Yes/No; Yes doubles damage. Heat Crash and Heavy Slam still derive their underlying power from weight. |
| Target has a major status | `hex`, `infernalparade` | Auto from target status, or Yes/No; Yes doubles base power. |
| Target is poisoned or badly poisoned | `barbbarrage`, `venoshock` | Auto from target status, or Yes/No; Yes doubles base power. |
| User is burned, poisoned, badly poisoned, or paralyzed | `facade` | Auto from user status, or Yes/No; Yes doubles base power. Its physical burn penalty is ignored. |
| User has no held item | `acrobatics` | Auto from held item, or Yes/No; Yes doubles base power. |
| Target already acted | `payback` | Auto from selected opposing move order, or Yes/No; Yes doubles base power. Switching in does not count as acting. |

The shared registry also has condition handling for the catalog-inactive `revenge` (damaged by target this turn), `smellingsalts` (target paralyzed), and `wakeupslap` (target asleep). They are not among the 38 Champions-legal move rows above, but their IDs remain in the generated catalog and the same Auto/Yes/No descriptor path can present them if selected.

## Conditions derived from existing inputs

These moves do not need an additional move-row selector when their required input is already represented. Catalog-inactive IDs are labeled **inactive** here; the rest are Champions-legal unless stated otherwise.

| Existing input or metadata | Move IDs and result |
| --- | --- |
| User current HP | `eruption`, `waterspout`; `dragonenergy` **inactive**: power falls with user HP. `flail`, `reversal`: power rises at low user HP. `finalgambit`: fixed damage equals user current HP. |
| Target current HP | `hardpress`: power scales with current HP; `brine` **inactive**: doubles at half HP or less; `crushgrip`, `wringout` **inactive**: power scales with target HP. `superfang`; `naturesmadness`, `ruination` **inactive**: fixed damage based on target current HP. `endeavor`: fixed damage from the difference between target and user current HP. |
| Stat stages | `storedpower`, `powertrip`: positive user stages raise power; `punishment` **inactive**: positive target stages raise power. Body Press and Foul Play use their designated offensive stats without extra history choices. |
| Speed, priority, and Trick Room | `gyroball`, `electroball`: power follows calculated Speed. `payback` has the move-order selector above. `boltbeak`, `fishiousrend` **inactive** double when the target has yet to act; Showdown also doubles them against a newly switched-in target, which should be accounted for when that side condition is available. |
| Species weight and weight-modifying ability | `grassknot`, `lowkick`: target weight sets power. `heatcrash`, `heavyslam`: user/target weight ratio sets power before any Minimize condition. Missing catalog weights prevent an exact value. |
| User or target status | `hex`, `infernalparade`, `barbbarrage`, `venoshock`, `facade` also have the per-move override above; `smellingsalts`, `wakeupslap` **inactive** are derived from paralysis/sleep. Other status-dependent modifiers, including burn's Attack effect, use the side status control. |
| Held items | `acrobatics`, `knockoff`, `fling`; `naturalgift` **inactive**. Fling and Natural Gift require their item metadata. Knock Off also depends on whether the target's item can be removed. |
| Weather, terrain, grounding, and Gravity | `weatherball`, `terrainpulse`, `expandingforce`, `risingvoltage`, `gravapple`, `solarbeam`, `solarblade`, `mistyexplosion`; `psyblade` **inactive**. Misty Explosion gains 1.5× power only when the user is grounded on Misty Terrain. The field controls and user/target types, ability, and item establish these conditions. |
| Battle format and target count | Spread attacks use the doubles spread reduction when multiple targets are hit; the existing single-target choice changes that calculation. Fixed two-hit catalog moves use `multihit: 2` without a hit-count choice, except Dragon Darts' target split above. |
| Selected move and user form | `ragingbull`, `revelationdance`, `judgment`, `multiattack`, `technoblast`, `terablast`; `ivycudgel`, `hiddenpower` **inactive**: type or offensive stat follows form, type, item, or move metadata. |

For fixed multi-hit moves, the catalog records `bonemerang`, `doubleironbash`, `doublekick`, `dualchop`, `geargrind`, `tachyoncutter`, `twineedle` as **inactive** two-hit moves, alongside legal `doublehit`, `dualwingbeat`, and `twinbeam`. `surgingstrikes` and `tripledive` are **inactive** fixed three-hit moves; `triplekick` is **inactive** but can end after 1–3 landed hits at rising power. These remain present in the catalog even where the Champions move picker normally filters them out.

## Catalog-inactive finite conditions still represented by baselines

These IDs are present in the 439 inactive entries and are conditional or variable, but the current battle calculation does not expose every branch as a move-row choice. They should not be counted as exact, user-selectable coverage merely because a baseline damage number appears.

| Condition family | Catalog-inactive move IDs | Current boundary |
| --- | --- | --- |
| Consecutive uses or hits | `echoedvoice`, `furycutter`, `iceball`, `rollout` | Baseline power only; number of successive uses is not tracked. |
| Previous-turn or prior-move event | `retaliate`, `fusionbolt`, `fusionflare` | Baseline power; ally faint last turn or specific previous move is not tracked. |
| Semi-invulnerable or switching target | `gust`, `twister`, `pursuit` | Baseline power. Gust/Twister require target using Bounce, Fly, or Sky Drop; Pursuit needs the target switching. |
| Random power or fixed damage outcome | `magnitude`, `present`, `psywave` | Magnitude assumes level 7 (70 BP); Present assumes its 80 BP damage branch and does not model its healing branch; Psywave assumes 50 damage at level 50. |
| Friendship, remaining PP, or combination | `return`, `frustration`, `pikapapow`, `veeveevolley`, `trumpcard`, `firepledge`, `waterpledge`, `grasspledge` | Friendship moves assume their 102 BP extreme; Trump Card assumes 5+ PP remaining (40 BP). Pledge combo power requires `field.pledgeCombo`, not a normal move-row choice. |
| Other conditional target state | `maliciousmoonsault`, `steamroller`, `stomp` | Damage doubles against a target that used Minimize; no selectable inactive-move override is documented here. |

Several catalog-inactive moves also have immediate hit behavior outside this finite-condition work: `guardianofalola` deals a fraction of current HP, `shelltrap` requires a prior physical hit, and `doomdesire` resolves later. A plain baseline damage result must not be read as a faithful simulation of these mechanics.

## Exactness limits and exclusions

- **Beat Up:** selecting 1–6 eligible members sets a hit count. Each hit's base power actually comes from that participating member's species base Attack; the current calculation reuses the user's base Attack. The displayed estimate can be wrong even with the correct count.
- **Multi-hit outcomes:** a selected hit count means that many hits land on the displayed target. The calculator does not multiply by each hit's accuracy chance or simulate retargeting, Protect, immunity of a second foe, mid-move ability/item changes, or secondary effects. Dragon Darts and Triple Axel need particular care when reading the total.
- **History outside the move row:** Glaive Rush is Champions-legal, but its post-use vulnerability doubles *incoming* damage until that Pokémon next moves. It is not represented by a Glaive Rush move-row selector. Other move-success requirements, recharge turns, recoil, drain, field changes after the hit, and later residual damage are outside this selected-hit result unless an engine rule explicitly handles them.
- **Counter and delayed moves:** `counter`, `mirrorcoat`, `metalburst`, `comeuppance` need the last attack and HP loss; `bide` needs accumulated earlier damage; `futuresight` and `doomdesire` need stored attacker state and delayed resolution. Counter, Mirror Coat, Metal Burst, Comeuppance, and Future Sight are Champions-legal; Bide and Doom Desire are catalog-inactive. A finite power dropdown alone cannot reconstruct these events.
- **One-hit KO moves:** Champions-legal `fissure`, `guillotine`, `horndrill`, and `sheercold` are not ordinary damage rolls. Their success rules cannot be expressed as base power choices.
- **Powered move families:** catalog Z-Moves, Max Moves, and G-Max Moves use a selected originating move to determine power or additional effects. The catalog's placeholder `basePower` is not an exact standalone calculation. They are marked Champions-inactive here.
- **Level-based fixed damage:** `nightshade` and `seismictoss` have `damage: "level"`; the engine evaluates them at the calculator's fixed level 50. They appear in an `UNSUPPORTED_MOVE_IDS` set, but `fixedDamageKind` is checked first, so their current result is 50 before other battle modifiers/immunity checks. This is a level-50 scope rule, not a general-level simulation.

This inventory does not list every fixed-power damaging move or every Status move. A status-only move has no immediate direct damage to configure; secondary status, stat changes, accuracy, and chance of an outcome do not themselves change the *current selected hit's* damage unless one of the conditions above feeds the damage engine.

## Source and verification record

- Catalog enumeration: local generated `public/moves.json` at the base commit above; 954 entries, 515 legal, 439 inactive. The 38 Champions-legal IDs in the first table, including legal `whirlpool`, were checked against `src/ui/move-conditions.js` in the candidate checkout on 2026-09-30.
- Primary mechanics reference: [Pokémon Showdown move definitions](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts), especially the callbacks for [Last Respects](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts#L10071-L10077), [Rage Fist](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts#L14555-L14561), [Fickle Beam](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts#L5208-L5222), [Beat Up](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts#L1145-L1163), and [Round](https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts#L15468-L15494). The [Champions move overlay](https://github.com/smogon/pokemon-showdown/blob/master/data/mods/champions/moves.ts) supplies Champions-specific data used by the catalog. These are moving upstream pages; the local generated catalog is the authoritative scope for the counts and legal flags above.
- Implementation mapping checked by reading `src/ui/move-conditions.js`, `src/engine/move-effects.js`, `src/engine/damage.js`, and both page controllers in the candidate checkout. This documentation check is not a substitute for the focused engine, UI, and full-suite tests or rendered desktop/mobile verification.

### Candidate verification

The local candidate is on `codex/move-conditions`, based on `db453fe2fdfeb6d7a5896781003ce598a6dc6b27`. All implementation and documentation changes are in this one checkout; the inventory and builder contributors did not make separate branches. The initial candidate commit is recorded below; the review follow-up commit hash belongs in the handoff.

- Initial candidate `6c62dc37dfb406a8aa92062e3570eb5836551a00`: `node --test test/damage.test.js test/battle-state.test.js test/move-conditions.test.js test/active-set.test.js test/ui.test.js`: 188 passed. `npm run test:builder`: 96 passed. `npm test`: 443 passed. `git diff --check`: clean.
- Review fix round against the initial candidate: the same focused command passed 192 tests, `npm run test:builder` passed 96, `npm test` passed 447, and `git diff --check` was clean. These ran against the updated source and tests before this documentation-only record was edited. Numeric roll fixtures check final-damage doubling for Dig, Dive, and Minimize, while history-triggered base-power doubling stays separate. The review follow-up commit hash is recorded in the handoff.
- Native in-app browser at `http://127.0.0.1:4175/battle.html`: rendered EN and zh-TW at 1280 × 800 and 390 × 844, plus zh-TW at 320 px. No horizontal overflow was observed. Basculegion Last Respects 0 versus 5 fainted allies changed the displayed range from 58–70 to 340–400; Annihilape Rage Fist 0 versus 6 from 40–48 to 274–324; Gengar Hex Auto/Yes/No changed with and without target status; Weavile Triple Axel 1/2/3 produced increasing ranges of 8–10, 24–30, and 48–59. Keyboard Home/Arrow Down/Enter changed a native condition select while it retained focus. Swapping sides kept the selected option with its Pokémon; replacing the move with ordinary Wave Crash removed the condition control and reselecting Last Respects reset it to Auto.
- Native in-app browser at `http://127.0.0.1:4175/builder.html`: rendered EN and zh-TW at 1280 × 800 and 390 × 844, plus zh-TW at 320 px. No horizontal overflow was observed. Weavile Triple Axel 3 versus 1 selected hit changed an offensive analysis row from 23.7–29.2% to 3.3–4.3% after Apply. An ordinary move row showed no condition selector. The browser checks used visible native controls and read-only DOM measurements; screenshot inspection was visual and not saved as a separate artifact.
- Review fix round targeted Chrome check at `http://127.0.0.1:4177/builder.html`: Champions-legal Toucannon with Skill Link and Bullet Seed initially had no hit selector. Choosing Keen Eye revealed Auto/2–5 before Apply; selecting 3 and applying retained 3. Returning to Skill Link hid the selector before and after Apply; changing back to Keen Eye restored 3. The native select retained focus after keyboard input. Loaded Dice is catalog-inactive and therefore not offered in the Champions builder item dropdown; its hit-range behavior and Dragon Darts exception are covered by focused engine and descriptor tests. No new viewport sweep was needed because this review round did not change layout or localization.
- The supplemental Vercel Web Interface Guidelines checklist was fetched from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md` on 2026-09-29. Its moving upstream revision was not pinned. Labels, visible focus, localized choices, native select colors, and mobile wrapping were checked against that checklist and PokéCal's own UI quality policy.

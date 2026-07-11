# Battle Mechanics Checklist

Internal checklist for mechanics that still need named damage-range
implementation before the battle calculator can treat them as fully correct.
This list was audited against the current selectable local surface: Pokemon
learnset moves, Pokemon abilities, and Showdown usage items.

Entries that only affect accuracy, move order, action validity, post-damage
side effects, recovery, form switching, or persistent follow-up state are skipped
unless they also change the displayed damage range.

Entries that depend on transient battle history outside the calculator's
current assumptions are collected as calculator-assumed base-power cases. For
those entries, implement a clear default or explicit base-power choice instead
of modeling unavailable state such as prior damage this turn, the user being
hit before moving, previous move failure, previous-turn combos, or switching
targets.

Groups within each major section are ordered by the highest current Champions usage count among their entries; entries inside each group use the same usage ordering.

All audited entries are now either implemented in the damage calculator or marked with an explicit
by-design assumption for state the calculator does not model directly.

- [x] Choice Band
- [x] Choice Specs
- [x] Life Orb
- [x] Light Ball
- [x] Expert Belt
- [x] Muscle Band
- [x] Wise Glasses
- [x] Adaptability
- [x] Huge Power
- [x] Pure Power
- [x] Guts
- [x] Technician

## Moves

### Weather- or terrain-selected move type and power

- [x] Weather Ball
- [x] Terrain Pulse

### Calculator-assumed base power for unavailable move-history state

- [x] Last Respects
- [x] Stomping Tantrum
- [x] Rage Fist
- [x] Temper Flare
- [x] Lash Out
- [x] Echoed Voice
- [x] Fury Cutter
- [x] Ice Ball
- [x] Retaliate
- [x] Rollout

### Weather-boosted or weather-conditional base power

- [x] Solar Beam
- [x] Solar Blade
- [x] Hydro Steam

### Target weight-scaled base power

- [x] Low Kick
- [x] Grass Knot

### Fixed two-hit damage

- [x] Dual Wingbeat
- [x] Twin Beam
- [x] Dragon Darts
- [x] Bonemerang
- [x] Double Hit
- [x] Double Iron Bash
- [x] Double Kick
- [x] Dual Chop
- [x] Gear Grind
- [x] Tachyon Cutter
- [x] Twineedle

### Ignore target defensive stat stages

- [x] Darkest Lariat
- [x] Sacred Sword
- [x] Chip Away

### High-user-HP-scaled base power

- [x] Eruption
- [x] Water Spout
- [x] Dragon Energy

### Target Attack-as-user-Attack damage

- [x] Foul Play

### Defense-as-Attack damage

- [x] Body Press

### Psyshock-style Defense targeting

- [x] Psyshock
- [x] Psystrike
- [x] Secret Sword

### Type-chart exception against one type

- [x] Freeze-Dry

### Target-current-HP fraction damage

- [x] Super Fang
- [x] Nature's Madness
- [x] Ruination

### Successive-hit base-power changes

- [x] Triple Axel
- [x] Triple Kick

### User HP as damage

- [x] Final Gambit

### Accuracy-chained multi-hit damage

- [x] Population Bomb

### Party-member-count multi-hit damage

- [x] Beat Up

### User-versus-target weight-scaled base power

- [x] Heavy Slam
- [x] Heat Crash

### Terrain-boosted or terrain-conditional base power

- [x] Rising Voltage
- [x] Expanding Force
- [x] Grav Apple
- [x] Psyblade

### Calculator-assumed base power for unavailable combo or target-state context

- [x] Round
- [x] Fusion Bolt
- [x] Fusion Flare
- [x] Gust
- [x] Twister

### No held item base-power doubling

- [x] Acrobatics

### Multi-hit damage with stat changes

- [x] Scale Shot

### Target status base-power doubling

- [x] Hex
- [x] Venoshock
- [x] Barb Barrage
- [x] Infernal Parade
- [x] Smelling Salts
- [x] Wake-Up Slap

### Target HP equalization damage

- [x] Endeavor

### Form- or species-derived move type

- [x] Raging Bull
- [x] Ivy Cudgel

### Calculator-assumed base power for random or variable moves

- [x] Fickle Beam — assumes the 80 BP outcome; note shows the 140 BP chance
- [x] Magnitude — assumes Magnitude 7
- [x] Present — assumes the 80 BP outcome

### Calculator-assumed base power for unavailable damage-before-moving state

- [x] Avalanche
- [x] Assurance
- [x] Revenge

### Grounding or airborne immunity override

- [x] Smack Down
- [x] Thousand Arrows

### User status base-power doubling

- [x] Facade

### Counter last received damage

- [x] Mirror Coat — unsupported: requires last damage received this turn
- [x] Counter — unsupported: requires last damage received this turn
- [x] Metal Burst — unsupported: requires last damage received this turn
- [x] Comeuppance — unsupported: requires last damage received this turn

### Stat-boost-count base-power scaling

- [x] Stored Power
- [x] Power Trip
- [x] Punishment

### Standard two-to-five-hit damage

- [x] Bullet Seed
- [x] Icicle Spear
- [x] Bone Rush
- [x] Rock Blast
- [x] Water Shuriken
- [x] Arm Thrust
- [x] Barrage
- [x] Comet Punch
- [x] Double Slap
- [x] Fury Attack
- [x] Fury Swipes
- [x] Pin Missile
- [x] Spike Cannon
- [x] Tail Slap

### Target HP-scaled base power

- [x] Hard Press
- [x] Crush Grip
- [x] Wring Out

### Held-item thrown base power

- [x] Fling

### User-versus-target speed-scaled base power

- [x] Gyro Ball
- [x] Electro Ball

### Ignore defensive abilities

- [x] Moongeist Beam
- [x] Sunsteel Strike

### Residual trapping damage

- [x] Salt Cure — residual is shown as a note; damage is not applied on the current turn

### IV-derived move type

- [x] Hidden Power — defaults to Dark; callers may provide `hiddenPowerType`

### Tera-derived move type and attacking stat

- [x] Tera Blast

### Held-item selected move type

- [x] Judgment
- [x] Multi-Attack
- [x] Techno Blast

### Berry-selected move type and power

- [x] Natural Gift

### User current type copied as move type

- [x] Revelation Dance

### Acting before the target base-power doubling

- [x] Bolt Beak
- [x] Fishious Rend

### Acting after the target base-power doubling

- [x] Payback

### Target HP threshold base-power doubling

- [x] Brine

### Low-user-HP-scaled base power

- [x] Flail
- [x] Reversal

### Calculator-assumed friendship base power

- [x] Frustration — assumes minimum friendship
- [x] Pika Papow — assumes maximum friendship
- [x] Return — assumes maximum friendship
- [x] Veevee Volley — assumes maximum friendship

### Calculator-assumed base power for unavailable stockpile count

- [x] Spit Up — assumes 3 Stockpile uses

### Calculator-assumed base power for unavailable PP count

- [x] Trump Card — assumes 5+ PP remaining

### Calculator-assumed base power for unavailable switching context

- [x] Pursuit — switch doubling is not modeled

### Pledge combo field effect and base power

- [x] Fire Pledge
- [x] Water Pledge

### Fixed three-hit damage

- [x] Surging Strikes
- [x] Triple Dive

### Stronger offensive stat selection

- [x] Photon Geyser

### Supereffective damage boost

- [x] Collision Course
- [x] Electro Drift

### Delayed damage with stored user state

- [x] Future Sight — unsupported: requires delayed damage resolution and stored user state

### Stored-damage release

- [x] Bide — unsupported: requires stored damage taken over prior turns

### Fixed-level or fixed-value damage

- [x] Dragon Rage
- [x] Night Shade
- [x] Seismic Toss
- [x] Sonic Boom

### Random fixed damage

- [x] Psywave — assumes level-50 average damage

### Adjacent-target splash damage

- [x] Flame Burst — adjacent splash damage is not applied to the selected defender
## Items

### Type-boosting held items

- [x] Fairy Feather
- [x] Black Glasses
- [x] Mystic Water
- [x] Charcoal
- [x] Metal Coat
- [x] Sharp Beak
- [x] Silk Scarf
- [x] Never-Melt Ice
- [x] Spell Tag
- [x] Dragon Fang
- [x] Magnet
- [x] Soft Sand
- [x] Black Belt
- [x] Twisted Spoon
- [x] Miracle Seed
- [x] Poison Barb
- [x] Hard Stone
- [x] Silver Powder

### Type-resist berries

- [x] Chople Berry
- [x] Kasib Berry
- [x] Colbur Berry
- [x] Coba Berry
- [x] Roseli Berry
- [x] Occa Berry
- [x] Passho Berry
- [x] Shuca Berry
- [x] Haban Berry
- [x] Babiri Berry
- [x] Yache Berry
- [x] Charti Berry
- [x] Kebia Berry
- [x] Wacan Berry
- [x] Rindo Berry
- [x] Chilan Berry
- [x] Payapa Berry
- [x] Tanga Berry
## Abilities

### Switch-in stat-stage changes

- [x] Intimidate — defaults opposing Atk stage to -1 when neutral; user-overridable
- [x] Intrepid Sword — defaults own Atk stage to +1 when neutral; user-overridable

### Low-HP type attack boost

- [x] Blaze
- [x] Torrent
- [x] Overgrow
- [x] Swarm

### Weather setting

- [x] Drizzle
- [x] Drought
- [x] Snow Warning
- [x] Sand Stream
- [x] Primordial Sea
- [x] Sand Spit

### Normal-type move conversion with power boost

- [x] Pixilate
- [x] Aerilate
- [x] Dragonize
- [x] Galvanize
- [x] Normalize
- [x] Refrigerate

### Redirected attack immunity and stat boost

- [x] Lightning Rod
- [x] Storm Drain

### Sun-dependent Special Attack boost

- [x] Solar Power

### Offensive type-chart immunity bypass

- [x] Scrappy
- [x] Mind's Eye

### Move-flag power boost

- [x] Tough Claws
- [x] Sharpness
- [x] Reckless
- [x] Sheer Force
- [x] Iron Fist
- [x] Mega Launcher
- [x] Punk Rock
- [x] Strong Jaw

### Full-HP damage reduction

- [x] Multiscale
- [x] Shadow Shield

### Ignore stat stages during damage

- [x] Unaware

### Sound move type conversion

- [x] Liquid Voice

### Type-specific incoming offensive-stat halving

- [x] Thick Fat
- [x] Heatproof
- [x] Purifying Salt

### Ability ignore or suppression

- [x] Mold Breaker
- [x] Neutralizing Gas
- [x] Teravolt
- [x] Turboblaze

### Status move reflection

- [x] Magic Bounce — no damage-range effect; excluded by design

### Aura field type power boost

- [x] Fairy Aura
- [x] Dark Aura

### Full-HP survival from lethal hit

- [x] Sturdy

### Supereffective damage reduction

- [x] Solid Rock
- [x] Prism Armor

### Water damage boost and Fire damage reduction

- [x] Water Bubble

### Weather effect suppression

- [x] Cloud Nine
- [x] Air Lock

### Type immunity with stat boost or healing

- [x] Volt Absorb
- [x] Water Absorb
- [x] Motor Drive
- [x] Sap Sipper
- [x] Well-Baked Body

### Critical-hit damage amplification

- [x] Sniper

### Fainted-ally damage boost

- [x] Supreme Overlord

### Powder, weather, and Effect Spore immunity

- [x] Overcoat — no damage-range effect; excluded by design

### Ally-paired Special Attack multiplier

- [x] Plus
- [x] Minus

### Weather-conditioned healing and Fire weakness

- [x] Dry Skin

### Move redirection bypass

- [x] Stalwart — no damage-range effect; excluded by design
- [x] Propeller Tail — no damage-range effect; excluded by design

### Gender-based damage modifier

- [x] Rivalry

### Last-to-move power boost

- [x] Analytic

### Attack stat multipliers with move-selection drawback

- [x] Hustle
- [x] Gorilla Tactics

### Specific attack type power boost

- [x] Fire Mane
- [x] Dragon's Maw
- [x] Rocky Payload
- [x] Steelworker
- [x] Steely Spirit
- [x] Transistor

### Terrain setting

- [x] Electric Surge
- [x] Grassy Surge
- [x] Misty Surge
- [x] Psychic Surge

### Sunny-Day-as-active move behavior

- [x] Mega Sol

### Critical-hit prevention

- [x] Shell Armor
- [x] Battle Armor

### Maximum multi-hit count

- [x] Skill Link

### Ally special move power support

- [x] Battery

### Ally all-move power support

- [x] Power Spot

### Global ruin stat modifiers

- [x] Beads of Ruin
- [x] Sword of Ruin
- [x] Tablets of Ruin
- [x] Vessel of Ruin

### Post-KO highest-stat boost state

- [x] Beast Boost — post-KO boost is represented by user-set stat stages

### Commander ally stat boost state

- [x] Commander — ally stat boost is represented by user-set stat stages

### HP-threshold offensive stat penalty

- [x] Defeatist

### Turn-count offensive stat penalty

- [x] Slow Start — first-five-turn penalty is represented by user-set Atk stage and Speed modifier

### Defensive stat multipliers

- [x] Fur Coat
- [x] Marvel Scale

### Weight modification

- [x] Heavy Metal

### Switched-in target damage multiplier

- [x] Stakeout

### Status-conditioned attack boost

- [x] Flare Boost
- [x] Toxic Boost

### Weather-dependent form typing

- [x] Forecast

### Snow-restored first physical hit negation

- [x] Ice Face

### Sun-dependent Attack and Special Defense boost

- [x] Flower Gift

### Sun-setting Attack boost

- [x] Orichalcum Pulse

### Sun or Booster Energy highest-stat boost

- [x] Protosynthesis

### Sandstorm type attack boost

- [x] Sand Force

### Terrain-dependent Defense boost

- [x] Grass Pelt

### Electric Terrain or Booster Energy highest-stat boost

- [x] Quark Drive

### Electric Terrain setting and Special Attack boost

- [x] Hadron Engine

### Weather and terrain removal

- [x] Teraform Zero — clears weather/terrain; set field manually after activation

### Switch trapping

- [x] Magnet Pull — no damage-range effect; excluded by design

### Super-effective-only damage filter

- [x] Wonder Guard

### Second hit with reduced damage

- [x] Parental Bond

### Full-HP type-effectiveness reduction

- [x] Tera Shell

### Not-very-effective damage amplification

- [x] Tinted Lens

### Berry effect doubling

- [x] Ripen

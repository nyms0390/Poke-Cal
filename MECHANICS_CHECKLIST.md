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

Currently implemented named effects:

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

- [ ] Final Gambit

### Accuracy-chained multi-hit damage

- [ ] Population Bomb

### Party-member-count multi-hit damage

- [ ] Beat Up

### User-versus-target weight-scaled base power

- [ ] Heavy Slam
- [ ] Heat Crash

### Terrain-boosted or terrain-conditional base power

- [x] Rising Voltage
- [x] Expanding Force
- [x] Grav Apple
- [x] Psyblade

### Calculator-assumed base power for unavailable combo or target-state context

- [ ] Round
- [ ] Fusion Bolt
- [ ] Fusion Flare
- [ ] Gust
- [ ] Twister

### No held item base-power doubling

- [ ] Acrobatics

### Multi-hit damage with stat changes

- [ ] Scale Shot

### Target status base-power doubling

- [ ] Hex
- [ ] Venoshock
- [ ] Barb Barrage
- [ ] Infernal Parade
- [ ] Smelling Salts
- [ ] Wake-Up Slap

### Target HP equalization damage

- [ ] Endeavor

### Form- or species-derived move type

- [x] Raging Bull
- [x] Ivy Cudgel

### Calculator-assumed base power for random or variable moves

- [ ] Fickle Beam
- [ ] Magnitude
- [ ] Present

### Calculator-assumed base power for unavailable damage-before-moving state

- [ ] Avalanche
- [ ] Assurance
- [ ] Revenge

### Grounding or airborne immunity override

- [ ] Smack Down
- [x] Thousand Arrows

### User status base-power doubling

- [ ] Facade

### Counter last received damage

- [ ] Mirror Coat
- [ ] Counter
- [ ] Metal Burst
- [ ] Comeuppance

### Stat-boost-count base-power scaling

- [ ] Stored Power
- [ ] Power Trip
- [ ] Punishment

### Standard two-to-five-hit damage

- [ ] Bullet Seed
- [ ] Icicle Spear
- [ ] Bone Rush
- [ ] Rock Blast
- [ ] Water Shuriken
- [ ] Arm Thrust
- [ ] Barrage
- [ ] Comet Punch
- [ ] Double Slap
- [ ] Fury Attack
- [ ] Fury Swipes
- [ ] Pin Missile
- [ ] Spike Cannon
- [ ] Tail Slap

### Target HP-scaled base power

- [ ] Hard Press
- [ ] Crush Grip
- [ ] Wring Out

### Held-item thrown base power

- [ ] Fling

### User-versus-target speed-scaled base power

- [ ] Gyro Ball
- [ ] Electro Ball

### Ignore defensive abilities

- [x] Moongeist Beam
- [x] Sunsteel Strike

### Residual trapping damage

- [ ] Salt Cure

### IV-derived move type

- [ ] Hidden Power

### Tera-derived move type and attacking stat

- [ ] Tera Blast

### Held-item selected move type

- [x] Judgment
- [x] Multi-Attack
- [x] Techno Blast

### Berry-selected move type and power

- [x] Natural Gift

### User current type copied as move type

- [x] Revelation Dance

### Acting before the target base-power doubling

- [ ] Bolt Beak
- [ ] Fishious Rend

### Acting after the target base-power doubling

- [ ] Payback

### Target HP threshold base-power doubling

- [ ] Brine

### Low-user-HP-scaled base power

- [ ] Flail
- [ ] Reversal

### Calculator-assumed friendship base power

- [ ] Frustration
- [ ] Pika Papow
- [ ] Return
- [ ] Veevee Volley

### Calculator-assumed base power for unavailable stockpile count

- [ ] Spit Up

### Calculator-assumed base power for unavailable PP count

- [ ] Trump Card

### Calculator-assumed base power for unavailable switching context

- [ ] Pursuit

### Pledge combo field effect and base power

- [x] Fire Pledge
- [x] Water Pledge

### Fixed three-hit damage

- [ ] Surging Strikes
- [ ] Triple Dive

### Stronger offensive stat selection

- [x] Photon Geyser

### Supereffective damage boost

- [x] Collision Course
- [x] Electro Drift

### Delayed damage with stored user state

- [ ] Future Sight

### Stored-damage release

- [ ] Bide

### Fixed-level or fixed-value damage

- [x] Dragon Rage
- [x] Night Shade
- [x] Seismic Toss
- [x] Sonic Boom

### Random fixed damage

- [ ] Psywave

### Adjacent-target splash damage

- [ ] Flame Burst
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

- [ ] Intimidate
- [ ] Intrepid Sword

### Low-HP type attack boost

- [ ] Blaze
- [ ] Torrent
- [ ] Overgrow
- [ ] Swarm

### Weather setting

- [ ] Drizzle
- [ ] Drought
- [ ] Snow Warning
- [ ] Sand Stream
- [ ] Primordial Sea
- [ ] Sand Spit

### Normal-type move conversion with power boost

- [ ] Pixilate
- [ ] Aerilate
- [ ] Dragonize
- [ ] Galvanize
- [ ] Normalize
- [ ] Refrigerate

### Redirected attack immunity and stat boost

- [ ] Lightning Rod
- [ ] Storm Drain

### Sun-dependent Special Attack boost

- [ ] Solar Power

### Offensive type-chart immunity bypass

- [ ] Scrappy
- [ ] Mind's Eye

### Move-flag power boost

- [x] Tough Claws
- [x] Sharpness
- [x] Reckless
- [ ] Sheer Force
- [x] Iron Fist
- [x] Mega Launcher
- [ ] Punk Rock
- [x] Strong Jaw

### Full-HP damage reduction

- [ ] Multiscale
- [ ] Shadow Shield

### Ignore stat stages during damage

- [ ] Unaware

### Sound move type conversion

- [ ] Liquid Voice

### Type-specific incoming offensive-stat halving

- [ ] Thick Fat
- [ ] Heatproof
- [ ] Purifying Salt

### Ability ignore or suppression

- [ ] Mold Breaker
- [ ] Neutralizing Gas
- [ ] Teravolt
- [ ] Turboblaze

### Status move reflection

- [ ] Magic Bounce

### Aura field type power boost

- [ ] Fairy Aura
- [ ] Dark Aura

### Full-HP survival from lethal hit

- [ ] Sturdy

### Supereffective damage reduction

- [x] Solid Rock
- [x] Prism Armor

### Water damage boost and Fire damage reduction

- [ ] Water Bubble

### Weather effect suppression

- [ ] Cloud Nine
- [ ] Air Lock

### Type immunity with stat boost or healing

- [ ] Volt Absorb
- [ ] Water Absorb
- [ ] Motor Drive
- [ ] Sap Sipper
- [ ] Well-Baked Body

### Critical-hit damage amplification

- [x] Sniper

### Fainted-ally damage boost

- [ ] Supreme Overlord

### Powder, weather, and Effect Spore immunity

- [ ] Overcoat

### Ally-paired Special Attack multiplier

- [ ] Plus
- [ ] Minus

### Weather-conditioned healing and Fire weakness

- [ ] Dry Skin

### Move redirection bypass

- [ ] Stalwart
- [ ] Propeller Tail

### Gender-based damage modifier

- [ ] Rivalry

### Last-to-move power boost

- [ ] Analytic

### Attack stat multipliers with move-selection drawback

- [ ] Hustle
- [ ] Gorilla Tactics

### Specific attack type power boost

- [ ] Fire Mane
- [x] Dragon's Maw
- [x] Rocky Payload
- [x] Steelworker
- [ ] Steely Spirit
- [x] Transistor

### Terrain setting

- [ ] Electric Surge
- [ ] Grassy Surge
- [ ] Misty Surge
- [ ] Psychic Surge

### Sunny-Day-as-active move behavior

- [ ] Mega Sol

### Critical-hit prevention

- [x] Shell Armor
- [x] Battle Armor

### Maximum multi-hit count

- [ ] Skill Link

### Ally special move power support

- [ ] Battery

### Ally all-move power support

- [ ] Power Spot

### Global ruin stat modifiers

- [ ] Beads of Ruin
- [ ] Sword of Ruin
- [ ] Tablets of Ruin
- [ ] Vessel of Ruin

### Post-KO highest-stat boost state

- [ ] Beast Boost

### Commander ally stat boost state

- [ ] Commander

### HP-threshold offensive stat penalty

- [ ] Defeatist

### Turn-count offensive stat penalty

- [ ] Slow Start

### Defensive stat multipliers

- [ ] Fur Coat
- [ ] Marvel Scale

### Weight modification

- [ ] Heavy Metal

### Switched-in target damage multiplier

- [ ] Stakeout

### Status-conditioned attack boost

- [ ] Flare Boost
- [ ] Toxic Boost

### Weather-dependent form typing

- [ ] Forecast

### Snow-restored first physical hit negation

- [ ] Ice Face

### Sun-dependent Attack and Special Defense boost

- [ ] Flower Gift

### Sun-setting Attack boost

- [ ] Orichalcum Pulse

### Sun or Booster Energy highest-stat boost

- [ ] Protosynthesis

### Sandstorm type attack boost

- [ ] Sand Force

### Terrain-dependent Defense boost

- [ ] Grass Pelt

### Electric Terrain or Booster Energy highest-stat boost

- [ ] Quark Drive

### Electric Terrain setting and Special Attack boost

- [ ] Hadron Engine

### Weather and terrain removal

- [ ] Teraform Zero

### Switch trapping

- [ ] Magnet Pull

### Super-effective-only damage filter

- [ ] Wonder Guard

### Second hit with reduced damage

- [ ] Parental Bond

### Full-HP type-effectiveness reduction

- [ ] Tera Shell

### Not-very-effective damage amplification

- [x] Tinted Lens

### Berry effect doubling

- [ ] Ripen

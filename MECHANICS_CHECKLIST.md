# Battle Mechanics Checklist

Internal checklist for mechanics that still need named damage-range
implementation before the battle calculator can treat them as fully correct.
This list was audited against the current selectable local surface: Pokemon
learnset moves, Pokemon abilities, and Showdown usage items.

Entries that only affect accuracy, move order, action validity, post-damage
side effects, recovery, form switching, or persistent follow-up state are skipped
unless they also change the displayed damage range.

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

### Fixed, HP-based, or counter damage

- [ ] Bide
- [ ] Comeuppance
- [ ] Counter
- [ ] Dragon Rage
- [ ] Endeavor
- [ ] Final Gambit
- [ ] Flame Burst
- [ ] Metal Burst
- [ ] Mirror Coat
- [ ] Nature's Madness
- [x] Night Shade
- [ ] Psywave
- [x] Ruination
- [ ] Salt Cure
- [x] Seismic Toss
- [ ] Sonic Boom
- [x] Super Fang

### Alternate attacking or defending stat rules

- [x] Body Press
- [ ] Chip Away
- [x] Darkest Lariat
- [x] Foul Play
- [ ] Photon Geyser
- [x] Psyshock
- [x] Psystrike
- [x] Sacred Sword
- [x] Secret Sword

### Conditional base power from HP, weight, speed, status, order, or history

- [ ] Acrobatics
- [ ] Assurance
- [ ] Avalanche
- [ ] Barb Barrage
- [ ] Bolt Beak
- [ ] Brine
- [ ] Crush Grip
- [ ] Dragon Energy
- [ ] Echoed Voice
- [ ] Electro Ball
- [ ] Eruption
- [ ] Facade
- [ ] Fickle Beam
- [ ] Fishious Rend
- [ ] Flail
- [ ] Fling
- [ ] Frustration
- [ ] Fury Cutter
- [ ] Fusion Bolt
- [ ] Fusion Flare
- [ ] Grass Knot
- [ ] Gust
- [ ] Gyro Ball
- [ ] Hard Press
- [ ] Heat Crash
- [ ] Heavy Slam
- [ ] Hex
- [ ] Ice Ball
- [ ] Infernal Parade
- [ ] Lash Out
- [ ] Last Respects
- [ ] Low Kick
- [ ] Magnitude
- [ ] Payback
- [ ] Pika Papow
- [ ] Power Trip
- [ ] Present
- [ ] Punishment
- [ ] Pursuit
- [ ] Rage Fist
- [ ] Retaliate
- [ ] Return
- [ ] Revenge
- [ ] Reversal
- [ ] Rollout
- [ ] Round
- [ ] Smelling Salts
- [ ] Spit Up
- [ ] Stomping Tantrum
- [ ] Stored Power
- [ ] Temper Flare
- [ ] Triple Axel
- [ ] Triple Kick
- [ ] Trump Card
- [ ] Twister
- [ ] Veevee Volley
- [ ] Venoshock
- [ ] Wake-Up Slap
- [ ] Water Spout
- [ ] Wring Out

### Multi-hit damage and hit-count rules

- [ ] Arm Thrust
- [ ] Barrage
- [ ] Beat Up
- [ ] Bone Rush
- [ ] Bonemerang
- [ ] Bullet Seed
- [ ] Comet Punch
- [ ] Double Hit
- [ ] Double Iron Bash
- [ ] Double Kick
- [ ] Double Slap
- [ ] Dragon Darts
- [ ] Dual Chop
- [ ] Dual Wingbeat
- [ ] Fury Attack
- [ ] Fury Swipes
- [ ] Gear Grind
- [ ] Icicle Spear
- [ ] Pin Missile
- [ ] Population Bomb
- [ ] Rock Blast
- [ ] Scale Shot
- [ ] Spike Cannon
- [ ] Surging Strikes
- [ ] Tachyon Cutter
- [ ] Tail Slap
- [ ] Triple Dive
- [ ] Twin Beam
- [ ] Twineedle
- [ ] Water Shuriken

### Dynamic move type, user type, or item-derived type/power

- [ ] Hidden Power
- [x] Ivy Cudgel
- [x] Judgment
- [x] Multi-Attack
- [x] Natural Gift
- [x] Raging Bull
- [x] Revelation Dance
- [x] Techno Blast
- [ ] Tera Blast
- [x] Terrain Pulse
- [x] Weather Ball

### Weather, terrain, field, or two-turn context

- [ ] Expanding Force
- [ ] Fire Pledge
- [ ] Grav Apple
- [ ] Hydro Steam
- [ ] Psyblade
- [ ] Rising Voltage
- [ ] Solar Beam
- [ ] Solar Blade
- [ ] Water Pledge

### Type chart, immunity, or ability override rules

- [ ] Collision Course
- [ ] Electro Drift
- [ ] Freeze-Dry
- [ ] Future Sight
- [ ] Moongeist Beam
- [ ] Smack Down
- [ ] Sunsteel Strike
- [ ] Thousand Arrows

## Items

### Type-boosting held items

- [x] Black Belt
- [x] Black Glasses
- [x] Charcoal
- [x] Dragon Fang
- [x] Fairy Feather
- [x] Hard Stone
- [x] Magnet
- [x] Metal Coat
- [x] Miracle Seed
- [x] Mystic Water
- [x] Never-Melt Ice
- [x] Poison Barb
- [x] Sharp Beak
- [x] Silk Scarf
- [x] Silver Powder
- [x] Soft Sand
- [x] Spell Tag
- [x] Twisted Spoon

### Type-resist berries

- [x] Babiri Berry
- [x] Charti Berry
- [x] Chilan Berry
- [x] Chople Berry
- [x] Coba Berry
- [x] Colbur Berry
- [x] Haban Berry
- [x] Kasib Berry
- [x] Kebia Berry
- [x] Occa Berry
- [x] Passho Berry
- [x] Payapa Berry
- [x] Rindo Berry
- [x] Roseli Berry
- [x] Shuca Berry
- [x] Tanga Berry
- [x] Wacan Berry
- [x] Yache Berry

## Abilities

### Weather and terrain setters, suppressors, and abusers

- [ ] Air Lock
- [ ] Cloud Nine
- [ ] Drizzle
- [ ] Drought
- [ ] Dry Skin
- [ ] Electric Surge
- [ ] Flower Gift
- [ ] Forecast
- [ ] Grass Pelt
- [ ] Grassy Surge
- [ ] Hadron Engine
- [ ] Ice Face
- [ ] Mega Sol
- [ ] Misty Surge
- [ ] Orichalcum Pulse
- [ ] Primordial Sea
- [ ] Protosynthesis
- [ ] Psychic Surge
- [ ] Quark Drive
- [ ] Sand Force
- [ ] Sand Spit
- [ ] Sand Stream
- [ ] Snow Warning
- [ ] Solar Power
- [ ] Teraform Zero

### Type-changing, type-boosting, and move-family power abilities

- [ ] Aerilate
- [ ] Blaze
- [ ] Dark Aura
- [x] Dragon's Maw
- [ ] Dragonize
- [ ] Fairy Aura
- [ ] Fire Mane
- [ ] Flare Boost
- [ ] Galvanize
- [x] Iron Fist
- [ ] Liquid Voice
- [x] Mega Launcher
- [ ] Normalize
- [ ] Overgrow
- [ ] Pixilate
- [ ] Punk Rock
- [x] Reckless
- [ ] Refrigerate
- [x] Rocky Payload
- [x] Sharpness
- [ ] Sheer Force
- [x] Steelworker
- [ ] Steely Spirit
- [x] Strong Jaw
- [ ] Swarm
- [ ] Torrent
- [x] Tough Claws
- [ ] Toxic Boost
- [x] Transistor
- [ ] Water Bubble

### Offensive and defensive stat modifiers

- [ ] Analytic
- [ ] Battery
- [ ] Beads of Ruin
- [ ] Beast Boost
- [ ] Commander
- [ ] Defeatist
- [ ] Fur Coat
- [ ] Gorilla Tactics
- [ ] Heatproof
- [ ] Heavy Metal
- [ ] Hustle
- [ ] Intimidate
- [ ] Intrepid Sword
- [ ] Marvel Scale
- [ ] Minus
- [ ] Plus
- [ ] Power Spot
- [ ] Purifying Salt
- [ ] Slow Start
- [ ] Stakeout
- [ ] Sword of Ruin
- [ ] Tablets of Ruin
- [ ] Thick Fat
- [ ] Unaware
- [ ] Vessel of Ruin

### Damage reduction, amplification, critical-hit, and survival rules

- [x] Battle Armor
- [ ] Multiscale
- [ ] Parental Bond
- [x] Prism Armor
- [ ] Shadow Shield
- [x] Shell Armor
- [x] Sniper
- [x] Solid Rock
- [ ] Sturdy
- [ ] Supreme Overlord
- [ ] Tera Shell
- [x] Tinted Lens

### Immunity, redirection, type-chart, and ability-suppression rules

- [ ] Lightning Rod
- [ ] Magic Bounce
- [ ] Magnet Pull
- [ ] Mind's Eye
- [ ] Mold Breaker
- [ ] Motor Drive
- [ ] Neutralizing Gas
- [ ] Overcoat
- [ ] Propeller Tail
- [ ] Sap Sipper
- [ ] Scrappy
- [ ] Stalwart
- [ ] Storm Drain
- [ ] Teravolt
- [ ] Turboblaze
- [ ] Volt Absorb
- [ ] Water Absorb
- [ ] Well-Baked Body
- [ ] Wonder Guard

### Hit-count rules

- [ ] Skill Link

### Review bucket: may need calculator support or explicit out-of-scope handling

- [ ] Ripen
- [ ] Rivalry

# Battle Mechanics Checklist

Internal checklist for mechanics that still need named implementation before the
battle calculator can treat them as fully correct. This list was audited against
the current selectable local surface: Pokemon learnset moves, Pokemon abilities,
and Showdown usage items.

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
- [ ] Night Shade
- [ ] Psywave
- [x] Ruination
- [ ] Salt Cure
- [ ] Seismic Toss
- [ ] Sonic Boom
- [x] Super Fang

### OHKO and miss/crash/faint side effects

- [ ] Axe Kick
- [ ] Fissure
- [ ] Guillotine
- [ ] High Jump Kick
- [ ] Horn Drill
- [ ] Jump Kick
- [ ] Mind Blown
- [ ] Misty Explosion
- [ ] Sheer Cold
- [ ] Steel Beam
- [ ] Supercell Slam

### Alternate attacking or defending stat rules

- [x] Body Press
- [ ] Chip Away
- [x] Darkest Lariat
- [ ] Foul Play
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

- [ ] Belch
- [ ] Bug Bite
- [ ] Burn Up
- [ ] Double Shock
- [ ] Hidden Power
- [ ] Incinerate
- [ ] Ivy Cudgel
- [ ] Judgment
- [ ] Multi-Attack
- [ ] Natural Gift
- [ ] Pluck
- [ ] Raging Bull
- [ ] Revelation Dance
- [ ] Techno Blast
- [ ] Tera Blast
- [ ] Terrain Pulse
- [ ] Weather Ball

### Weather, terrain, field, or two-turn context

- [ ] Bleakwind Storm
- [ ] Blizzard
- [ ] Circle Throw
- [ ] Dig
- [ ] Dive
- [ ] Dragon Tail
- [ ] Electro Shot
- [ ] Expanding Force
- [ ] Fire Pledge
- [ ] Grassy Glide
- [ ] Grav Apple
- [ ] Hurricane
- [ ] Hydro Steam
- [ ] Ice Spinner
- [ ] Psyblade
- [ ] Psychic Noise
- [ ] Rising Voltage
- [ ] Sandsear Storm
- [ ] Secret Power
- [ ] Solar Beam
- [ ] Solar Blade
- [ ] Steel Roller
- [ ] Thunder
- [ ] Water Pledge
- [ ] Wildbolt Storm

### Type chart, immunity, protection, or ability override rules

- [ ] Brick Break
- [ ] Collision Course
- [ ] Core Enforcer
- [ ] Electro Drift
- [ ] Freeze-Dry
- [ ] Future Sight
- [ ] Moongeist Beam
- [ ] Psychic Fangs
- [ ] Smack Down
- [ ] Sunsteel Strike
- [ ] Synchronoise
- [ ] Thousand Arrows

### Stat-stage or status side effects for follow-up calculation state

- [ ] Aurora Beam
- [ ] Beak Blast
- [ ] Bitter Malice
- [ ] Breaking Swipe
- [ ] Ceaseless Edge
- [ ] Chilling Water
- [ ] Dire Claw
- [ ] Dream Eater
- [ ] Lunge
- [ ] Matcha Gotcha
- [ ] Outrage
- [ ] Petal Dance
- [ ] Play Rough
- [ ] Raging Fury
- [ ] Relic Song
- [ ] Scald
- [ ] Scorching Sands
- [ ] Snore
- [ ] Sparkly Swirl
- [ ] Springtide Storm
- [ ] Steam Eruption
- [ ] Stone Axe
- [ ] Thrash
- [ ] Trop Kick
- [ ] Uproar

### Priority and move-order exceptions

- [ ] Sucker Punch
- [ ] Thunderclap
- [ ] Upper Hand

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

### Speed, priority, accuracy, survival, and recovery items

- [ ] Bright Powder
- [x] Choice Scarf
- [ ] Focus Band
- [ ] Focus Sash
- [ ] King's Rock
- [ ] Lum Berry
- [ ] Quick Claw
- [ ] Shell Bell

### Mega/form-changing stones

- [ ] Abomasite
- [ ] Absolite
- [ ] Aerodactylite
- [ ] Aggronite
- [ ] Alakazite
- [ ] Altarianite
- [ ] Ampharosite
- [ ] Audinite
- [ ] Banettite
- [ ] Beedrillite
- [ ] Blastoisinite
- [ ] Cameruptite
- [ ] Chandelurite
- [ ] Charizardite X
- [ ] Charizardite Y
- [ ] Chesnaughtite
- [ ] Chimechite
- [ ] Clefablite
- [ ] Crabominite
- [ ] Delphoxite
- [ ] Dragoninite
- [ ] Drampanite
- [ ] Emboarite
- [ ] Excadrite
- [ ] Feraligite
- [ ] Floettite
- [ ] Froslassite
- [ ] Galladite
- [ ] Garchompite
- [ ] Gardevoirite
- [ ] Gengarite
- [ ] Glalitite
- [ ] Glimmoranite
- [ ] Golurkite
- [ ] Greninjite
- [ ] Gyaradosite
- [ ] Hawluchanite
- [ ] Heracronite
- [ ] Houndoominite
- [ ] Kangaskhanite
- [ ] Lopunnite
- [ ] Lucarionite
- [ ] Manectite
- [ ] Medichamite
- [ ] Meganiumite
- [ ] Meowsticite
- [ ] Pidgeotite
- [ ] Pinsirite
- [ ] Sablenite
- [ ] Scizorite
- [ ] Scovillainite
- [ ] Sharpedonite
- [ ] Skarmorite
- [ ] Slowbronite
- [ ] Starminite
- [ ] Steelixite
- [ ] Tyranitarite
- [ ] Venusaurite
- [ ] Victreebelite

## Abilities

### Weather and terrain setters, suppressors, and abusers

- [ ] Air Lock
- [ ] Chlorophyll
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
- [ ] Sand Rush
- [ ] Sand Spit
- [ ] Sand Stream
- [ ] Slush Rush
- [ ] Snow Warning
- [ ] Solar Power
- [ ] Surge Surfer
- [ ] Swift Swim
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

### Speed, priority, and move-order abilities

- [ ] Battle Bond
- [ ] Cotton Down
- [ ] Dazzling
- [ ] Gale Wings
- [ ] Motor Drive
- [ ] Mycelium Might
- [ ] Queenly Majesty
- [ ] Quick Draw
- [ ] Quick Feet
- [ ] Speed Boost
- [ ] Stall
- [ ] Steam Engine
- [ ] Triage
- [ ] Unaware
- [ ] Unburden
- [ ] Weak Armor

### Immunity, redirection, type-chart, and ability-suppression rules

- [ ] Lightning Rod
- [ ] Magic Bounce
- [ ] Magnet Pull
- [ ] Mind's Eye
- [ ] Mold Breaker
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

### Form, copied ability, and persistent state changes

- [ ] Hunger Switch
- [ ] Stance Change

### Stat-stage or status-triggered follow-up state

- [ ] Moxie
- [ ] Serene Grace
- [ ] Skill Link
- [ ] Soul-Heart
- [ ] Stamina
- [ ] Stench

### Review bucket: may need calculator support or explicit out-of-scope handling

- [ ] Ripen
- [ ] Rivalry

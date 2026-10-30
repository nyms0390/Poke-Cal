# Battle tracker

Status: planned, nothing built. The decision is in [DECISIONS.md](DECISIONS.md) "Scope and product".

Pokémon Champions has no replays, so a match can't be reviewed after it ends. The tracker reads a recording of the game screen on the Mac, writes a turn log, shows Speed order and KO checks during play, and keeps the log for a review after the match. It plays the role Hearthstone Deck Tracker plays for Hearthstone, but it reads the video, because the game exposes no logs.

## Uses

| Use | Input | What is known about the opponent |
| --- | --- | --- |
| Tournament companion | A broadcast (YouTube VOD or stream) | Open team sheet: items, abilities, natures, moves; only SP is unknown |
| Review of your own match | A recording of your iPad or Switch | Species from team preview; items, abilities and moves only once revealed |
| Live help | The same capture, read during the match | Same as above; never in official tournaments |

## Pipeline

Everything runs on the Mac. Capture paths: iPad → AirPlay or QuickTime → Mac; Switch → HDMI capture card → Mac; a broadcast → downloaded video.

1. **Pick frames.** Keep "choose actions" screens and frames where the message text changes. Sample at least 1 frame per second; at 1 per 2 seconds, message lines were missed.
2. **Read messages.** OCR the message area and parse the fixed message templates against PokéCal's catalog names (en and zh-TW aliases). Messages carry species, moves, order, effectiveness, crits, KOs, switches, Mega Evolution and item and ability reveals.
3. **Read HP on choose screens only.** HP plates sit at fixed positions on the choose screen; during animations they move and show values mid-change. Use a digits-only OCR pass, and fuzzy-match plate names against the six known species.
4. **Read the opponent's team preview** by sprite or type-icon matching; it has no text.
5. **Write the turn log** (below).
6. **Calculate locally** with `src/engine/` through `src/data/strategy-tools.js`: Speed order on the current field, damage ranges, and which listed spreads and items fit each observed HP change.
7. **Review after the match.** Claude Code on the Mac reads the turn log as text (a few thousand tokens per match, not the frames) and writes the review. Claude reads a frame only when the reader flags it as unparsed.

Inference rules for the review:

- Test every listed Smogon spread and NCP set for the opponent, not only the top one. For Archaludon the top row is a Timid attacker at 5.8%, while bulky max-HP spreads add up to about 19%.
- State the assumed opponent spread and item, the HP reading behind each claim, and whether a roll or a crit explains it.
- Use your own exact set, and flag a saved set whose stats don't match the game's (the trial found a Politoed paste with 31 HP SP where the game showed 32).

## Trial results (2026-10-30)

| Trial | Source | Result |
| --- | --- | --- |
| Broadcast | 2027 Baltimore Regional Masters final, game 1, turns 1–3, read with Claude vision | Observed order and damage pinned Archaludon to Bold 32 HP / 32 Def, not the usage default |
| iPad ladder, zh-TW | QuickTime recording, 2360×1640, Apple Vision OCR (`VNRecognizeTextRequest`, zh-Hant + en-US) | Messages 23 of 23 exact; plate names 7 of 20 (italic font, 1–2 characters off); own HP 10 of 10 with a digits-only pass; opponent HP % 8 of 10 |

Layout of the iPad recording at 2360×1640 (x, y, w, h). The player's side is always left and bottom.

| Region | Box |
| --- | --- |
| Opponent plates (name + HP %) | 1333,47,490,153 and 1823,47,490,153 |
| Your plates (name + current/max HP) | 53,1440,490,153 and 537,1440,490,153 |
| Weather banner with turns left | 390,65,640,60 |
| Message text (1–2 lines, no box) | 150,1130,1250,320 |
| Move list | 1687,891,632,600 |

The 查看狀態 status screen shows every HP, move, PP, ability and item in one frame. Broadcasts need their own crop map because of the overlay and face-cams.

## Turn log format

The turn log is the contract between the reader and the review: the reader can change without changing the review. It is JSON Lines, one event per line, in the order the game shows them.

Every event has `type`, and, when it came from a frame, `t` (seconds into the video), `src` (`ocr`, `vision` or `manual`), `conf` (`sure`, `likely` or `unsure`) and `raw` (the text as read, before matching). Sides are `you` and `opp`; slots are `left` and `right`. Species, moves, items and abilities use English catalog names after matching.

| `type` | Fields | Notes |
| --- | --- | --- |
| `match` | `schema`, `source`, `language`, `video`, `players`, `yourTeam` (Showdown paste), `oppPreview` (species), `oppSheet` (paste, when open sheets are shown) | First line |
| `turn` | `n`, `field` (`weather`, `weatherTurns`, `terrain`, `trickRoom`, `tailwind`, `screens`), `active` (per side and slot: `species`, `mega`, `hp`, `status`) | From the choose screen; `hp` is `{cur, max}` for you and `{pct}` for the opponent |
| `move` | `side`, `slot`, `species`, `move`, `targets` | In resolution order; failed and protected moves included |
| `hp` | `side`, `slot`, `species`, `from`, `to`, `unit` (`hp` or `pct`), `cause` (`move`, `weather`, `item`, `ability`, `recoil`, …), `crit`, `effect` (`super`, `resisted`, `immune`) | Damage and healing |
| `faint` | `side`, `slot`, `species` | |
| `switch` | `side`, `slot`, `out`, `in` | |
| `mega` | `side`, `slot`, `species`, `form` | |
| `reveal` | `side`, `species`, `item` or `ability` | First time it shows |
| `stat` | `side`, `slot`, `species`, `stages` (`{atk: 1, def: 1}`) | From messages |
| `end` | `winner` | Last line |

Example, turn 2 of the iPad trial:

```json
{"type":"turn","n":2,"t":198,"src":"ocr","conf":"sure","field":{"weather":"rain","weatherTurns":4,"terrain":"psychic"},"active":{"you":{"left":{"species":"Rillaboom","hp":{"cur":207,"max":207}},"right":{"species":"Golisopod","mega":true,"hp":{"cur":175,"max":175}}},"opp":{"left":{"species":"Blastoise","hp":{"pct":100}},"right":{"species":"Indeedee","hp":{"pct":100}}}}}
{"type":"switch","t":200,"src":"ocr","conf":"sure","side":"you","slot":"left","out":"Rillaboom","in":"Politoed"}
{"type":"mega","t":203,"src":"ocr","conf":"sure","side":"opp","slot":"left","species":"Blastoise","form":"Blastoise-Mega"}
{"type":"move","t":204,"src":"ocr","conf":"sure","side":"you","slot":"right","species":"Golisopod","move":"Protect","targets":[]}
{"type":"move","t":206,"src":"ocr","conf":"sure","side":"opp","slot":"left","species":"Blastoise-Mega","move":"Water Spout","targets":["you.left","you.right"]}
{"type":"hp","t":207,"src":"ocr","conf":"sure","side":"you","slot":"left","species":"Politoed","from":197,"to":22,"unit":"hp","cause":"move","effect":"resisted"}
{"type":"hp","t":208,"src":"ocr","conf":"sure","side":"you","slot":"left","species":"Politoed","from":22,"to":71,"unit":"hp","cause":"item"}
{"type":"reveal","t":208,"src":"ocr","conf":"sure","side":"you","species":"Politoed","item":"Sitrus Berry"}
```

Golisopod's HP, the weather turns and the timestamps are illustrative; the switch, move order and HP changes are the trial's.

## Open questions

- Where the code lives: a `tracker/` folder beside `mcp/` is the default, because it needs the engine and the zh-TW catalogs.
- How the tracker shows its results during play: a PokéCal page reading the capture through `getUserMedia`, or a native Mac window. A browser page needs OCR without adding a dependency to the app.
- Sprite matching for the opponent's team preview: which sprite set and size match the game's art.

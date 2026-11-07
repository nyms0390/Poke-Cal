# Turn-log prototype (code only, no LLM)

## In this repo

Imported from the prototype folder in `~/Documents/PokéCal-review-trial/prototype/`. Recordings, frame dumps and `out*/` folders are not in git (see `.gitignore`); the videos stay in the trial folder. Paths:

- Catalogs: `lexicon.mjs` reads `public/web/*.json` from the checkout holding `tracker/` (`parse.mjs --repo <dir>` overrides).
- Trial data: `POKECAL_TRIAL_DIR` (default `~/Documents/PokéCal-review-trial`) for `run-fast.sh`'s default video; `POKECAL_IPAD_VIDEO` (default `~/Desktop/1030_2005.mov`) for `run.sh`. Paths below like `../ladder-1/` and `../floette/` mean that trial folder.
- `fixtures/`: saved fasttrack `ocr.jsonl` with the `turn-log.jsonl` the parser produced from it, for offline checks:
  - `live-1/`: the real live match (AirPlay display capture), plus `turn-log.before-fixes.jsonl`.
  - `ipad-ladder-1/`: `run-fast.sh` on the iPad recording 1030_2005.mov (scored against the built-in ladder-1 truth; `compare.md`).
  - `floette-window2/`: `run-fast.sh` on the broadcast window2.ts (scored against `truth/floette-g2.json` and `-g3.json`; `compare.md`).
  - `live-2/`: a live ladder session over the iPad cable (QuickTime movie-recording preview, `run-live.sh --window QuickTime`), two matches, both ended by a forfeit; `turn-log.before-fixes.jsonl` is what the reader wrote on the day, `notes.md` what the owner confirmed, `team.txt` the owner's team for `review.mjs --team`.

A live session can hold several matches: `parse.mjs` starts a new match after each win/lose line (a forfeit line alone only marks it), numbering them with `game`. `run-live.sh` stops after the first match ends; `--matches N` stops after N, `--matches 0` runs until Ctrl-C.

```sh
node live.mjs --replay fixtures/live-1/ocr.jsonl /tmp/replay --speed 50 --quiet
diff <(jq -c 'del(.video)' /tmp/replay/turn-log.jsonl) <(jq -c 'del(.video)' fixtures/live-1/turn-log.jsonl)
node parse.mjs fixtures/ipad-ladder-1/ocr.jsonl /tmp/ipad.jsonl && node compare.mjs /tmp/ipad.jsonl
```

## Review a match

```sh
node review.mjs fixtures/live-1/turn-log.jsonl review.md --team fixtures/live-1/team.txt   # --json review.json for the raw checks; a multi-match log gets one review per match
```

`review.mjs` replays the turn log with PokéCal's engine and, for each opposing Pokémon, tests every listed Smogon spread and NCP set × every item with at least 2% use (or the revealed item) against:

- **Move order**: two moves of the same priority, one per side, mean the first mover is faster (slower under Trick Room). Moves whose priority depends on the field or an ability (Grassy Glide, Prankster, Triage, Gale Wings) are skipped.
- **Damage it dealt**: your HP before and after, with your exact set, stat stages from the log (kept through Mega Evolution), weather, terrain and spread targets; a logged crit uses crit damage, otherwise a crit is allowed and noted.
- **Damage it took**: the % drop, ±1.5% for rounding.

The review lists the sets that fit everything, the most used sets that were ruled out, and a turn-by-turn list of the readings. `--team` is your team as a Showdown paste; without it each of your Pokémon gets a listed spread that matches the HP the game showed, and readings that depend on it are shown but not counted. HP that changes in the middle of a turn without a message (`to: null` in the log) can't be checked yet.

Takes a recorded Pokémon Champions match (zh-TW UI) and writes a JSON Lines turn log in the format from `docs/battle-tracker.md` "Turn log format" (branch `claude/project-thread-nv0w6s`). No new dependencies: it uses system `swift` (Apple Vision), Homebrew `ffmpeg`, and `node`. It only reads from the PokéCal repo (`public/web/{pokemon,moves,items,abilities}.json`).

## Run

```sh
./run.sh                      # ~/Desktop/1030_2005.mov -> out/
./run.sh other.mov /tmp/out   # another video
```

| Step | File | Time on 1030_2005.mov (8 min 11 s) |
|---|---|---|
| Frames: 2 fps JPEG q3 into `$TMPDIR/pokecal-frames-<name>`, kept for re-runs unless over 1 GB | `frames.sh` | 42 s, 983 frames, 306 MB |
| OCR: fixed crops per frame, one JSON line per frame | `ocr.swift` | 4 min 50 s |
| Parse: dedupe, templates, name matching, turn state | `parse.mjs`, `templates.mjs`, `lexicon.mjs` | 0.8 s |
| Score against `../ladder-1/turn-log.md` | `compare.mjs` | <0.1 s |

Outputs in `out/`: `ocr.jsonl` (raw OCR), `turn-log.jsonl` (the log), `turn-log.sentences.txt` (deduplicated messages with the template each one matched), `compare.md` (the score).

I used 2 fps JPEG instead of 1 fps PNG: 2 fps catches each ~2 s message 3–4 times, and JPEG keeps it at 306 MB (the 1 fps PNGs in ladder-1 are 2.0 GB).

## Fast path (no frame files)

```sh
./run-fast.sh ~/Desktop/1030_2005.mov   # iPad -> out-fast/  (extra args go to fasttrack, e.g. --fps 3; with no video it defaults to ../floette/window2.ts)
```

`fasttrack.swift` decodes the video in memory (AVAssetReader, hardware decode), samples it at 4 fps, and runs Vision only where pixels say it's needed. It writes the same JSON lines as `ocr.swift` plus `"choose": true|false`, so `parse.mjs` uses the pixel check instead of OCRing the move list. `run-fast.sh` compiles it with `swiftc -O` into `$TMPDIR/pokecal-fasttrack`, rebuilding only when the source changes; unoptimised, the pixel loops take 2 minutes.

- **Messages**: the text is drawn straight on the moving 3D scene, white or yellow (crits), so brightness doesn't work. The gate counts stroke pixels: bright pixels with a much darker one 4 px above or below, on a 64×8 grid. With too few strokes the box counts as empty and isn't read. Otherwise it is read once the grid holds for 2 samples (typing done) and differs from the grid last read, or after 1.5 s if the scene never lets it settle. The read is dated from when the grid first settled.
- **Ability/item banner**: the same stroke gate (banners have 400–700 stroke pixels; the gate skips anything under 300).
- **Choose screen**: a vertical-gradient profile of the move panel (the button outlines sit at fixed rows whatever their colour), Pearson-correlated with `choose-signature.json`. That template was learned from the 2 fps frames: `node choose-labels.mjs out/ocr.jsonl > labels.txt`, then `fasttrack --learn-choose <frames> labels.txt`. All 65 choose frames scored r ≥ 0.348 and all 918 others r ≤ 0.242; the threshold is 0.295. On choose screens it reads the 4 plates, the 4 HP boxes (digits pass) and the field banner, from the 2nd sample of each run, at most 3 times per run. Plate names are read at 2× and also at 1×, because the italic font misreads differently at each scale (愛管侍 → 愛嘗待 at 2×, 愛管待 at 1×).
- **Team preview**: grayscale thumbnail gate, only before the first choose screen.
- `parse.mjs` changes (both are no-ops for `ocr.swift` output): `isChoose` uses `f.choose` when present, and `fieldAt` prefers a field read that includes the turn counter, because the banner is still fading in on the first choose frame.

Old vs new on 1030_2005.mov, both measured on this M2 on 2026-11-01:

| | old (`run.sh`) | new (`run-fast.sh`, 4 fps) |
|---|---|---|
| frames | 40.5 s (ffmpeg, 239 s CPU) | – |
| decode + OCR | 306 s (192 s CPU) | 48–54 s across 4 runs (36 s CPU); decode alone is 27–30 s |
| parse + compare | 1.0 s | 0.3 s |
| **total** | **≈ 348 s** | **≈ 52 s** (+5 s compile when the source changes) |
| OCR calls | 6,877 (983 frames × 6 regions + 116 choose × 8 + 51 preview) | 712 (msg 272, ability 96, plates 24 × 13, preview 32) |
| peak disk | 306 MB frames + 604 KB ocr.jsonl | 137 KB ocr.jsonl + 204 KB binary |
| peak RSS | 325 MB | 341 MB |
| score (turns 1–3) | 37/37 found, 34 exact | 37/37 found, 34 exact; the full 65-event log is identical except t/raw/conf |

Sampling rate: 4 fps and 3 fps (43 s, 601 calls) keep every event (37/37, 34 exact). 2 fps drops to 36/37 (31 exact): turn 2's choose screen gets a single sample, so its plates are never read, and one faint message is missed. **3 fps is the minimum.** The default stays at 4 for margin.

Also measured:
- `--precheck` (VNRecognizeTextRequest `.fast` before each message read) is harmful: `.fast` can't read Chinese, so it drops real messages (25/37).
- `--tight-msg` (OCR only the message band, 45% of the pixels) keeps 37/37 and saves about 3–5 s. It is off by default.
- `--jobs 4/8/12` makes no difference: Vision throughput is the limit, not concurrency.

## How it works

- **OCR** (`ocr.swift`): every frame gets the message area, field banner, move list, ability/item banner, and team-preview player name. Choose screens (3 or more lines in the move list) also get the 4 plates, plus an en-US digits-only pass on the 4 HP boxes. The team-preview list is read when the player-name box has text and the move list is empty. Each crop is upscaled 2× and read in parallel.
- **Messages**: lines are joined per frame and split into sentences at ！/。. A sentence is new unless it is within edit distance 20% of (or a prefix of) one seen in the last 2.5 s. A sentence still typing out has no ！ yet, so it is skipped until complete; the most frequent full read wins.
- **Turns**: a turn starts at the first choose screen after any resolution message. The turn's plates are majority-voted across all its choose frames. Own HP is `cur/max`, with the max learned from the first full-HP read, where the slash reads as a digit (`1977197` → 197/197). Opponent % maps a leading 7 back to 1 (`700%` → 100).
- **Names**: Levenshtein matching against zh-TW aliases + English names (NFKC-normalised, so `雷丘進化石Ｙ` = `雷丘進化石Y`). Species already seen get a looser threshold (≤ 50% of the length vs 34%).
- **Board**: slots come from the choose-screen plates, then `回來` / `換下了` / `要回到…身邊` + `上吧` / `派出了` / faint replacements. Move targets come from the effect, Protect, crit and faint lines that follow the move.
- **HP**: plates only exist on choose screens, so each mon's HP is known at turn start (or on switch-in: its last known value, or 100% for a fresh opponent) and at the next choose screen (or 0 on a faint). Grassy Terrain (1/16) and Sitrus Berry (1/4) heals are inverted. A turn with one unknown hit is therefore solved exactly, e.g. Rillaboom 207 → crit → 89 → +12 → 101. With two unknown hits, only the ends get filled.

## Results (turns 1–3, the extent of the ground truth)

See `out/compare.md`. The ground truth is `ladder-1/turn-log.md` written out as 37 events inside `compare.mjs`.

| type | truth | found | exact | emitted |
|---|---|---|---|---|
| reveal | 6 | 6 | 6 | 6 |
| turn | 3 | 3 | 3 | 3 |
| switch | 6 | 6 | 6 | 6 |
| mega | 2 | 2 | 2 | 2 |
| move | 9 | 9 | 9 | 9 |
| hp | 7 | 7 | 4 | 7 |
| faint | 3 | 3 | 3 | 3 |
| stat | 1 | 1 | 1 | 1 |
| **all** | **37** | **37 (100%)** | **34** | **37 (0 false)** |

All 9 moves are in the right order, with the right slots and targets. The 3 inexact events are all Politoed's turn 2 chain, 197 → 22 (Water Spout) → 71 (Sitrus) → 0 (Expanding Force). That chain has two unknown hits, so the log has `from 197` on the first and `to 0` on the last, and nulls for 22 and 71.

The match line is right: you = nyms, opponent = DeeObaweea, all 6 own species + items from team preview (51 frames, unanimous). `oppPreview` is empty: **sprite matching for the opponent preview is not done**, as agreed.

Turns 4–5 and the end (`成功戰勝了DeeObaweea！` → `winner: you`) are also logged, but there is no ground truth for them. I checked a few by eye and they look plausible: Muddy Water hit both with crits, Life Orb recoil, and both KOs.

**Caveat:** I tuned the templates and rules on this same video, so these numbers measure fit, not generalisation. The next match is the real test.

## Failure causes and fixes

1. **Mid-turn HP is not read** (the 3 inexact events). The plates that pop up during animations move with the camera. Fix: detect the HP bar by colour (green/yellow/red bar on a dark plate) anywhere in the top/bottom bands of every frame, OCR the number next to it, and emit an `hp` event per change. Cheaper partial fix: apply known item rules (Sitrus fires at ≤ 50% and heals max/4), which narrows but doesn't solve two-hit chains.
2. **Lead send-outs are dropped.** `上吧！` sometimes OCRs as a separate faded line, and `派出了A和B` lists the leads in a different order than the slots. This is harmless here because the turn-1 plates set the board, but a log that starts mid-match would miss it. Fix: glue a lone `上吧！` across adjacent lines and frames, and assign lead slots from the first plates.
3. **Plate names are noisy** (italic font: 轟擂→壽擂/鑫擂, 水箭龜→水箭羅/盔, 愛管侍→愛管待). Majority voting plus preference for known species fixes all of them here. A brand-new opponent species seen only on a plate (never in a message) could mismatch. Fix: prefer names from messages, and accept a plate-only match only at distance ≤ 1.
4. **Own HP digits**: the slash reads as a digit, so `cur` can be ambiguous when it is a digit shorter than `max` (e.g. 20/207 reads like `201207`). It never happened here. Fix: check continuity with the previous value and the expected damage, or read the HP-bar length as a cross-check.
5. **Turn boundary depends on the move list being on screen.** It works here, but a timeout or a forced-switch-only turn has no move list. Fix: also key on the field banner's turn counter (`N/5`), which changes once per turn while weather is up, and on the command timer box.
6. **Opponent ability and item banners** weren't seen in this match (Psychic Surge was inferred from the terrain message right after Indeedee switched in). The opponent's banner position needs measuring on another video.
7. **Speed**: OCR is 0.3 s per frame. For live use, skip frames whose message crop is pixel-identical to the previous one (cheap image diff), and only read plates on the first and last choose frame of a turn.

## Not done

- Opponent team preview (sprite / type-icon matching): skipped, so `oppPreview` is `[]`.
- `oppSheet`, status conditions, Trick Room, Tailwind and screens: no messages for them in this video, so there are no templates.
- `yourTeam` lists species + items only. Moves and abilities could be filled from the choose-screen move lists and the status screen (f0336), but that isn't done.

## Source profiles (iPad zh-TW, broadcast English)

Every crop box and detector now lives in `profiles/*.json`, not in the code. `run-fast.sh`, `fasttrack` and `parse.mjs` take `--profile auto|ipad-zh|broadcast-en`. The default is `auto`, which picks the profile with the closest aspect ratio (iPad 1.439, broadcast 1.778). fasttrack writes the profile it used as the first `ocr.jsonl` line, and parse.mjs reads it from there.

- `profiles/ipad-zh.json`: the values that used to be built into the code, plus `choose-signature.json`. The iPad output is unchanged: the 65-event log is identical to `out/` apart from t/raw/conf, and the score is still 37/37 with 34 exact.
- `profiles/broadcast-en.json`: the Play! Pokémon YouTube broadcast at 720p, in English. The game feed fills the 1280×720 frame under the overlays (`feed` = the whole frame; for an inset feed, set its rectangle as fractions). It is a spectator view from one player's side: `you` = that player, and "The opposing X" = the other one.
  - **There is no move list.** Turns come from the fixed "Trainers are choosing actions" line. Its detector is `"kind": "strokes"`: a 32×4 text-stroke grid, Pearson-correlated with `profiles/broadcast-en.choose.json`. That template is learned from this video with `fasttrack --learn-choose-video <video> --profile broadcast-en`, which labels each 1 fps sample by OCRing the box and matching `labelRegex`. Result: 374 choose frames at r ≥ 0.637 and 1391 others at r ≤ 0.392, so the threshold is 0.514.
  - All 4 plates sit at fixed spots along the bottom on choose screens, and both sides show HP as %. There is no field banner. Ability and item banners appear on both sides: own at the left, opponent at the right.
  - `templates-en.mjs` holds the English templates, collected from this video's OCR. Battle text names the base species ("Floette"), but the catalog only has `Floette-Eternal`. lexicon.mjs therefore adds base-species keys for forms whose base species isn't itself a catalog entry; this has no effect on the iPad run.
  - **Game split** (`splitGames`): a game starts at a lead send-out ("X sent out A and B!") with no choose screen in the 60 s before it. Each game gets its own `match` event (`game`, plus `partial` when the video starts mid-game) and its own turn numbers.
- The generic parse changes help both profiles but leave the iPad log unchanged:
  - After a pivot move (U-turn, Parting Shot, …), the next send-out on that side replaces its user.
  - Intimidate on two mons gives one stat event each.
  - If a mon's only logged HP events are fixed heals and they don't add up to the next plate value, the missing amount is logged as one unknown hit before them (`cause: "unknown"`), so the chain gets solved.

### Broadcast score (floette/window2.ts, 29 min 25 s; 2027 Gdańsk Regional Masters Top 8 A, Jude Lee vs Liam Chatterjee)

```sh
./run-fast.sh ../floette/window2.ts out-fast-floette --truth truth/floette-g2.json --truth truth/floette-g3.json
```

The window holds the end of game 1 (partial: from turn 4 to the forfeit), all of game 2 and all of game 3. The ground truth is `truth/floette-g2.json` (all of game 2) and `truth/floette-g3.json` (turns 0–2 of game 3, where findings.md stops), both from findings.md. Each has a few events marked `added` or `fixed`: banners and Grassy heals findings.md doesn't list, and Whimsicott at 20 % on turn 7 of game 2 (findings.md says 14; the heal message and the plate show 20). Against findings.md alone, the score was 63/67 found and 55 exact for game 2, and 21/22 found and 21 exact for game 3.

| | game 2 (turns 0–7) | game 3 (turns 0–2) |
|---|---|---|
| found | 74 / 77 (96 %) | 25 / 26 (96 %) |
| exact | 67 | 25 |
| false events | 0 | 0 |
| move order | 18/18 | 8/8 |

Every reveal, stat, turn (actives + HP %), switch, mega, move, faint and the end event is exact. All the misses and inexact events are HP:
- **Neutral hits print no message**, so they leave no HP event: Moonblast on Incineroar (game 2 turn 2), Hyper Voice and Dazzling Gleam on Floette and Rillaboom (game 2 turn 4), Dazzling Gleam on Incineroar (game 3 turn 2). Where only one hit is unknown, its value is solved from the plates. With two or more unknown hits (game 2 turns 2–4), only the ends are filled.
- The fix is mid-turn plate reads. The broadcast shows the hit mon's plate during the damage animation. Own plates appear at the choose-screen positions (e.g. Sneasler 29 % / Incineroar 64 % in game 3 turn 2); the opponent's single plate appears further right (Glimmora 94 % in game 2 turn 1). Reading the plate band whenever an HP bar is on it would fill these.

Runtime on this M2: decode + OCR 72 s for 29.4 min of 720p60 (105,900 frames decoded, 7,060 samples at 4 fps). Parse and compare take under 1 s. OCR calls: 2,071 (messages 661; banners 834, gated at 120 stroke pixels, where real banners have 129+; plates 48 reads × 12 = 576).

Not done for the broadcast: player names (own name is in Japanese and reads as junk, opponent's comes from "Liam sent out"), team sheets (shown before each game; they could fill `yourTeam`/`oppSheet`), status/Tailwind/Toxic Spikes as events (matched as templates but not logged), and the game 1 tail has no ground truth.

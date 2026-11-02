#!/bin/zsh
# One command, no frame files: video -> fasttrack (in-memory decode + gated OCR) -> turn log -> score.
# Usage: ./run-fast.sh [video] [outdir] [--profile auto|ipad-zh|broadcast-en] [--truth file.json ...] [fasttrack options, e.g. --fps 3]
#   defaults: $POKECAL_TRIAL_DIR/floette/window2.ts (POKECAL_TRIAL_DIR defaults to ~/Documents/PokéCal-review-trial), ./out-fast, --profile auto (the profiles/*.json closest to the video's aspect ratio)
#   Scoring: against each --truth file (e.g. truth/floette-g2.json); with none, an ipad-zh run is scored against
#   the built-in ladder-1 truth and other profiles aren't scored.
set -e
here=${0:A:h}
video=${1:-${POKECAL_TRIAL_DIR:-$HOME/Documents/PokéCal-review-trial}/floette/window2.ts}
out=${2:-$here/out-fast}
shift $(( $# < 2 ? $# : 2 ))
profile=auto
truths=()
rest=()
while (( $# )); do
  case $1 in
    --profile) profile=$2; shift 2 ;;
    --truth) truths+=($2); shift 2 ;;
    *) rest+=($1); shift ;;
  esac
done
bin=${TMPDIR:-/tmp}/pokecal-fasttrack
mkdir -p "$out"
SECONDS=0
# `swift file.swift` runs unoptimised (the pixel loops take minutes); compile once with -O.
if [ ! -x "$bin" ] || [ "$here/fasttrack.swift" -nt "$bin" ]; then swiftc -O -o "$bin" "$here/fasttrack.swift"; echo "compile: ${SECONDS}s"; SECONDS=0; fi
"$bin" "$video" --profiles "$here/profiles" --profile "$profile" "${rest[@]}" > "$out/ocr.jsonl"
echo "decode + ocr: ${SECONDS}s"
# fasttrack writes the profile it used as the first line; parse.mjs reads it from there.
node "$here/parse.mjs" "$out/ocr.jsonl" "$out/turn-log.jsonl" --video "${video:t}"
used=$(head -1 "$out/ocr.jsonl" | sed -n 's/.*"profile":"\([^"]*\)".*/\1/p')
if (( ${#truths} )); then
  : > "$out/compare.md"
  for t in $truths; do node "$here/compare.mjs" "$out/turn-log.jsonl" --truth "$t" | tee -a "$out/compare.md"; echo | tee -a "$out/compare.md"; done
elif [ "$used" = ipad-zh ]; then
  node "$here/compare.mjs" "$out/turn-log.jsonl" | tee "$out/compare.md"
else
  echo "profile $used: no --truth given, not scored"
fi

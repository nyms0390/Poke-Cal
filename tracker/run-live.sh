#!/bin/zsh
# Live turn log from a window on screen (AirPlay mirroring of the iPad, a QuickTime window, a broadcast in a browser…).
# Usage:
#   ./run-live.sh --list-windows | --list-displays
#   ./run-live.sh --display [N] [outdir] [options]   whole display N (default the main one): start this first, then
#       mirror the iPad full screen with AirPlay and play; it waits for the game picture and stops after the win/lose message
#   ./run-live.sh --window "<app or title substring>" [--profile auto|ipad-zh|broadcast-en] [outdir] [fasttrack options, e.g. --fps 4 --duration 600]
#   defaults: outdir ./out-live, --profile auto (by the aspect ratio of the picture inside the window)
# Prints one line per turn-log event as it happens; Ctrl-C (or a win/lose message) stops it and writes
# <outdir>/ocr.jsonl, turn-log.jsonl, turn-log.sentences.txt, live-stats.json and content.png (the cropped picture,
# to check the crop). Needs Screen Recording permission for the app you run it from.
set -e
here=${0:A:h}
bin=${TMPDIR:-/tmp}/pokecal-fasttrack
if [ ! -x "$bin" ] || [ "$here/fasttrack.swift" -nt "$bin" ]; then swiftc -O -o "$bin" "$here/fasttrack.swift"; fi
if [[ $1 == --list-windows || $1 == --list-displays ]]; then exec "$bin" $1; fi
out=$here/out-live
rest=()
while (( $# )); do
  case $1 in
    --window|--window-id|--profile|--fps|--duration|--stable|--msg-force|--plate-reads|--jobs) rest+=($1 $2); shift 2 ;;
    --display) if [[ $2 == <-> ]]; then rest+=($1 $2); shift 2; else rest+=($1); shift; fi ;;
    --*) rest+=($1); shift ;;
    *) out=$1; shift ;;
  esac
done
mkdir -p "$out"
exec node "$here/live.mjs" "$bin" "$out" "${rest[@]}"

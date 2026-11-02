#!/bin/zsh
# One command: video -> frames -> OCR -> turn log -> score against ladder-1 ground truth.
# Usage: ./run.sh [video] [outdir]   (defaults: $POKECAL_IPAD_VIDEO or ~/Desktop/1030_2005.mov, ./out)
set -e
here=${0:A:h}
video=${1:-${POKECAL_IPAD_VIDEO:-$HOME/Desktop/1030_2005.mov}}
out=${2:-$here/out}
frames=${TMPDIR:-/tmp}/pokecal-frames-${video:t:r}
mkdir -p "$out"
SECONDS=0
if [ ! -d "$frames" ] || [ -z "$(ls "$frames")" ]; then "$here/frames.sh" "$video" "$frames" >/dev/null; fi
echo "frames: $(ls "$frames" | wc -l | tr -d ' ') at 2 fps, $(du -sh "$frames" | cut -f1) in $frames (${SECONDS}s)"
SECONDS=0
swift "$here/ocr.swift" 2 "$frames" > "$out/ocr.jsonl"
echo "ocr: ${SECONDS}s"
node "$here/parse.mjs" "$out/ocr.jsonl" "$out/turn-log.jsonl" --video "${video:t}"
node "$here/compare.mjs" "$out/turn-log.jsonl" | tee "$out/compare.md"
# Keep the frames for re-runs unless they take more than 1 GB.
if [ "$(du -sk "$frames" | cut -f1)" -gt 1048576 ]; then rm -rf "$frames"; echo "deleted $frames (over 1 GB)"; fi

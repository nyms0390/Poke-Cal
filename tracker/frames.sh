#!/bin/zsh
# Extract 2 fps JPEG frames from a video into a temp dir. Prints the dir.
# Usage: frames.sh <video> [outdir]
set -e
video=$1
out=${2:-${TMPDIR:-/tmp}/pokecal-frames-$$}
mkdir -p "$out"
ffmpeg -hide_banner -loglevel error -i "$video" -vf fps=2 -q:v 3 "$out/f%05d.jpg"
echo "$out"

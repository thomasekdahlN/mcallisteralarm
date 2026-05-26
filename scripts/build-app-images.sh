#!/bin/bash
# Generates Homey App Images (small/large/xlarge PNGs) from design/appartwork.png
# using macOS-native `sips` (no external dependencies).
#
# Homey App Store requires three exact sizes:
#   - assets/images/small.png   ->  75 x  75  (1:1)
#   - assets/images/large.png   -> 500 x 350  (10:7)
#   - assets/images/xlarge.png  -> 1000 x 700 (10:7)
#
# Strategy: fit cover (scale shortest edge to target, center-crop to exact size).
# This preserves aspect ratio without distortion and produces clean PNGs.
#
# Usage:  bash scripts/build-app-images.sh
# Run from the app root (com.mccallister.guard/).

set -euo pipefail

SRC="design/appartwork.png"
OUT_DIR="assets/images"

if [ ! -f "$SRC" ]; then
  echo "ERROR: source not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Read source dimensions
SRC_W=$(sips -g pixelWidth "$SRC" | awk '/pixelWidth/ {print $2}')
SRC_H=$(sips -g pixelHeight "$SRC" | awk '/pixelHeight/ {print $2}')
echo "Source: $SRC (${SRC_W}x${SRC_H})"

generate() {
  local out="$1"; local tw="$2"; local th="$3"
  local tmp; tmp=$(mktemp -t homey-img).png

  # Cover-fit: scale so the shortest edge reaches the target, then center-crop.
  # ratio = max(tw/sw, th/sh) — use awk for floating point.
  local scale_w scale_h scale new_w new_h
  scale_w=$(awk -v a="$tw" -v b="$SRC_W" 'BEGIN{printf "%.10f", a/b}')
  scale_h=$(awk -v a="$th" -v b="$SRC_H" 'BEGIN{printf "%.10f", a/b}')
  scale=$(awk -v a="$scale_w" -v b="$scale_h" 'BEGIN{print (a>b)?a:b}')
  new_w=$(awk -v s="$scale" -v w="$SRC_W" 'BEGIN{printf "%d", (w*s)+0.5}')
  new_h=$(awk -v s="$scale" -v h="$SRC_H" 'BEGIN{printf "%d", (h*s)+0.5}')

  cp "$SRC" "$tmp"
  sips -z "$new_h" "$new_w" "$tmp" > /dev/null
  sips -c "$th" "$tw" "$tmp" > /dev/null
  mv "$tmp" "$out"
  echo "  wrote $out (${tw}x${th})"
}

echo "Generating App Images..."
generate "$OUT_DIR/small.png"  75   75
generate "$OUT_DIR/large.png"  500  350
generate "$OUT_DIR/xlarge.png" 1000 700

echo "Done. Verifying:"
sips -g pixelWidth -g pixelHeight \
  "$OUT_DIR/small.png" "$OUT_DIR/large.png" "$OUT_DIR/xlarge.png" \
  | grep -E 'pixel(Width|Height)|/'

#!/usr/bin/env bash
# Generate Chrome Web Store compliant screenshots (1280x800) from the raw
# captures in screenshots/. Each image is scaled to fit, then padded onto a
# white canvas. Requires macOS `sips` (preinstalled).
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="screenshots"
OUT_DIR="store/assets/screenshots"
TARGET_W=1280
TARGET_H=800
PAD_COLOR="FFFFFF"

command -v sips >/dev/null 2>&1 || { echo "error: sips not found (macOS only)"; exit 1; }

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

shopt -s nullglob
for src in "$SRC_DIR"/*.png; do
  name=$(basename "$src")
  w=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  h=$(sips -g pixelHeight "$src" | awk '/pixelHeight/{print $2}')

  # Scale to fit within the target box (never upscale past it)
  read -r newW newH < <(awk -v w="$w" -v h="$h" -v tw="$TARGET_W" -v th="$TARGET_H" 'BEGIN{
    s = tw/w; if (th/h < s) s = th/h;
    if (s > 1) s = 1;                 # do not enlarge small captures
    printf "%d %d\n", int(w*s+0.5), int(h*s+0.5);
  }')

  tmp="$OUT_DIR/$name"
  cp "$src" "$tmp"
  sips --resampleHeightWidth "$newH" "$newW" "$tmp" >/dev/null
  sips --padToHeightWidth "$TARGET_H" "$TARGET_W" --padColor "$PAD_COLOR" "$tmp" >/dev/null 2>&1
  echo "  $name -> ${TARGET_W}x${TARGET_H} (fit ${newW}x${newH})"
done

echo "Done. Store screenshots in $OUT_DIR/"

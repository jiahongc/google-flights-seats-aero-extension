#!/usr/bin/env bash
# Generate Chrome Web Store compliant screenshots from raw captures.
#
# Output: 1280x800, 24-bit RGB PNG, NO alpha channel (the Web Store rejects
# 32-bit/RGBA images with a misleading "image size is incorrect" error).
#
# Usage:
#   scripts/make-store-screenshots.sh [input_dir]
#
#   input_dir   Folder of source PNG/JPEG screenshots. Default: screenshots
#   MODE=contain  (default) scale to fit inside 1280x800, pad with white.
#                 Nothing is trimmed; off-ratio shots get white borders.
#   MODE=cover    scale to fill 1280x800, center-crop the overflow (full-bleed).
#
# Requires Python 3 with Pillow (`python3 -m pip install pillow`).
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_DIR="${1:-screenshots}"
OUT_DIR="store/assets/screenshots"
MODE="${MODE:-contain}"

python3 - "$SRC_DIR" "$OUT_DIR" "$MODE" <<'PY'
import sys, os, glob
from PIL import Image

src_dir, out_dir, mode = sys.argv[1], sys.argv[2], sys.argv[3]
TW, TH = 1280, 800
WHITE = (255, 255, 255)

paths = []
for ext in ("png", "PNG", "jpg", "JPG", "jpeg", "JPEG"):
    paths += glob.glob(os.path.join(src_dir, f"*.{ext}"))
paths = sorted(set(paths))
if not paths:
    sys.exit(f"No images found in {src_dir}/ — paste your screenshots there first.")

if os.path.isdir(out_dir):
    for f in glob.glob(os.path.join(out_dir, "*.png")):
        os.remove(f)
os.makedirs(out_dir, exist_ok=True)

for p in paths:
    name = os.path.splitext(os.path.basename(p))[0] + ".png"
    im = Image.open(p).convert("RGBA")
    w, h = im.size
    canvas = Image.new("RGB", (TW, TH), WHITE)

    if mode == "cover":
        s = max(TW / w, TH / h)
        nw, nh = round(w * s), round(h * s)
        scaled = im.resize((nw, nh), Image.LANCZOS)
        left, top = (nw - TW) // 2, (nh - TH) // 2
        scaled = scaled.crop((left, top, left + TW, top + TH))
        canvas.paste(scaled, (0, 0), scaled)
        note = f"cover, trimmed {nw-TW}px W / {nh-TH}px H"
    else:  # contain
        s = min(TW / w, TH / h, 1.0)
        nw, nh = round(w * s), round(h * s)
        scaled = im.resize((nw, nh), Image.LANCZOS)
        canvas.paste(scaled, ((TW - nw) // 2, (TH - nh) // 2), scaled)
        note = f"contain, fit {nw}x{nh}"

    out = os.path.join(out_dir, name)
    canvas.save(out, "PNG", dpi=(72, 72))  # RGB canvas -> 24-bit, no alpha
    print(f"  {os.path.basename(p)} -> {TW}x{TH} ({note})")

print(f"Done. Store screenshots in {out_dir}/")
PY

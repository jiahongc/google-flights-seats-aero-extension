#!/usr/bin/env bash
# Build distributable extension zips for Chrome and Firefox into dist/.
set -euo pipefail

cd "$(dirname "$0")/.."

FILES=(
  background.js
  content.js
  seats-content.js
  protobuf.js
  airlines.js
  metros.js
  popup.html
  popup.js
  styles.css
  seats-styles.css
  icons
)

VERSION=$(node -p "require('./manifest.json').version")
rm -rf dist
mkdir -p dist

# Chrome
STAGE=$(mktemp -d)
cp -R "${FILES[@]}" "$STAGE/"
cp manifest.json "$STAGE/manifest.json"
(cd "$STAGE" && zip -qr - .) > "dist/seats-aero-google-flights-${VERSION}-chrome.zip"
rm -rf "$STAGE"

# Firefox (same code, Firefox-specific manifest with event-page background)
STAGE=$(mktemp -d)
cp -R "${FILES[@]}" "$STAGE/"
cp manifest.firefox.json "$STAGE/manifest.json"
(cd "$STAGE" && zip -qr - .) > "dist/seats-aero-google-flights-${VERSION}-firefox.zip"
rm -rf "$STAGE"

ls -lh dist/

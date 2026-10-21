#!/bin/bash
# Renders the README banners, link preview and GitHub social preview (/card/*) to PNGs with
# headless Chromium. Needs the site running: npm run dev (or npm run build && npm start).
set -euo pipefail
cd "$(dirname "$0")/.."
URL="${1:-http://localhost:3000}"
OUT=../assets/brand
shot() {
  # $4: device scale (README banners are captured at 2x for high-DPI screens)
  chromium --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist \
    --hide-scrollbars --force-device-scale-factor="${4:-1}" --window-size="$2" --virtual-time-budget=6000 \
    --screenshot="$3" "$URL/card/$1" 2> /dev/null
  echo "$3"
}
shot banner 1280,400 "$OUT/banner-light.png" 2
shot banner-dark 1280,400 "$OUT/banner-dark.png" 2
shot og 1200,630 "$OUT/og.png"
shot social 1280,640 "$OUT/social-preview.png"
cp "$OUT/og.png" public/og.png

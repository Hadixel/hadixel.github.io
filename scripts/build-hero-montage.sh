#!/usr/bin/env bash
# Build the homepage hero from the shop's own catalogue.
#
# The hero stage in apps/store/src/components/home-hero.tsx is a square ring with
# an SVG dial, and the image is drawn with object-contain + mix-blend-multiply.
# Every catalogue photograph is a cut-out on pure white, so a montage of the real
# products drops straight into that ring and its background disappears.
#
# The hero is deliberately NOT generated. It stands for the whole shop, and a
# drawn lookalike sitting beside the real Datees photography would read as a
# claim about what is in stock.
#
#   scripts/build-hero-montage.sh
#
# Re-run this after changing the representative product for any category.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$ROOT/apps/store/public/products"
DEST="$ROOT/apps/store/public/editorial/hero-storefront.jpg"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# One representative per category. The oven's img-1 is a four-up colour sheet
# rather than a single appliance, so the montage uses img-3.
HOOD="$PUB/datees-volira-built-in-hood/variant-black/img-1.jpg"
COOKTOP="$PUB/datees-5-burner-gas-cooktop-551/variant-black/img-1.jpg"
OVEN="$PUB/datees-built-in-electric-oven-675/variant-black/img-3.jpg"
SINK="$PUB/datees-stainless-steel-double-bowl-sink-180/variant-steel/img-1.jpg"

command -v convert >/dev/null || { echo "ImageMagick 'convert' is required" >&2; exit 1; }
for f in "$HOOD" "$COOKTOP" "$OVEN" "$SINK"; do
  [ -f "$f" ] || { echo "missing product image: $f" >&2; exit 1; }
done

name_of() {
  case "$1" in
    "$HOOD") echo hood ;;
    "$COOKTOP") echo cooktop ;;
    "$OVEN") echo oven ;;
    "$SINK") echo sink ;;
  esac
}

# Trim the white margin so the layout works from real object bounds.
for f in "$HOOD" "$COOKTOP" "$OVEN" "$SINK"; do
  n="$(name_of "$f")"
  convert "$f" -alpha off -fuzz 6% -trim +repage "$WORK/$n.png"
done

# Hood on top, cooktop and oven beneath it, sink below: a shelf, not a collage.
convert "$WORK/hood.png" -resize 820x "$WORK/r1.png"
convert "$WORK/oven.png" -resize x400 "$WORK/r2b.png"
convert "$WORK/cooktop.png" -resize 700x "$WORK/r2a.png"
convert "$WORK/sink.png" -resize 700x "$WORK/r3.png"
convert "$WORK/r2a.png" "$WORK/r2b.png" -background white -gravity center +append "$WORK/row2.png"
convert "$WORK/r1.png" "$WORK/row2.png" "$WORK/r3.png" \
  -background white -gravity center -append -extent 1400x1400 \
  -quality 92 "$DEST"

echo "wrote $DEST ($(identify -format '%wx%h' "$DEST"))"

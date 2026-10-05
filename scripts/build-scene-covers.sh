#!/usr/bin/env bash
# Build the composed blog covers and the home banner from AI scene plates + real catalogue
# cut-outs.
#
# Why composed rather than generated: the model draws the room, the catalogue supplies the
# appliance. A generated cooker would be a lookalike for something the shop actually sells, and
# the brief rules that out. Compositing keeps the product genuinely ours while the frame still
# reads as photographic editorial.
#
# Each cover gets a DIFFERENT product. Reusing one across a set reads as a bug rather than a
# series, and it is a worse advert besides: the same hood on every post suggests a single-item
# shop.
#
# y is where the product's BASE sits, as a percentage of frame height. A hood is wall-mounted
# and sits high; a cooktop belongs down on a worktop. Getting this wrong is the difference
# between a product in a room and a product floating in one.
#
# Prerequisites, in order:
#   node scripts/scene-prompts.mjs      # writes .scenes/prompts.json
#   node scripts/generate-scenes.mjs    # writes .scenes/scene-*.jpg (needs Flow quota)
#   bash scripts/build-scene-covers.sh  # this script
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCENES="${KMODERN_SCENES:-$ROOT/.scenes}"
PRODUCTS="$ROOT/apps/store/public/products"

# cover file | scene plate (without extension) | product path | x% | y%
#
# Multi-variant products are directories (product/variant/img-N.jpg), not flat files. Both
# checks below run before any compositing, so a typo fails loudly here instead of quietly
# producing a cover with nothing in it.
covers=(
  "cover-ventilation.jpg|scene-ventilation|datees-chimney-hood-mozikal-front.jpg|34|40"
  "cover-hygiene.jpg|scene-hygiene|datees-air-fryer-202-closed.jpg|30|74"
  "cover-maintenance.jpg|scene-maintenance|datees-built-in-electric-oven-683/variant-black/img-1.jpg|32|80"
  "cover-baking.jpg|scene-baking|datees-built-in-electric-oven-698/variant-black/img-1.jpg|66|78"
  "cover-cooktop.jpg|scene-cooktop|datees-electric-cooktop-250-black.jpg|50|76"
  "cover-steel.jpg|scene-steel|datees-chimney-hood-lavida-front.jpg|62|42"
  "cover-small-kitchen.jpg|scene-small-kitchen|datees-2-burner-gas-cooktop-203/variant-black/img-1.jpg|50|74"
  "banner-kitchen.jpg|scene-banner|datees-chimney-hood-lavida-front.jpg|26|62"
)

fail=0
for entry in "${covers[@]}"; do
  IFS='|' read -r out scene product x y <<<"$entry"
  [[ -f "$SCENES/$scene.jpg" ]] || { echo "missing plate: $SCENES/$scene.jpg" >&2; fail=1; }
  [[ -f "$PRODUCTS/$product" ]] || { echo "missing product: $PRODUCTS/$product" >&2; fail=1; }
done
if [[ $fail -eq 1 ]]; then
  echo >&2
  echo "Nothing composed. The plates are model-generated, so run:" >&2
  echo "  node scripts/scene-prompts.mjs && node scripts/generate-scenes.mjs" >&2
  echo "Quota is per-account — if Flow refuses, wait rather than retrying." >&2
  exit 1
fi

for entry in "${covers[@]}"; do
  IFS='|' read -r out scene product x y <<<"$entry"
  echo "--- $out"
  node "$ROOT/scripts/build-scene-cover.mjs" \
    --out "$out" --scene "$scene" --product "$product" \
    --product-x "$x" --product-y "$y"
done

echo
echo "done — ${#covers[@]} images written to apps/store/public/editorial"

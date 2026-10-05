#!/usr/bin/env bash
# Generate the whole image set through Flow, using the real catalogue photos as references.
#
# Flow's quota is intermittent and refuses with a red "Something went wrong" without producing
# anything, so this retries with a pause. The one thing it must never do is believe Flow's own
# reply: the agent writes "I've generated the image of the oven in the kitchen" while the
# generation is failing, so only a new image of the right size counts as success.
#
# Progress is written to .scenes as each shot lands, so the run resumes rather than regenerating.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCENES="$ROOT/.scenes"
PORT="${FLOW_REF_PORT:-8899}"
ATTEMPTS="${FLOW_ATTEMPTS:-4}"
PAUSE="${FLOW_PAUSE:-45}"
ONLY="${1:-}"

node "$ROOT/scripts/flow-brief.mjs" || exit 1

# The page cannot read the filesystem, so reference photos are served over loopback with CORS
# enabled. Without the header the page's fetch throws and the run generates a scene with no
# product in it — a lookalike, which is the one thing the brief forbids.
#
# The probe must request a real asset. The server 404s on `/` by design, and `curl -f` turns that
# into a failure, so probing the root reports "down" on a perfectly healthy server and the run
# then backgrounds a second one onto a taken port. It has to fail for the right reason: no
# listener at all.
PROBE_REF=$(head -1 <<<"$(node "$ROOT/scripts/flow-brief-list.mjs")" | cut -f3)
if ! curl -sf -o /dev/null -H "Origin: http://flow.google.com" \
     "http://127.0.0.1:$PORT/$PROBE_REF" 2>/dev/null; then
  echo "starting reference server on 127.0.0.1:$PORT"
  node "$ROOT/scripts/ref-server.mjs" --port "$PORT" >/tmp/ref-server.log 2>&1 &
  trap 'kill $! 2>/dev/null' EXIT
  sleep 2
  # Confirm it came up before generating, so a dead server fails the run instead of quietly
  # producing every scene with no product in it.
  curl -sf -o /dev/null -H "Origin: http://flow.google.com" \
    "http://127.0.0.1:$PORT/$PROBE_REF" 2>/dev/null || { echo "reference server failed to start"; exit 1; }
fi

SHOT_LIST=$(node "$ROOT/scripts/flow-brief-list.mjs")
made=0; total=0; failed=""

while IFS=$'\t' read -r file ratio ref prompt; do
  [[ -z "$file" ]] && continue
  if [[ -n "$ONLY" && "$file" != *"$ONLY"* ]]; then continue; fi
  total=$((total + 1))
  target="$SCENES/$file"
  published="$ROOT/apps/store/public/editorial/$file"

  if [[ -s "$target" ]]; then
    echo "skip  $file ($(stat -c%s "$target")B)"
    continue
  fi

  # A cover already published counts as done. The brief keeps listing every shot forever, so
  # without this the loop regenerates covers that were already curated by eye, spends scarce
  # quota on them, and the next publish would drop unreviewed duplicates over good work.
  if [[ -s "$published" ]] && [[ $(stat -c%s "$published") -gt 200000 ]]; then
    echo "skip  $file (already published, $(stat -c%s "$published")B)"
    continue
  fi

  ok=0
  for attempt in $(seq 1 "$ATTEMPTS"); do
    echo "gen   $file  attempt $attempt/$ATTEMPTS"
    FLOW_REF_BASE="http://127.0.0.1:$PORT" node "$ROOT/scripts/flow-generate-jev.mjs" \
      --prompt "$prompt" --ratio "$ratio" --ref "$ref" --out "$target" 2>&1 | tail -2
    # 200000B, the same threshold the drivers use. A 1080x1080 catalogue collage passes the
    # dimension test, so the byte count is what keeps a product photo on white from being
    # accepted as a generated scene.
    if [[ -s "$target" ]] && [[ $(stat -c%s "$target") -gt 200000 ]]; then
      ok=1; break
    fi
    # A thin file here is a product shot or an upload thumbnail, not a generation. Remove it so
    # a later run does not skip the shot believing it is done.
    rm -f "$target"
    [[ $attempt -lt $ATTEMPTS ]] && sleep "$PAUSE"
  done

  if [[ $ok -eq 1 ]]; then
    echo "  ok  $file ($(stat -c%s "$target")B)"
    made=$((made + 1))
  else
    echo "  FAIL $file"
    failed="$failed $file"
  fi
done <<<"$SHOT_LIST"

echo
echo "generated $made of $total"
[[ -n "$failed" ]] && echo "still failing:$failed" && exit 1
exit 0

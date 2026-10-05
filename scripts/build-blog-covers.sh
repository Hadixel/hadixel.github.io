#!/usr/bin/env bash
# Generate one cover per blog post through the signed-in Gemini session.
#
# Progress is the file on disk: a cover that exists is skipped, so the run resumes where it stopped
# and can be interrupted at any time. Delete a cover to have it generated again.
#
# The session refuses intermittently and reports it as "Something went wrong" in the page, so each
# shot is retried a few times with a pause. The driver only reports success when a frame that is
# landscape, newly generated and over the size floor has been written, so a retry cannot mistake a
# leftover file for a finished shot — which is why a failed attempt deletes its output.
#
#   bash scripts/build-blog-covers.sh
#   FLOW_ATTEMPTS=5 FLOW_PAUSE=90 bash scripts/build-blog-covers.sh
#
# BLOG_NOREF=1 generates only the posts that need no catalogue photo in frame. It exists because
# the session sometimes accepts a prompt and never sends it once an image is attached, and a run
# that spends its attempts on those shots never reaches the ones that would work. Progress is on
# disk, so the rest of the set is picked up by a later pass without the flag.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/apps/store/public/editorial"
ATTEMPTS="${FLOW_ATTEMPTS:-3}"
PAUSE="${FLOW_PAUSE:-60}"
# A gap between shots, not only after failures. A back-to-back run of 51 page loads is what got
# this browser profile 403'd out of Gemini mid-batch, and the ban is time-based, so the run waits
# between shots whether or not the last one worked. Set GEMINI_GAP=0 to generate flat out.
GAP="${GEMINI_GAP:-45}"
NOREF="${BLOG_NOREF:-0}"
# Outer bound per shot, comfortably above the driver's own 420s generation timeout plus its attach
# and submit phases. It exists to end a hang, not to end a slow generation.
SHOT_LIMIT="${BLOG_SHOT_LIMIT:-900}"

node "$ROOT/scripts/blog-brief.mjs" || exit 1

# One line per shot: file, reference, prompt. The delimiter is a control character rather than a
# tab because tab is an IFS whitespace character: consecutive tabs collapse, so a shot with no
# reference (two tab-separated fields) would have its prompt read as the reference and the driver
# would be called with an empty prompt. Nothing in a path or a prompt can contain this byte.
SHOT_LIST=$(node -e '
const b = require(process.argv[1]);
for (const s of b) console.log([s.file, s.ref ?? "", s.prompt].join("\x1f"));
' "$ROOT/.scenes/blog-brief.json")

made=0; total=0; failed=""
while IFS=$'\x1f' read -r file ref prompt; do
  [[ -z "$file" ]] && continue
  if [[ "$NOREF" == "1" && -n "$ref" ]]; then continue; fi
  total=$((total + 1))
  target="$OUT_DIR/$file"

  if [[ -s "$target" ]]; then
    echo "skip  $file ($(stat -c%s "$target")B)"
    continue
  fi

  ok=0
  for attempt in $(seq 1 "$ATTEMPTS"); do
    echo "gen   $file  attempt $attempt/$ATTEMPTS"
    # Each invocation is bounded from outside as well as inside. The driver has its own deadlines,
    # but a run of 51 unattended shots should not depend on one of them holding: without an outer
    # bound a wedged process stalls the loop for good, and there is nobody watching it.
    if [[ -n "$ref" ]]; then
      timeout "$SHOT_LIMIT" node "$ROOT/scripts/gemini-scene.mjs" --prompt "$prompt" --ref "$ref" --out "$target"
      rc=$?
    else
      timeout "$SHOT_LIMIT" node "$ROOT/scripts/gemini-scene.mjs" --prompt "$prompt" --out "$target"
      rc=$?
    fi
    # A banned session is not a shot that failed. Retrying it for the rest of the list only spends
    # requests against a profile that is already being throttled, so stop here and let a later run
    # resume from whatever landed — the covers already on disk are kept either way.
    if [[ $rc -eq 3 ]]; then
      echo
      echo "session banned by Gemini, stopping after $made of $total. Re-run when the block decays."
      exit 1
    fi
    if [[ -s "$target" ]]; then
      ok=1
      break
    fi
    # Nothing usable was written. Remove any partial file so a later run does not skip the shot
    # believing it is done, and give the session room before spending another attempt on it.
    rm -f "$target"
    [[ $attempt -lt "$ATTEMPTS" ]] && sleep "$PAUSE"
  done

  if [[ $ok -eq 1 ]]; then
    echo "  ok  $file ($(stat -c%s "$target")B)"
    made=$((made + 1))
  else
    echo "  FAIL $file"
    failed="$failed $file"
  fi

  # Also after the last shot, which costs one gap at the end of the run and keeps the loop simple.
  sleep "$GAP"
done <<<"$SHOT_LIST"

echo
echo "generated $made of $total"
[[ -n "$failed" ]] && echo "still failing:$failed" && exit 1
exit 0

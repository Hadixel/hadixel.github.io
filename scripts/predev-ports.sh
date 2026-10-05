#!/usr/bin/env bash
# Refuse to start the dev stack when something already holds a dev port, and say what.
#
# Why: turbo runs the three dev tasks in parallel, so when one of them loses a port race the
# whole run reports a single bare "listen EADDRINUSE :::3100" and exits. That message names
# the symptom, not the cause — the cause is almost always a previous run whose processes were
# orphaned, and the reader is left guessing which process to kill. It has also taken down the
# two services that started fine, because turbo stops the group when any task fails.
#
# The ports are declared once here and consumed by predev, so this list and the dev scripts
# cannot drift apart. Getting that wrong would make the check either miss a port or block one
# that is free.
set -uo pipefail

PORTS=(3100 3101 3102)
NAMES=("storefront" "admin panel" "gateway")

# Ports this repo's own dev tasks bind. Read from the package scripts rather than duplicated,
# so adding a port to a dev script is all it takes for the check to cover it.
declare -a WANTED
for spec in "apps/store:storefront" "apps/admin:admin panel"; do
  dir="${spec%%:*}"
  name="${spec#*:}"
  port=$(node -e "const m=require('./$dir/package.json').scripts.dev.match(/-p\s*(\d+)/); process.stdout.write(m?m[1]:'')")
  [ -n "$port" ] && WANTED+=("$port:$name")
done
# The gateway takes no -p flag; it reads PORT and defaults to 3102.
WANTED+=("3102:gateway")

blocked=0
for entry in "${WANTED[@]}"; do
  port="${entry%%:*}"
  name="${entry#*:}"
  if ss -H -lptn "sport = :$port" 2>/dev/null | grep -q LISTEN; then
    holder=$(ss -H -lptn "sport = :$port" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
    echo "port $port ($name) is already in use by pid ${holder:-unknown}." >&2
    if [ -n "${holder:-}" ]; then
      echo "  $(ps -o args= -p "$holder" 2>/dev/null | cut -c1-80)" >&2
    fi
    blocked=1
  fi
done

if [ "$blocked" -ne 0 ]; then
  echo >&2
  echo "A previous dev run is still up. Stop it, or free the port:" >&2
  echo "  pkill -f 'turbo dev'; pkill -f 'next dev'; pkill -f 'scripts/dev.mjs'" >&2
  exit 1
fi

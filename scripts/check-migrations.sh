#!/usr/bin/env bash
# §8's two migration checks. Both are mechanical, so both are gates.
#
#   1. IMMUTABILITY — a migration that has been applied is never edited. Checked against a
#      recorded hash per migration, so editing one is a deliberate act with a reviewed diff rather
#      than a silent rewrite. The record is a lockfile: whoever edits a migration can re-record the
#      hash, exactly as with any lockfile. The value is that the edit stops being invisible.
#
#   2. DRIFT — replay every migration onto an empty database and diff the result against the
#      schema. This is the check that proves the gateway's schema matches the migrated database
#      exactly, which is otherwise only asserted. It needs a database to replay onto that is not
#      the one being checked, so it builds its own shadow database on the disposable cluster and
#      drops it afterwards. It never reads or writes DATABASE_URL.
#
#   scripts/check-migrations.sh            both checks
#   scripts/check-migrations.sh immutable  hash comparison only, no database needed
#   scripts/check-migrations.sh drift      replay-and-diff only
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2
API=apps/api
MIGRATIONS="$API/prisma/migrations"
RECORD="$API/prisma/migrations.lock.json"
WHICH="${1:-both}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"

fail() { printf '  FAIL  %s\n' "$1"; exit 1; }

# ---------------------------------------------------------------- immutability

immutable() {
  if [ ! -d "$MIGRATIONS" ]; then fail "no migrations directory at $MIGRATIONS"; fi
  local found
  found=$(cd "$MIGRATIONS" && ls -d */migration.sql 2>/dev/null | sort)
  [ -n "$found" ] || fail "found no migrations under $MIGRATIONS — the scan is broken, not the history"

  # The recorded hashes, as a flat "path hash" list the shell can read without a JSON parser.
  local recorded=""
  if [ -f "$RECORD" ]; then
    recorded=$(node -e '
      const r = require("./" + process.argv[1]);
      for (const [k, v] of Object.entries(r.migrations)) console.log(k + " " + v);
    ' "$RECORD" 2>/dev/null)
    [ -n "$recorded" ] || fail "$RECORD is unreadable or records no migrations — refusing to treat that as a pass"
  else
    fail "$RECORD does not exist. Record the applied migrations with: scripts/check-migrations.sh record"
  fi

  local problems=0 name actual
  while read -r name; do
    [ -n "$name" ] || continue
    actual=$(sha256sum "$MIGRATIONS/$name" | cut -d' ' -f1)
    local expected
    expected=$(printf '%s\n' "$recorded" | awk -v k="$name" '$1==k {print $2}')
    # The record carries a sha256: prefix to say what the digest is of; sha256sum does not.
    expected="${expected#sha256:}"
    if [ -z "$expected" ]; then
      printf '        %s is applied but not recorded — a new migration must be recorded deliberately\n' "$name"
      problems=$((problems + 1))
    elif [ "$expected" != "$actual" ]; then
      printf '        %s was edited after being applied (recorded %s, now %s)\n' \
        "$name" "${expected:0:12}" "${actual:0:12}"
      problems=$((problems + 1))
    fi
  done <<< "$found"

  # The other direction: a record for a migration that no longer exists is a deletion, which is
  # the same violation wearing a different hat.
  while read -r name _; do
    [ -n "$name" ] || continue
    [ -f "$MIGRATIONS/$name" ] || { printf '        %s is recorded but absent from the tree\n' "$name"; problems=$((problems + 1)); }
  done <<< "$recorded"

  if [ "$problems" -ne 0 ]; then
    fail "$problems migration(s) were edited, added or removed after being applied (§8: applied migrations are immutable)"
  fi
  printf '  ok    applied migrations are immutable (%s recorded)\n' "$(printf '%s\n' "$recorded" | grep -c .)"
}

# ------------------------------------------------------------------------ drift

drift() {
  if [ ! -x "$PGBIN/initdb" ]; then
    fail "postgres server binaries not found at $PGBIN (set PGBIN) — the drift check cannot run, and a check that cannot run is not a pass"
  fi
  ./scripts/test-db.sh start >/dev/null 2>&1 || fail "the disposable cluster would not start (scripts/test-db.sh start)"
  local url shadow
  url=$(./scripts/test-db.sh url)
  # Must differ from the database being checked, or the replay would diff the database against
  # itself and report no drift no matter what was wrong. Only the database name changes: the port
  # has to survive, so the name is replaced rather than appended to the tail.
  shadow="${url%/*}/kmodern_shadow"

  "$PGBIN/psql" -h 127.0.0.1 -p "${TEST_DB_PORT:-5433}" -U kmodern -d postgres -tAc \
    "select 1 from pg_database where datname='kmodern_shadow'" | grep -q 1 \
    || "$PGBIN/createdb" -h 127.0.0.1 -p "${TEST_DB_PORT:-5433}" -U kmodern kmodern_shadow

  local out rc
  out=$(cd "$API" && DATABASE_URL="$url" SHADOW_DATABASE_URL="$shadow" \
    ./node_modules/.bin/prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema prisma/schema.prisma \
      --exit-code 2>&1)
  rc=$?

  "$PGBIN/dropdb" -h 127.0.0.1 -p "${TEST_DB_PORT:-5433}" -U kmodern --if-exists kmodern_shadow >/dev/null 2>&1

  case "$rc" in
    0) printf '  ok    migrations replay to exactly the schema (no drift)\n' ;;
    2)
      printf '  FAIL  the migrations do not produce the schema — replaying them onto an empty\n'
      printf '        database differs from prisma/schema.prisma. A database migrated by these\n'
      printf '        files has a different shape from the one the code expects:\n'
      printf '%s\n' "$out" | sed 's/^/        /'
      exit 1
      ;;
    *) fail "the drift check could not run (prisma exit $rc): $(printf '%s' "$out" | tr '\n' ' ' | cut -c1-300)" ;;
  esac
}

# ---------------------------------------------------------------------- record

# The one operation that is allowed to change the record, and only when asked for by name. It
# prints what it is about to accept so the diff that follows is a review, not a formality.
record() {
  node -e '
    const { createHash } = require("node:crypto");
    const { readdirSync, readFileSync, writeFileSync } = require("node:fs");
    const dir = process.argv[1], out = process.argv[2];
    const migrations = {};
    for (const e of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = `${e.name}/migration.sql`;
      const hash = createHash("sha256").update(readFileSync(`${dir}/${f}`)).digest("hex");
      migrations[f] = `sha256:${hash}`;
    }
    // First run has no record to compare against, which is the normal case the first time.
    let before = 0;
    try { before = Object.keys(JSON.parse(readFileSync(out, "utf8")).migrations ?? {}).length; } catch {}
    writeFileSync(out, JSON.stringify({ migrations }, null, 2) + "\n");
    console.error(`recorded ${Object.keys(migrations).length} migration(s) (was ${before}) — review this diff:`);
    for (const [k, v] of Object.entries(migrations)) console.error(`  ${k}  ${v.slice(0, 19)}…`);
  ' "$MIGRATIONS" "$RECORD"
}

case "$WHICH" in
  immutable) immutable ;;
  drift) drift ;;
  record) record ;;
  both) immutable && drift ;;
  *) echo "usage: scripts/check-migrations.sh [immutable|drift|record|both]" >&2; exit 2 ;;
esac

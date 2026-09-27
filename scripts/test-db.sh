#!/usr/bin/env bash
# A disposable PostgreSQL for the destructive test suite.
#
# DESTRUCTIVE. It initialises a throwaway cluster from scratch, applies every migration to it, and
# throws it away on reset. It never reads or writes the development database.
#
# §8: "A destructive test suite names its own database. Any suite that drops and rebuilds a schema
# reads a dedicated variable, documents that it is destructive at the top of its own docs, and runs
# against a disposable container on a non-default port." This is that database: a separate cluster
# on port 5433, reached through TEST_DATABASE_URL and never through DATABASE_URL.
#
#   scripts/test-db.sh start    boot it and apply every migration
#   scripts/test-db.sh reset    drop and rebuild the schema (what the suite does between runs)
#   scripts/test-db.sh stop     shut it down
#   scripts/test-db.sh url       print the connection string
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${TEST_DB_PORT:-5433}"
HOST=127.0.0.1
USER=kmodern
ROOT="${TEST_DB_DIR:-/tmp/kmodern-testdb}"
DATA="$ROOT/data"
DB=kmodern_test
URL="postgresql://$USER@$HOST:$PORT/$DB"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "postgres server binaries not found at $PGBIN" >&2
  echo "set PGBIN to the directory holding initdb" >&2
  exit 2
fi

case "${1:-start}" in
  url)
    echo "$URL"
    ;;

  start)
    if [ ! -d "$DATA" ]; then
      mkdir -p "$ROOT"
      "$PGBIN/initdb" -D "$DATA" -U "$USER" --auth=trust -E UTF8 >"$ROOT/initdb.log" 2>&1
    fi
    if ! "$PGBIN/pg_isready" -h "$HOST" -p "$PORT" >/dev/null 2>&1; then
      "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -h $HOST -k $ROOT" -l "$ROOT/server.log" start >/dev/null
      for _ in $(seq 1 30); do
        "$PGBIN/pg_isready" -h "$HOST" -p "$PORT" >/dev/null 2>&1 && break
        sleep 0.5
      done
    fi
    "$PGBIN/psql" -h "$HOST" -p "$PORT" -U "$USER" -d postgres -tAc \
      "select 1 from pg_database where datname='$DB'" | grep -q 1 \
      || "$PGBIN/createdb" -h "$HOST" -p "$PORT" -U "$USER" "$DB"
    # Migrations run against the disposable database, named explicitly so it can never fall
    # through to the development DATABASE_URL.
    (cd "$(dirname "$0")/../apps/api" && DATABASE_URL="$URL" ./node_modules/.bin/prisma migrate deploy >/dev/null)
    echo "test database ready: $URL"
    ;;

  reset)
    # Drop the public schema and replay every migration. This is the destructive part.
    #
    # Connections are terminated first. A previous run's Prisma pool can still be open, and
    # `drop schema ... cascade` blocks behind it until the lock is released — which made reset
    # fail intermittently, and a suite that fails for a reason unrelated to the code is worse than
    # no suite. Only backends on this disposable database are touched.
    "$PGBIN/psql" -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -q \
      "select pg_terminate_backend(pid) from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid()" >/dev/null
    "$PGBIN/psql" -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -qc 'drop schema public cascade; create schema public;' >/dev/null
    (cd "$(dirname "$0")/../apps/api" && DATABASE_URL="$URL" ./node_modules/.bin/prisma migrate deploy >/dev/null)
    echo "test database reset: $URL"
    ;;

  stop)
    "$PGBIN/pg_ctl" -D "$DATA" stop >/dev/null 2>&1 || true
    echo "test database stopped"
    ;;

  *)
    echo "usage: $0 {start|reset|stop|url}" >&2
    exit 2
    ;;
esac

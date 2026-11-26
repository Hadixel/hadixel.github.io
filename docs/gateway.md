# The gateway's data tier

What lives inside [`apps/api`](../apps/api) because founding rule 1 puts the database in exactly one
process. The entry point for the whole app is [`apps/api/AGENTS.md`](../apps/api/AGENTS.md); this
document is the data tier's own, referenced from there.

## One process owns the database

The schema, the migrations, the generated client, the client wrapper and the data scripts all live
in the gateway workspace. There is no database package: one consumer is not a package (§5.5), and a
`packages/db` would have earned a second consumer only through the client-to-database edge §4 marks
❌. Clients reach the data tier over HTTP, through the gateway, and nothing else holds a connection
string.

## The generated client

`prisma/schema.prisma` generates into `src/generated/prisma`, inside the workspace. The one file
that names a `generated/` path is `src/prisma/index.ts`, which re-exports the client; every other
file imports the data tier through it. That single indirection is what makes changing the generator,
the ORM or the output path a one-file edit.

The audit enforces both halves as booleans (§15.1): nothing outside `apps/api/src` names a
`generated/` path — including by type-only import — and exactly one file inside the gateway does.
The dependency-cruiser rule `generated-prisma-outside-data-client-index` rejects the rest.

## Migrations

Migrations are the only path to a production schema change: committed, ordered, immutable once
applied. `prisma db push` is for throwaway local databases. Two checks run on every audit — both
inside `scripts/check-migrations.sh`, because a check that exists only on a future CI provider is a
check that does not run:

1. **Immutability** — an already-applied migration file may not be modified.
2. **Drift** — replay every migration onto an empty database and diff against the schema; the diff
   must be empty. The shadow database is `SHADOW_DATABASE_URL`, created and dropped by the script
   on the disposable cluster.

```bash
pnpm db:generate   # regenerate the client after a schema change
pnpm db:migrate    # create and apply a migration
```

## The test suite names its own database

The suite is destructive: it drops and rebuilds the schema. It reads `TEST_DATABASE_URL` and never
`DATABASE_URL`, it refuses to start unless the value names a disposable database, and
`scripts/test-db.sh` boots a throwaway Postgres on port 5433 for it:

```bash
scripts/test-db.sh start                  # boot it and apply every migration
export TEST_DATABASE_URL=$(scripts/test-db.sh url)
pnpm --filter @kmodern/api test
scripts/test-db.sh stop
```

## The data scripts are entrypoints

The seeds, the bootstrap and the one-off backfills under `seed/` are entrypoints in the §7.1 sense:
they boot nothing, import the composition module, read their connection config from the environment,
and are idempotent or refuse to overwrite existing rows. They are deliberately outside the
typecheck project — they predate the migration and carry known type errors that are fixed as each
resource is ported — so `scripts/check-imports.mjs`, wired into the audit, checks their relative
imports resolve instead.

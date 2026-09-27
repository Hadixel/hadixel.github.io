# `apps/api` — the gateway

The one process that talks to the database. It owns the schema, the migrations, the generated
client, the injectable client wrapper and the data scripts. Nothing else may hold a database
connection.

This directory started as the expand half of a wide change: everything moved here with
`git mv` so the history of each file is preserved, and the two existing clients keep compiling
through a temporary forwarding package. What lands here next is the NestJS composition root
(adoption plan P2), then the resources, one at a time.

## The data path today

The clients have **not** been migrated yet. They still reach the data tier through the temporary
`@kmodern/db` shim, which forwards to this package. This is a **known violation** of §15.1's
"no client imports the database client, including by type-only import" (§4 ❌) — not a design
choice, and not something a later reader should mistake for one.

As measured at the time of writing, and re-measurable at any time:

```bash
# 66 files: 39 in apps/admin, 27 in apps/store
grep -rln "@kmodern/db" --include="*.ts" --include="*.tsx" apps packages | grep -v '^apps/api/' | wc -l

# 4 of them are type-only edges — the shape §16.1 says the gate must be configured to see
grep -rn "import type.*@kmodern/db" --include="*.ts" --include="*.tsx" apps packages

# both clients also bundle the shim into the app build
grep -n '@kmodern/db' apps/store/next.config.ts apps/admin/next.config.ts
```

66 is the count **as committed**. The audit measures your working tree, so the two disagree while
client code is being edited — a lower number there means the clients have been consolidated, not
that this file is wrong. What matters is the direction: it may only fall.

`pnpm run audit` prints this count as `KNOWN`, never as `ok`: §15.3 rule 3 says a ratchet covers
counts and never a yes/no rule, so a boolean invariant does not become true by being counted. The
`@kmodern/db` package is deleted when the count reaches zero.

The shim also commits the repo's one registered architecture deviation, declared at the line that
breaks the rule rather than in a table somewhere that could drift from the code. See §18 in the
blueprint and `packages/db/src/index.ts`; `pnpm run audit` holds the count at 1 and fails at 2.

## The generated client

`prisma/schema.prisma` generates into `../src/generated/prisma`, which resolves to
`src/generated/prisma` here. What the audit enforces is that **nothing outside this package** names
a `generated/` path — that is the rule §8 states, and it is what protects a consumer from reaching
past the index.

Three files inside the data tier do name one, and that is not the same as the violation:

| File                                 | Why                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/prisma/index.ts`                | the one index the rule asks for                                                                                                                                              |
| `src/prisma/client.ts`               | the wrapper the index re-exports; it has to construct the client from somewhere                                                                                              |
| `src/inventory/inventory.service.ts` | the index re-exports _this module_, so importing through the index would make the data tier import itself — and §2's answer to a cycle is a missing module, not an exception |

The third is a deliberate, counted exception and the file says so where the import is. The audit
prints the in-package count rather than asserting one, because a data tier with a lifecycle module
cannot have exactly one.

```bash
pnpm db:generate   # regenerate the client after a schema change
pnpm db:migrate    # create and apply a migration
```

## Tests

The stock lifecycle test is destructive: it drops and rebuilds the schema, so it reads
`TEST_DATABASE_URL` and never `DATABASE_URL`, and it needs the disposable cluster.

```bash
scripts/test-db.sh start                  # boot a throwaway Postgres on port 5433
export TEST_DATABASE_URL=$(scripts/test-db.sh url)
pnpm --filter @kmodern/api test
scripts/test-db.sh stop
```

The seed scripts are deliberately **outside** the typecheck project — they predate the migration and
carry known type errors that are fixed as each resource is ported. A relative import that does not
resolve in them is caught by `scripts/check-imports.mjs` instead, which is wired into
`pnpm run audit`.

# `apps/api` — the gateway

The one process that talks to the database. Every client read and write is an HTTP call into it:
`apps/store` and `apps/admin` are clients of this service, and `apps/scraper` feeds it a catalogue
fragment through the seed. Prisma, the schema, the migrations, the generated client and the data
scripts live here because a package with one consumer is not a package (§5.5) — and because founding
rule 1 gives the system exactly one place where write invariants are enforced.

## Read this first

- [docs/gateway.md](../../docs/gateway.md) — the data tier: the schema, the generated client's one
  index, the migrations, the destructive test suite, the seeds.
- [docs/RANKS.md](../../docs/RANKS.md) — where this app sits and what it may import.
- [docs/COMPANION.md](../../docs/COMPANION.md) — this repo's concrete choices: ports, the archetype
  assignment of every directory below, token values, config tiers.
- Blueprint [§7](../../docs/blueprint/ARCHITECTURE-BLUEPRINT.md#7-gateway-internals) — the rules this
  tree is shaped by: the four in-app archetypes, the feature anatomy, the composition root.

## Shape of the tree

```
src/
├── main.ts            # the process entry: the boot sequence, in the fixed §7.4 order
├── app.module.ts      # the composition module: `imports` and nothing else
├── config/            # infrastructure: validated configuration, read before anything else
├── prisma/            # infrastructure: the data client and the one generated-client index
├── payments/ shipping/ sms/ storage/   # infrastructure: one port/adapter pair each
├── common/            # support: cross-cutting guards, the exception filter, pure helpers
├── <feature>/         # 24 feature directories
└── generated/         # the ORM's output. Nothing outside src/prisma/index.ts names it
```

§7.1 allows exactly two file kinds at this root and four directory archetypes; every directory is
assigned in `scripts/gateway-archetypes.js`, and the structure gate fails a directory no archetype
claims. A new top-level directory picks its archetype *before* it is created.

## Where things live

- **The data tier** — `src/prisma/`: the module, the client wrapper bound to the process lifecycle,
  and the index that re-exports the generated client. `prisma/schema.prisma` generates into
  `src/generated/prisma`; no other file in the repo names a `generated/` path.
- **Infrastructure modules** — `config/`, `payments/`, `shipping/`, `sms/`, `storage/`: module plus a
  port/adapter pair or vendor client, no controller, no HTTP surface of their own.
- **The support folder** — `common/`: code owned by no feature. The origin guard, the exception
  filter, the validation options, pure helpers. One registered deviation lives here (row 1 of
  [docs/DEVIATION-REGISTER.md](../../docs/DEVIATION-REGISTER.md)): a guard and a filter that are the
  framework's own constructs.
- **Features** — one directory per feature: `<feature>.module.ts` (wiring only), controller(s) split
  by audience, service(s) holding the rules, pure rules flat beside the service, and `dto/` plus
  `exceptions/` as real directories from the first file of each kind. `health/` is a feature like
  any other.

## The two global concerns, and where they live

`main.ts` installs every global concern exactly once, in the §7.4 order: validation (whitelist,
reject unknown, transform), the exception filter, security headers, the CORS allowlist, docs gated
to non-production, shutdown hooks. `app.module.ts` declares `imports` and nothing else — no
providers. A feature module installs no pipe, filter or middleware of its own; a non-global concern
is a decorator on the route.

## Commands

```bash
pnpm --filter @kmodern/api dev            # development server (PORT, default 3102)
pnpm db:generate                          # regenerate the client after a schema change
pnpm db:migrate                           # create and apply a migration
pnpm --filter @kmodern/api build          # tsc -p tsconfig.build.json, then the dist manifest
pnpm --filter @kmodern/api start          # run the compiled gateway
npx vitest run                            # from apps/api — destructive, needs the database below
```

The suite is destructive: it drops and rebuilds the schema, so it reads `TEST_DATABASE_URL` and
never `DATABASE_URL`. Boot the disposable cluster, export the URL, then run:

```bash
scripts/test-db.sh start
export TEST_DATABASE_URL=$(scripts/test-db.sh url)
pnpm --filter @kmodern/api test
scripts/test-db.sh stop
```

Repo-wide, `npx turbo run typecheck lint build` run as-is; `test` and `audit` need the database
above because the migration and data-path checks inside the audit use it. Run `pnpm run audit` for
this repo's audit — `pnpm audit` is pnpm's own vulnerability scan and answers a different question.

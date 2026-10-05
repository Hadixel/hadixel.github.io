# 06: `apps/api` takes the data tier

**What to build:** a new third application becomes the only process that will talk to the database. It starts by taking ownership of the data tier — the schema, the single existing migration, the generated client, the one injectable client wrapper, and the data scripts — and by re-exporting all of it so that the two existing clients keep compiling untouched. This is the expand half of a wide change: nothing breaks, and the structure to migrate into exists.

**Blocked by:** 02, 03.

**Status:** done, with the caveat noted below

- [x] A third application exists, named for its role, with its own port that no existing surface uses
- [x] The data schema, the single migration, the generator configuration, the data scripts and the client wrapper live in the gateway
- [ ] The database package becomes a temporary re-export of the gateway's data tier, so all sixty-odd existing call sites still resolve — **unverified as of 2026-10-01.** `ls packages` returns config, contracts, scraper, scraper-core, transport, ui — there is no `packages/db` to be a re-export, and `grep -rln "@kmodern/db" --include="*.ts" --include="*.tsx" apps packages | wc -l` is 0, so the ~66 call sites the box counts are gone from the tree entirely. The expand half this box describes is no longer observable.
- [x] The migration history moves byte-for-byte and is not regenerated; the gateway's schema matches the migrated database exactly
- [ ] The database package declares itself temporary in a comment saying what deletes it — **unverified as of 2026-10-01.** The package the comment would live in does not exist: `ls packages` lists only config, contracts, scraper, scraper-core, transport and ui. `apps/api/README.md:14` still describes a temporary `@kmodern/db` shim forwarding into the gateway, so the intent is documented at the readme rather than provable in the package itself.
- [x] The migration-immutability and migration-drift checks run against the gateway, and the drift check is reproducible against a disposable database on a non-default port
- [ ] `pnpm turbo run typecheck build test` is green with both clients untouched — **unverified as of 2026-10-01.** Two of the three were run and are green: `npx turbo run typecheck` → 8/8 successful, `npx turbo run build` → 4/4 successful, `npx turbo run test --filter=@kmodern/store --filter=@kmodern/admin` → 2/2 successful. The gateway suite was not run — it needs the disposable database and this reconciliation was told not to start it — so the `test` half of the command has no evidence behind it here.
- [x] The data scripts are idempotent or refuse to overwrite: one of them currently inserts a fresh discount on every run, and another deletes rows an administrator created
- [ ] A documented statement of which surfaces reach the database today, so the next slice can be checked against it — **unverified as of 2026-10-01.** The document exists (`apps/api/README.md:14-61`) but no longer states the truth it claims to state: it says "66 files: 39 in apps/admin, 27 in apps/store" reach the data tier through `@kmodern/db`, while the same commands printed beside that number now return 0, and it names `src/prisma/client.ts` as the wrapper where the tree has one `src/prisma/index.ts`. A statement that does not describe today is not the statement the box asks for.

## Comments

The boxes that mattered most are the two migration ones, and both were measured rather than read off
a commit. `bash scripts/check-migrations.sh immutable` reports `0001_init/migration.sql` recorded and
unmodified, so the history moved without being regenerated — it also reports
`0002_price_watch/migration.sql is applied but not recorded`, which is another writer's in-flight work
and not this ticket's. `PGBIN=/usr/lib/postgresql/16/bin bash scripts/check-migrations.sh drift` prints
`ok migrations replay to exactly the schema (no drift)`, so the gateway's schema does match the
migrated database.

`apps/api/src/config/config.service.ts:67-70` is the port box's evidence: `port: int("PORT", env["PORT"], 3102)`
with a comment naming 3100 and 3101 as the two clients, and `apps/store/.env:10` /
`apps/admin/.env:12` confirm those two surfaces sit on the other ports.

Two findings for the owner, neither of which I touched. The three unticked boxes all fail the same
way — `packages/db` was deleted after this slice landed, so the temporary re-export, its
self-declaring comment and the 66-call-site surface statement have nothing left in the tree to be
verified against. `apps/api/README.md` still asserts the shim and the count; that text is now false
and wants a rewrite rather than a tick. The fourth is honest incompleteness: `turbo run test` was not
run because the gateway suite needs a database this pass was told to leave alone.

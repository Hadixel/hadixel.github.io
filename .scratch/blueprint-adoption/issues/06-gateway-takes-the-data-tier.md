# 06: `apps/api` takes the data tier

**What to build:** a new third application becomes the only process that will talk to the database. It starts by taking ownership of the data tier — the schema, the single existing migration, the generated client, the one injectable client wrapper, and the data scripts — and by re-exporting all of it so that the two existing clients keep compiling untouched. This is the expand half of a wide change: nothing breaks, and the structure to migrate into exists.

**Blocked by:** 02, 03.

**Status:** ready-for-agent

- [ ] A third application exists, named for its role, with its own port that no existing surface uses
- [ ] The data schema, the single migration, the generator configuration, the data scripts and the client wrapper live in the gateway
- [ ] The database package becomes a temporary re-export of the gateway's data tier, so all sixty-odd existing call sites still resolve
- [ ] The migration history moves byte-for-byte and is not regenerated; the gateway's schema matches the migrated database exactly
- [ ] The database package declares itself temporary in a comment saying what deletes it
- [ ] The migration-immutability and migration-drift checks run against the gateway, and the drift check is reproducible against a disposable database on a non-default port
- [ ] `pnpm turbo run typecheck build test` is green with both clients untouched
- [ ] The data scripts are idempotent or refuse to overwrite: one of them currently inserts a fresh discount on every run, and another deletes rows an administrator created
- [ ] A documented statement of which surfaces reach the database today, so the next slice can be checked against it

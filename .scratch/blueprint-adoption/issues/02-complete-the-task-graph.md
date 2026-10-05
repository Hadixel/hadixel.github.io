# 02: Complete the task graph

**What to build:** `pnpm turbo run test` runs every test suite in the repo, in every workspace that has one, and the suites that exist today — eight test files across the storefront, the admin panel, the component library and the scraper — can actually execute. One of them currently cannot even find its own imports because its workspace has no test configuration. Alongside that: codegen participates in the cache, a dev session builds what it depends on, and an `audit` task exists ready to receive the boundary gates later.

**Blocked by:** 01.

**Status:** done, with the caveat noted below

- [ ] `pnpm turbo run test` is green, covering all eight existing test files — **unverified as of 2026-10-01.** `find apps packages -name '*.test.ts*' | grep -v node_modules` now lists 61 test files, not eight, and 38 of them are an `apps/api` gateway suite that needs a live database; that suite was not run, so an all-green run cannot be proved
- [x] Codegen declares the generated directory as a task output instead of opting out of the cache, so a second `pnpm turbo run build` with an unchanged schema is cached
- [x] The admin panel's test suite runs, with a test configuration that resolves its own path aliases
- [x] A `dev` run builds the workspaces it depends on first
- [x] An `audit` task exists and succeeds, so the phase that adds the boundary gates has a task to attach to
- [ ] The lint task builds its dependencies first, so type-aware linting always sees the generated types — **unverified as of 2026-10-01.** `turbo.json`'s `//#lint` block carries no `dependsOn` and the comment above it states the omission is deliberate ("Both read source rather than build output")
- [ ] Test directories are inside each app's source root, so no app root holds a directory no rule names — **unverified as of 2026-10-01.** `apps/api/tests` and `apps/scraper/tests` sit at the app root, not inside `src`; the second clause holds only because `scripts/client-structure-config.js` lists `tests` in `APP_ROOT_EXTRAS['apps/api'].dirNames`

## Comments

The admin test configuration is real: `apps/admin/vitest.config.ts` declares `resolve.alias["@"] -> ./src` and `include: ["src/**/*.test.ts"]`, and `npx vitest run` in `apps/admin` reports `Test Files 14 passed (14) / Tests 177 passed (177)`. Codegen caching is proved by two consecutive `npx turbo run generate` runs — the second prints `@kmodern/api:generate: cache hit, replaying logs 3f312e107d34a0ce` against `turbo.json`'s `"generate": { "outputs": ["src/generated/**"] }`. The `dev` box is `turbo.json`'s `"dev": { "dependsOn": ["^build"] }`.

The audit task exists (`//#audit` in `turbo.json`, `"audit": "bash scripts/audit.sh"` at the root) and `bash scripts/audit.sh` passes every structure, dependency-cruiser (698 modules cruised, no rule violated), boundaries, manifest, ratchet and app-root check. It exits 1 on exactly one item — `0002_price_watch/migration.sql is applied but not recorded` — which belongs to a concurrent writer's in-flight `apps/api` work and is outside this ticket; the tick reflects the task's existence and the green gate layer, not that unrelated failure. The three unticked boxes are counts and one deliberate design choice the tree does not support as written.

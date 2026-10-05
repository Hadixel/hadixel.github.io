# 03: One version per tool, and a documented environment for every variable

**What to build:** bumping the compiler, the linter or the test runner is a one-line change in one file, not seven. And every environment variable the code reads is written down somewhere, with its tier — so a new machine, a new teammate and a new deployment all learn the same contract instead of reverse-engineering it from the code.

**Blocked by:** 01.

**Status:** done, with the caveat noted below

- [x] The compiler, the linter and the test runner are declared in the root manifest only; no workspace manifest declares them
- [x] Every workspace that shares a dependency declares the identical version range, so no two manifests disagree
- [x] The UI runtime is pinned to a single instance through the root overrides block, because two copies break hooks
- [x] The component library declares the UI runtime as a dev dependency as well as a peer, so it type-checks and tests alone
- [ ] A committed example environment file exists at the root and at each app root, listing every variable the code actually reads — **unverified as of 2026-10-01.** `ls -la .env.example apps/*/.env.example` returns root + `apps/{admin,api,store}` only: `apps/scraper` has none, and `comm` over `process.env.*` in the code against the declared names leaves `STORE_DEV_ORIGIN` (read at `apps/store/next.config.ts:39`, which even names the convention in its comment) undeclared anywhere.
- [ ] Each variable in those files is labelled with its tier: available at build, read at runtime, or set only in continuous integration — **unverified as of 2026-10-01.** The root file carries tier 1/2/3 headers and labels every name under one, but the app files do not: `apps/api/.env.example`'s `PORT`, `NODE_ENV` and `CORS_ORIGINS` and `apps/admin/.env.example`'s `ADMIN_DEV_ORIGIN` are documented in prose ("Development only") and belong to none of the three tiers the box names.
- [x] The one variable that is currently reachable at build time — the database connection string — is documented as runtime-only, and the change that enforces that is tracked rather than silently documented

## Comments

Boxes 1–4 are provable by manifest alone: `grep -c typescript apps/*/package.json packages/*/package.json` returns 0 in all nine, and `eslint`, `vitest` and `prettier` likewise appear only in the root `devDependencies`. A script comparing every dependency name across the nine workspace manifests reports zero range conflicts outside `peerDependencies` — the only wider entries are `react`/`react-dom` `^19.0.0`→`^19.2.0` and `next` `^16.0.0` in `packages/ui` and `packages/transport`, which are peers and are meant to accept a range. The override the ticket wants is `pnpm-workspace.yaml`'s `overrides:` block, which carries `react: ^19.2.6` and `react-dom: ^19.2.6` under a comment naming the two-copies-break-hooks reason, and `packages/ui` carries both in `devDependencies` and `peerDependencies`.

Box 7's documentation is explicit: the root `.env.example` says `DATABASE_URL` "Must never be available at build time" and `apps/api/.env.example` says "Read at runtime, never at build", and the `loadDotenv` calls that made it reachable at build are gone from both `next.config.ts` files — the removal was tracked as finding C-16 in [`.scratch/blueprint-audit/findings-register.md`](../../blueprint-audit/findings-register.md), so it was not silent. That register is where this ticket's evidence outlives the adoption plan, which was deleted on 2026-10-01 when its last phase landed, per its own rule. `scripts/audit.sh:124` now gates the example files at four.

The two unticked boxes are documentation gaps, not code defects, and the code is not being changed here. Worth noting for the owner: nothing mechanical prevents `loadDotenv` returning to a `next.config.ts`, and `apps/scraper` reads `SCRAPE_CACHE` from an env file of its own that does not exist.

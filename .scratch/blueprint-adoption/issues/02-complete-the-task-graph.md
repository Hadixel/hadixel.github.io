# 02: Complete the task graph

**What to build:** `pnpm turbo run test` runs every test suite in the repo, in every workspace that has one, and the suites that exist today — eight test files across the storefront, the admin panel, the component library and the scraper — can actually execute. One of them currently cannot even find its own imports because its workspace has no test configuration. Alongside that: codegen participates in the cache, a dev session builds what it depends on, and an `audit` task exists ready to receive the boundary gates later.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] `pnpm turbo run test` is green, covering all eight existing test files
- [ ] The admin panel's test suite runs, with a test configuration that resolves its own path aliases
- [ ] Codegen declares the generated directory as a task output instead of opting out of the cache, so a second `pnpm turbo run build` with an unchanged schema is cached
- [ ] A `dev` run builds the workspaces it depends on first
- [ ] An `audit` task exists and succeeds, so the phase that adds the boundary gates has a task to attach to
- [ ] The lint task builds its dependencies first, so type-aware linting always sees the generated types
- [ ] Test directories are inside each app's source root, so no app root holds a directory no rule names

# 18: `packages/schema` → `packages/contracts`

**What to build:** the kernel is renamed for what it holds rather than for the mechanism it uses, and every call site follows. A package named after its contents is the point: the next engineer looking for the shared contracts should find them under a name that says so. This is a wide mechanical change, so it runs expand–contract: the new package appears beside the old, call sites move in batches sized by blast radius, and the old one is deleted last.

**Blocked by:** 17.

**Status:** done

- [x] The kernel package is named for what it holds, and its description says so
- [x] Every call site is repointed in batches — one per consumer workspace, not one enormous commit — and the typecheck is green after each batch
- [x] The old package name no longer appears in any manifest or source file
- [x] Its declared entry points still resolve, and each one has a consumer
- [x] The kernel's runtime dependencies are recorded as a named allowance in the gate configuration, because the blueprint both forbids a tier-one runtime dependency and requires a schema library in the kernel — a suppression would be the wrong instrument
- [x] The canonical formats the kernel declares are reachable by their intended callers, so the money conversion, the phone contract and the city normaliser each have at least one caller

## Comments

**How it landed.** One rename in a single pass rather than expand–contract: a second package
carrying the old name would have been deleted in the same session, and this repo's rule is no shims.
Repointing was batched per consumer workspace — the packages, `apps/scraper`, `apps/store`,
`apps/admin`, `apps/api`, then the root config (`.dependency-cruiser.js`, `eslint.config.mjs`,
`tsconfig.json`, `turbo.json`, `CLAUDE.md`, `scripts/gateway-dist-manifest.mjs`) — and the
whole-workspace typecheck is green: `npx turbo run typecheck` 17/17 tasks.

- Measured at landing: **102 sites across 84 files** (the plan's P0 count was 86/70), 0 after.
  Entry points all resolve, all consumed: `.` 41, `/format` 24, `/setting-keys` 12, `/sanitize` 3,
  `/slug` 4, `/manufacturers` 2.
- The allowance is `kernel-runtime-dependency-allowance` in `.dependency-cruiser.js`: a closed set
  (`zod`, `sanitize-html`) matched against `dependencyTypes: npm`, so a third runtime dependency is
  an error rather than a silenced one. Proven by narrowing the set to `zod` and watching
  `packages/contracts/src/sanitize.ts` be rejected.
- Last box, in current terms: `iranPhoneSchema` already carried its `.transform()` when this ran
  (the phone contract work landed first — the plan's "zero today" was true at P0, not at P4),
  `normalizeCityName` has its caller at `apps/admin/src/lib/actions/orders.ts`, and the money
  conversion is called at all three gateway-boundary sites. `formatRial` was **deleted** rather than
  given a caller: it was a zero-caller alias of `tomanToRial`, which is what those sites call, and
  two names for one conversion is the drift C-6 was about.

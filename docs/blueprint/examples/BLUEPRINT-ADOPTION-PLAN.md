# Blueprint adoption plan

Bringing this repo into line with [`ARCHITECTURE-BLUEPRINT.md`](../ARCHITECTURE-BLUEPRINT.md).

The blueprint is portable and permanent. **This plan is specific and disposable**: when the last
phase lands, delete it. Everything it enforces will live in `turbo.json`, `.dependency-cruiser.js`,
`ratchet.json`, and `.gitlab-ci.yml`.

Every claim below was read from the repo. Where a number appears, the command that produced it
appears with it.

## How to work this plan

**One phase per merge request**, in order. Each phase ends on a **done-when** command with an
expected output; the phase is not finished until that command produces it.

The order comes from blueprint [§17.2](../ARCHITECTURE-BLUEPRINT.md#172-audit-an-existing-repo) and
one rule drives it: **the violations are fixed before the gates land**, so no gate is ever merged
red. A gate that ships red teaches everyone to ignore it.

| Phase | What | Blueprint |
|---|---|---|
| [P0](#p0---freeze-the-findings) | Freeze the findings. No code. | §17.2 phase 0 |
| [P1](#p1---tooling) | Turborepo, `packages/config`, one root lint config, version reconciliation | §5.3, §6, §12 |
| [P2](#p2---the-three-cycles) | Extract `custody/`, break the two `materials/` file loops | §2 |
| [P3](#p3---the-gates) | CI, dependency-cruiser, boundaries, manypkg, the ratchet | §16 |
| [P4a](#p4a---rename-the-kernel) | `@noor/shared` → `@noor/contracts` | §5.4 |
| [P4b](#p4b---one-prisma-index) | One Prisma re-export index | §8 |
| [P5](#p5---the-shape) | `dto/` and `exceptions/` everywhere; archetypes assigned | §7.1, §7.3 |

---

## Part 1 - What already complies

**Nothing in this plan is a correctness fix.** Every gap is structure, drift, or enforcement. That
makes the ordering a choice about leverage rather than about risk.

These must survive the refactor unchanged:

| Blueprint rule | Evidence |
|---|---|
| **One data gateway** (founding rule 1) | No Prisma, no `DATABASE_URL`, no database client in `apps/admin` or `apps/storefront`. Both reach the API over HTTP only. |
| **§7.5 Authorize from the source of truth** | Opaque 32-byte session tokens, SHA-256 hashed in Postgres, looked up per request by `SessionGuard`, which populates `request.account.role` from that same fresh read. `RolesGuard` then reads it. No JWT anywhere. See ADR 0005 (Noor only, not included), which fixes server-side sessions as permanent: a revoked account is denied on its **next request**, not when a token happens to expire. **Do not touch.** |
| **§7.5 Guards are declarative and ordered** | `SessionGuard` then `RolesGuard`, both global via `APP_GUARD` in `auth/auth.module.ts`. Routes opt out with `@Public()`. |
| **§7.6 Every body and query has a schema** | No untyped `@Body()` or `@Query()`; all bind to a DTO class. |
| **§7.7 Docs gated to non-production** | `main.ts` builds the OpenAPI document only when `NODE_ENV !== 'production'`. |
| **§2 No lazy-resolution helpers** | `grep -rn "forwardRef" --include="*.ts" apps/api/src` → **0**. The ban costs nothing. |
| **§6 rule 2 Root holds tooling only** | Root `package.json` has one devDependency (`concurrently`) and zero runtime dependencies. |
| **§11.1 Token tiers 1-2** | `apps/admin/src/app/globals.css` defines the full primitive variable set and maps each to a semantic Tailwind 4 utility via `@theme inline`. |
| **§13 Documentation system** | `CONTEXT-MAP.md`, 16 system ADRs, per-app ADRs, `docs/research/`, `docs/agents/`. Ahead of what the blueprint asks for. |
| **§4 No client-to-database edge** | Zero today, in either client. This is the edge the gates exist to keep at zero. |

---

## Part 2 - The gaps

Reference for the phases. Each gap names the blueprint rule it fails and the phase that closes it.

### A. Type strictness has already drifted - and the gateway is the app that lost it

Fails [§5.3](../ARCHITECTURE-BLUEPRINT.md#53-config-only-package---packagesconfig). Closed by
[P1](#p1---tooling).

There is no `packages/config`. All four workspace configs are standalone:

- `apps/api/tsconfig.json` - **no `strict: true`.** It turns on `strictNullChecks`,
  `noImplicitAny`, and `strictBindCallApply` one at a time, leaving `strictFunctionTypes`,
  `strictPropertyInitialization`, `useUnknownInCatchVariables`, and `alwaysStrict` **off**.
- `apps/admin/tsconfig.json`, `apps/storefront/tsconfig.json` - `strict: true`, byte-identical.
- `packages/shared/tsconfig.json` - `strict: true`, its own CommonJS / ES2022 target.

This is exactly the failure §5.3 names. The app that quietly stopped being fully type-safe is the
one that owns every invariant in the system.

### B. Three version facts contradict each other

Fails [§6](../ARCHITECTURE-BLUEPRINT.md#6-dependency-and-manifest-rules) rules 3 and 6. Closed by
[P1](#p1---tooling).

- **Engine floors disagree.** Root `package.json:37` says `>=20.9.0`; `apps/api/package.json:9`
  says `>=22.12.0`. The root floor is simply false - the API cannot run on Node 20.
- **No `packageManager` field** anywhere. Nothing pins the npm version for CI.
- **TypeScript is declared four ways**: `^5` (admin), `^5` (storefront), `^5.7.3` (api), `^5.9.3`
  (shared). All resolve to 5.9.3 today, so nothing is broken yet. But `npm i -D typescript` now
  installs **7.0.2**, and dependency-cruiser 18 accepts `>=2.0.0 <7.0.0`. Out of range it prints
  `0 modules cruised` and **exits 0** - one routine bump would disarm the primary gate with a green
  tick. P3 depends on this being fixed first.

### C. The build is a hand-rolled task graph

Fails [§12](../ARCHITECTURE-BLUEPRINT.md#12-build-orchestration). Closed by [P1](#p1---tooling).

No task runner. The root manifest chains work with npm lifecycle hooks: `postinstall`, `predev`,
`prebuild`, `pretest`, and `pretypecheck` all call `shared:build`, and `apps/api` adds five more
`pre*` hooks calling `db:generate`. Root `build` is a literal `&&` chain naming each workspace in
order.

That chain **is** a task graph, written in the one place that cannot see the dependency graph.
Adding a fourth workspace means editing it by hand. Deleting these hooks is a P1 deliverable, not a
side effect.

### D. Three eslint configs, and the kernel is not linted at all

Fails [§12](../ARCHITECTURE-BLUEPRINT.md#12-build-orchestration) (lint is a root-only task). Closed
by [P1](#p1---tooling).

`apps/api`, `apps/admin`, and `apps/storefront` each carry an `eslint.config.mjs`.
`packages/shared` carries none, so the kernel is unlinted.

The two live configs are genuinely different, so this is real work rather than a concatenation:

- `apps/api` - `tseslint.configs.recommendedTypeChecked` plus `eslint-plugin-prettier/recommended`.
- `apps/admin` - `eslint-config-next/core-web-vitals` and `/typescript`.

The merged root config needs `files`-scoped blocks per workspace, a project service spanning all
workspace tsconfigs, and `eslint-config-next` plus `typescript-eslint` moved to root devDeps -
which §6 rule 1 requires anyway.

**Never `next lint`.** It is gone in Next 16 and this repo is on 16.2.12.

Counting these configs is a ratchet metric, and the naive command already lies: a stale worktree at
`.claude/worktrees/issue-150/` makes it report **6** instead of 3. The metric command must exclude
it.

### E. No CI

Fails [§16](../ARCHITECTURE-BLUEPRINT.md#16-enforcement-and-ci). Closed by [P3](#p3---the-gates).

No `.gitlab-ci.yml`, no `.github/`. **Every rule in the blueprint is currently document-only.**
This is the gap that makes all the others recur.

### F. Three cycles

Fails [§2](../ARCHITECTURE-BLUEPRINT.md#2-the-one-way-law). Closed by [P2](#p2---the-three-cycles).

**One folder cycle.** `materials/materials.service.ts:10` imports
`../customers/customer-links.service`, and `customers/customers.service.ts:12` imports
`../materials/material-balance`.

The root cause is a **missing module**, not a bad import. `material-balance.ts` holds two concepts:
material stock, and **custody**. Custody is already a named peer concept in
`CONTEXT-MAP.md` - the map lists it as a domain area in its own right, which is
the signal that it deserves its own folder. Its eight exports split cleanly:

| Stays as balance | Moves to custody |
|---|---|
| `contributesToBalance` | `CustodyByOwner` |
| `materialBalance` | `custodyByOwner` |
| `LotBalance`, `lotBalance` | `custodyByCustomer` |
| | `totalCustodyByMaterial` |

Both sides have real consumers, so this is a genuine seam and not a cycle dodge:

- `materials/materials.service.ts:17-19` imports `custodyByOwner` and `totalCustodyByMaterial`
- `customers/customers.service.ts:9-12` imports `custodyByCustomer` and `totalCustodyByMaterial`
- `materials/material-lots.service.ts:16` and `materials/stock-events.service.ts:19` take the
  balance half

**Two file cycles**, both in `materials/`. `opening-first-error.ts:3-4` imports both
`material-opening-must-be-first.exception.ts` and
`material-opening-already-recorded.exception.ts`, and each of those imports `openingScopeLabel`
back from `opening-first-error.ts` at line 3.

**Rejected, do not re-propose:** a `CustodyReader` port owned by `customers` and implemented by
`materials`. Binding the token would force `customers.module` to import `materials.module`,
restoring the cycle one level up, and the only other home is `app.module.ts`, which
[§7.4](../ARCHITECTURE-BLUEPRINT.md#74-composition-root) reserves for `imports` only. §2 states the
general form: a port is for a real swappable boundary, never for a loop.

### G. 127 files import the generated Prisma client directly

Fails [§8](../ARCHITECTURE-BLUEPRINT.md#8-data-tier-pattern). Closed by
[P4b](#p4b---one-prisma-index).

```bash
grep -rl "generated/prisma" --include="*.ts" apps/api/src \
  | grep -v "^apps/api/src/prisma/" | grep -v "^apps/api/src/generated/" | wc -l
# 127
```

Every one of those is a call site that must change if the generator, its `output` path, or the ORM
changes. One re-export index makes that a one-file edit.

### H. Every feature folder is a junk drawer

Fails [§7.3](../ARCHITECTURE-BLUEPRINT.md#73-feature-anatomy). Closed by [P5](#p5---the-shape).

```bash
find apps/api/src -name "*.dto.ts"       -not -path "*/dto/*"        | wc -l   # 101
find apps/api/src -name "*.exception.ts" -not -path "*/exceptions/*" | wc -l   #  90
find apps/api/src -type d -name exceptions                           | wc -l   #   0
```

The outer half of §7.3 passes - one folder per feature, no top-level `controllers/` or `services/`.
**The inner half fails everywhere.** 191 files that should be in two subdirectories are flat beside
the services, so the four files that define each feature's behaviour are invisible in the listing.

### I. Most top-level API folders have no archetype

Fails [§7.1](../ARCHITECTURE-BLUEPRINT.md#71-the-four-in-app-archetypes). Closed by
[P5](#p5---the-shape).

25 top-level directories under `apps/api/src`, 24 excluding `generated/`. Only 20 have a
`*.module.ts`; only 18 have module + controller + service. Under the old single-archetype rule, six
directories were permanent violations. The four archetypes give each one a legal shape:

| Directory | Archetype | Note |
|---|---|---|
| `cli/` | **Entrypoint** | `mint-break-glass-otp.ts:3` and `seed-super-admin.ts:2` import `../app.module`. It sits above the whole app. Nothing may import it. |
| `costing/`, `validation/`, `common/` | **Support folder** | Pure functions, no module. `validation/` has **15** consuming features; `costing/` has 2 (`receipts`, `products`). `common/` reaches outside itself **zero** times, and now also holds the OTP sender port and the SHA-256 helper. |
| `prisma/`, `revalidation/`, `media/`, `sms-ir/` | **Infrastructure module** | Module + service, or port + adapter, no controller. `sms-ir/` provides the SMS-IR sender to the `otp/` feature and exposes no HTTP surface. |
| `otp/` and the remaining 19 | **Feature** | `otp/` split out of `auth/`; the provider binding it owns is what deletes the `auth` → OTP import edge. |

`custody/` from [P2](#p2---the-three-cycles) joins the support folders: its functions take the
Prisma client as an argument rather than injecting it.

### J. Two transports, one of them dead

Fails [§10](../ARCHITECTURE-BLUEPRINT.md#10-cross-cutting-contracts). Closed by [P1](#p1---tooling).

`apps/admin/src/lib/api.ts` and `apps/storefront/src/lib/api.ts` are separate hand-rolled fetch
wrappers. The storefront one has **zero importers**.

Under [§5.5](../ARCHITECTURE-BLUEPRINT.md#55-the-package-creation-trigger) a `packages/transport`
needs two consuming workspaces. Deleting the dead file leaves one, so **no package is created**.
The admin's `lib/api.ts` stays where it is until a second real caller appears.

### K. Four colour literals in admin components

Fails [§11.1](../ARCHITECTURE-BLUEPRINT.md#111-three-tiers---always-consume-the-highest-available).
Closed by [P5](#p5---the-shape).

```bash
grep -rEoh "#[0-9a-fA-F]{3,8}" --include="*.ts" --include="*.tsx" apps/admin/src | wc -l   # 4
```

Four, not 29. The other 25 are token definitions in `globals.css`, which is where they belong. The
metric excludes stylesheets for that reason.

### L. Deleted from the previous plan

- **Extract `packages/db`.** One consumer by construction
  ([§5.5](../ARCHITECTURE-BLUEPRINT.md#55-the-package-creation-trigger)). Prisma stays in
  `apps/api`. What survives is the re-export index, now [P4b](#p4b---one-prisma-index).
- **Extract `packages/ui`.** One client uses it. It waits for the second.
- **Make `packages/shared` source-published.** The kernel stays compiled
  ([§5.2](../ARCHITECTURE-BLUEPRINT.md#52-library-package---packages)).
- **Write `ARCHITECTURE-AUDIT.md`.** `turbo run audit` is the audit
  ([§13](../ARCHITECTURE-BLUEPRINT.md#13-documentation-system)).

---

## Part 3 - The phases

### P0 - Freeze the findings

No code. Re-run every command in Part 2 and confirm the numbers still match. Where one has moved,
correct Part 2 in this merge request and nothing else.

**Done when**: every number in Part 2 reproduces from the command printed beside it.

---

### P1 - Tooling

Nothing here changes application behaviour. Land it first because P2 through P5 all run their
checks through it.

1. **Turborepo.** Root `turbo.json` holds the whole task graph: `build` (depends on upstream
   `build`, outputs declared), `dev` (persistent, uncached), `generate` (Prisma outputs declared),
   `typecheck`, `test`, `lint` (root only), `audit` (root only, added empty here and filled in P3).
   A package-level file, if any, carries `extends` and tags only.
2. **Delete the hand-rolled graph.** Remove `postinstall`, `predev`, `prebuild`, `pretest`,
   `pretypecheck`, and `shared:build` from the root manifest, and the five `pre*` hooks from
   `apps/api`. Prisma generation becomes a `generate` task the API's `build` and `typecheck` depend
   on.
3. **`packages/config`.** `tsconfig.base.json` plus one flavour per app type (gateway, client,
   library). Every workspace config becomes `extends` plus `rootDir`, `include`, `exclude`, and
   `paths` for the intra-app `@/*` alias only. **No project references, no `composite`.**
   `apps/api` gains `strict: true` - expect this to surface real errors; fix them in this merge
   request.
4. **One root `eslint.config.mjs`.** `files`-scoped blocks per workspace reproducing what each
   config does today (see [Gap D](#d-three-eslint-configs-and-the-kernel-is-not-linted-at-all)), a
   `projectService` spanning every workspace tsconfig, and `packages/shared` linted for the first
   time. Delete the three per-app configs and their `lint` scripts. Move `eslint-config-next`,
   `typescript-eslint`, and the prettier plugin to root devDependencies. One root `.prettierrc`.
5. **Reconcile versions.** One `engines.node` of `>=22.12.0` at the root, deleted from `apps/api`.
   Add `"packageManager": "npm@11.4.1"`. One exact `typescript` version at the root, removed from
   all four workspaces, chosen inside dependency-cruiser's accepted range and written into
   `.dependency-cruiser.js` as a comment beside the rule.
6. **Delete `apps/storefront/src/lib/api.ts`** (zero importers).

**Done when**:

```bash
npx turbo run typecheck lint build          # all green, from a clean checkout
grep -cE '"(pre|post)[a-z:]+"' package.json apps/api/package.json   # 0 and 0
find . -mindepth 2 -name "eslint.config.*" | grep -v node_modules | grep -v .claude/worktrees | wc -l   # 0
grep -rn '"typescript"' package.json apps/*/package.json packages/*/package.json | wc -l   # 1
```

---

### P2 - The three cycles

The only phase that moves application code. It lands **before** the gates so the gates land green.

1. **Extract `apps/api/src/custody/`.** Move `CustodyByOwner`, `custodyByOwner`,
   `custodyByCustomer`, and `totalCustodyByMaterial` out of `materials/material-balance.ts` into a
   support folder ([Gap F](#f-three-cycles)). Repoint `materials/materials.service.ts` and
   `customers/customers.service.ts`. Leave the balance half where it is.

   After the move the edges are `materials → custody`, `customers → custody`, and
   `materials → customers`. No loop.

2. **Break the two file loops.** Extract `openingScopeLabel` from
   `materials/opening-first-error.ts` into its own pure file. Both exception files and
   `opening-first-error.ts` then import the new file, and nothing imports back.

3. **Ban lazy resolution.** Add the `forwardRef` rule now, while the count is already 0.

`common/refusal-coverage.spec.ts` keys on the **top-level directory name**, so a new `custody/`
directory needs its refusal codes registered there. Nothing else in that spec is affected.

**Done when**:

```bash
./node_modules/.bin/depcruise apps/api/src --config .dependency-cruiser.js --output-type err
# 0 cycles at module and folder scope
# Use the local binary. `npx depcruise` resolves to a dependency-confusion placeholder package.

npm test -w @noor/api && npm run test:e2e -w @noor/api    # green
```

Run the invariants and integration suites against a throwaway Postgres 17 container as described in
`CLAUDE.md`. **Never point `TEST_DATABASE_URL` at the dev `noor` database** - both suites drop and
rebuild the `public` schema.

---

### P3 - The gates

Every mechanical invariant in
[§15.1](../ARCHITECTURE-BLUEPRINT.md#151-mechanical-invariants) becomes a command. All of it blocks
from day one, which is only safe because P2 already landed.

1. **`.dependency-cruiser.js`.** Four settings are load-bearing and each is a way the gate passes
   while checking nothing
   ([§16.1](../ARCHITECTURE-BLUEPRINT.md#161-the-audit-task)):
   - `tsPreCompilationDeps: true`. Measured on `apps/api/src`, excluding specs, generated code, and
     `node_modules`: **699 local edges with the default, 853 with it on**. Those 154 invisible edges
     are `import type` edges, which is exactly the shape of the client-to-database edge these rules
     exist to prevent.
   - Two cycle rules. `scope` is a rule-level key and defaults to `module`. Verified against this
     repo: the module-scope rule reports the two `opening-first-error.ts` loops, and only the
     folder-scope rule reports `materials ⟷ customers`.
   - Exclude `\.spec\.ts$` ([§7.2](../ARCHITECTURE-BLUEPRINT.md#72-file-kind-rank)). 76 spec files,
     37 of them importing across a feature line, all legitimate.
   - A wrapper asserting the cruised-module count is greater than zero, paired with the pinned
     TypeScript from P1.

   Rules to encode: tier rank ([§4](../ARCHITECTURE-BLUEPRINT.md#4-tier-rank)), the four in-app
   archetypes ([§7.1](../ARCHITECTURE-BLUEPRINT.md#71-the-four-in-app-archetypes)), file-kind rank
   ([§7.2](../ARCHITECTURE-BLUEPRINT.md#72-file-kind-rank)), no source file importing `cli/` or
   `main.ts`, and no file outside `prisma/` importing a `generated/` path (as a **warning** until
   P4b, since 127 files still do).

2. **`turbo boundaries`.** Workspace tags and package cycles. It does catch a workspace cycle
   (`Circular package dependency detected: api -> contracts -> api`); it does **not** see ADR 0017 (Noor only, not included).
   file-level cycles or intra-app structure, which is why dependency-cruiser is primary. It owns
   the `@boundaries-ignore` directive, and
   [§18](../ARCHITECTURE-BLUEPRINT.md#18-deviation-register) plus the CLAUDE.md carve-out require a
   reason on the same line.

3. **`manypkg`.** Root has no runtime dependency; a peer dependency implies a dev dependency; one
   version per tool across workspaces.

4. **`ratchet.json`**, seeded at today's counts. Every command carries its own excludes:

   | Metric | Command | Seed | Target |
   |---|---|---|---|
   | `flat-dto` | `find apps/api/src -name "*.dto.ts" -not -path "*/dto/*" \| wc -l` | 101 | 0 |
   | `flat-exception` | `find apps/api/src -name "*.exception.ts" -not -path "*/exceptions/*" \| wc -l` | 90 | 0 |
   | `stray-tool-config` | `find . -mindepth 2 -name "eslint.config.*" \| grep -v node_modules \| grep -v .claude/worktrees \| wc -l` | 0 after P1 | 0 |
   | `colour-literal` | `grep -rEoh "#[0-9a-fA-F]{3,8}" --include="*.ts" --include="*.tsx" apps/admin/src \| wc -l` | 4 | 0 |
   | `suppression` | `grep -rn "boundaries-ignore" --include="*.ts" --include="*.tsx" apps packages \| wc -l` | 0 | 0 |

   **The command is the metric.** Two of these already produced a wrong number from an
   almost-right command: the config count doubles without the worktree exclude, and the colour
   count is 4, 29, or 25 depending on whether stylesheets are scanned.

5. **`.gitlab-ci.yml`.** One pipeline, every job blocking:
   `install → typecheck → lint → test → audit → build`. `test:invariants` and `test:integration`
   get their own job with a `postgres:17` service and a dedicated `TEST_DATABASE_URL`. It runs on
   `dev_deployment` and `master` only, not on merge requests - see ADR 0017 (Noor only, not included).

**Done when**:

```bash
npx turbo run audit     # exits 0, and reports a non-zero cruised-module count
```

and a merge request with a deliberate upward import is blocked by the pipeline.

---

### P4a - Rename the kernel

`@noor/shared` → `@noor/contracts`, and `packages/shared` → `packages/contracts`. 51 files in the
API import it, plus the clients.

Mechanical. Split from P4b because they touch different import specifiers and neither depends on
the other, so two small diffs review better than one 178-file diff. There is no broken intermediate
state: the typecheck proves it landed.

**Done when**:

```bash
grep -rn "@noor/shared" --include="*.ts" --include="*.tsx" --include="*.json" apps packages | wc -l   # 0
npx turbo run typecheck test audit    # green
```

---

### P4b - One Prisma index

Give `apps/api/src/prisma/` a single index that re-exports the generated client, its enums, and the
`Prisma` namespace. Repoint all 127 files. Promote the dependency-cruiser rule from P3 from
**warning** to **error**, and add the filesystem gate that covers `apps/api/test`, which the
cruiser graph cannot see.

Keep `generator client { output = ... }` explicit in the schema so the generated path never lands
in `node_modules`.

**Done when**:

```bash
grep -rl "generated/prisma" --include="*.ts" apps/api/src apps/api/test \
  | grep -v "^apps/api/src/prisma/index.ts" | grep -v "^apps/api/src/generated/" | wc -l   # 0
npx turbo run typecheck test audit    # green
```

---

### P5 - The shape

The largest diff and the lowest risk: file moves and import rewrites only.

1. **`dto/` and `exceptions/` in every feature.** 101 DTOs and 90 exceptions move. Drive both
   ratchets to 0 and promote their rules to errors.
2. **Assign every top-level directory an archetype** per [Gap I](#i-most-top-level-api-folders-have-no-archetype), and turn the archetype rules
   in `.dependency-cruiser.js` from warnings into errors.
3. **Replace the four admin colour literals** with tokens. Drive that ratchet to 0.
4. **Rank `apps/storefront` as a tier 3 client.** No reshaping - it is nine files and nobody is
   building it. Ranking it is what keeps a second architecture from growing there
   ([§4](../ARCHITECTURE-BLUEPRINT.md#4-tier-rank)).

Apply the moves with a script carrying **one `assert` per site**, so an unmatched path aborts the
run instead of silently doing nothing.

`common/refusal-coverage.spec.ts` keys on the top-level directory name, so moving files into `dto/`
and `exceptions/` inside a feature leaves it untouched.

**Done when**:

```bash
npx turbo run audit     # every ratchet at 0, every archetype rule an error
```

---

## Part 4 - When this plan is done

Delete this file. Then delete the phase table from it first if you want a record - but the record
that matters is `turbo.json`, `.dependency-cruiser.js`, `ratchet.json`, and `.gitlab-ci.yml`, all of
which fail loudly and cannot go stale.

What stays: the blueprint, and a short companion doc recording this repo's concrete choices - actual
ports, actual archetype assignment per directory, actual token values -
per [§13](../ARCHITECTURE-BLUEPRINT.md#13-documentation-system).

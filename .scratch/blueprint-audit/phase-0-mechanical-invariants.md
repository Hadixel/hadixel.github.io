# §15.1 mechanical invariants — measured by hand

Companion to `phase-0-measurements.md`. Phase 0 (measure) only; **no repo code changed**.
Method: one-off commands and two throwaway scripts in `/tmp`, implementing the same semantics as
`docs/blueprint/reference/scripts/` (`audit-app-root.js`, `audit-client-structure.js`,
`client-structure-config.js`, `.dependency-cruiser.js`), with Noor's paths replaced by this repo's.
`dependency-cruiser`, `manypkg` and `turbo boundaries` were **not** run — they are not installed, so
the rules they own were reproduced by hand and are marked where the reproduction is weaker.

Verdict key: **PASS** · **FAIL** · **N/A** (rule presupposes a gateway; none exists) ·
**VACUOUS** (no instances to violate) · **UNVERIFIABLE** (needs a live DB or a rank assignment).

## Scoreboard

| Group | PASS | FAIL | N/A | VACUOUS | UNVERIF |
|---|---|---|---|---|---|
| Boundaries | 6 | 4 | 1 | — | 1 |
| Structure | 3 | 4 | 3 | — | — |
| Documentation | 1 | 2 | — | — | — |
| API | 2 | 1 | 1 | 2 | — |
| Data | 1 | 0 | — | — | 1 |
| Design system | 0 | 2 | — | — | — |
| Build | 4 | 5 | — | — | — |
| **Total** | **17** | **18** | **5** | **2** | **2** |

---

## Boundaries

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 1 | No cycle at file, module or folder scope | **PASS** | 237 files / 426 local edges (relative + `@/` + dynamic `import()`), type-only edges included. File-scope SCC: 0. Folder-scope SCC in both clients: 0. Workspace package cycles: 0. |
| 2 | No import crosses a tier rank upward | **UNVERIFIABLE** | **No tier rank is recorded anywhere in the repo** (§4: *an unranked workspace is where a second architecture grows*). Observed workspace edges: `admin→{db,schema,ui,adapters,scraper}`, `store→{db,schema,ui,adapters}`, `db→schema`, `ui→schema`. `adapters` and `scraper` have no edge to `schema` and no rank assigned. Cannot be checked until §4's table is written. |
| 3 | No client imports the database client, incl. type-only | **FAIL** | 66 sites / 61 files: 62 value imports + 4 type-only. Type-only: `apps/admin/src/lib/actions/ctx.ts:5`, `apps/store/src/components/{mobile-category-filter.tsx:6, product-listing.tsx:1, category-sidebar.tsx:2}`. Both Next configs also list it in `transpilePackages` (`store:38`, `admin:11`). |
| 4 | No file outside the data-client index imports a `generated/` path | **PASS (note)** | Only two files do: `packages/db/src/index.ts:1-3` (the index) and `packages/db/src/client.ts:2`. Both are inside the data workspace, which §8 explicitly sanctions. The note: **two** entry points into `generated/`, not the one index §8/§5.2 require — `client.ts` should import the index, or vice versa. |
| 5 | No source file imports an entrypoint | **N/A** | No gateway, no process entry. |
| 6 | Kernel has zero runtime dependencies | **FAIL as written** | `packages/schema` (the kernel) has `dependencies: { zod, sanitize-html }`. **This is a blueprint tension, not a repo bug:** §10 *Validation split* mandates *a schema library in the kernel*, and §4 puts the kernel at tier 1 *depends on nothing*. Both cannot hold literally. The check needs an explicit, named allowance (e.g. kernel may depend on the declared validation library) before it can land green. |
| 7 | Every dependency declared where imported; root manifest has no runtime dep | **PASS** | Resolved every bare specifier in all 7 workspaces against that workspace's own manifest: **0 undeclared** (1 regex false positive at `apps/admin/src/components/scraper-panel.tsx:531`, hand-checked). Root `package.json` has only `turbo` in `devDependencies`, no `dependencies` key at all. §6 rule 1 holds today — the one dependency-declaration risk is the version drift in #11, not phantom hoisting. |
| 8 | Every workspace tsconfig is `extends` + local-only keys | **FAIL (7/7)** | No tsconfig has `extends`. Restated `compilerOptions`: 14 keys each in `apps/store` and `apps/admin`, 9 in `packages/scraper`, 8 in `packages/ui`, 7 each in `db`/`schema`/`adapters`. `packages/scraper/tsconfig.json` differs from its siblings in `target` (ES2024 vs ES2022), `lib`, and `moduleResolution` casing (`Bundler` vs `bundler`). No `packages/config` exists. |
| 9 | No lint or formatter config outside the repo root | **PASS** | 0. The 3 hits are `docs/blueprint/reference/{.prettierrc,.prettierignore,eslint.config.mjs}` — the kit, not repo config. Any future `stray-tool-config` command **must** exclude `docs/blueprint/`, written into `ratchet.json` (§15.3 rule 1: the command is the metric). |
| 10 | One `engines` floor and one `packageManager`, root only | **PASS** | Root: `node >=20.9.0`, `pnpm@11.20.0`. 0 of 7 workspaces declares either. |
| 11 | One compiler version, one linter version, at the root only | **FAIL** | `typescript` in 7/7 workspaces, `vitest` in 4, `next` in 3; root declares only `turbo`. There is **no linter at all** — so "one linter version" has nothing to unify, and §6 rule 2's "a lint plugin used by the one root lint config is a root dependency" has no instance. |
| 12 | Internal link protocol matches the package manager | **PASS** | All 12 internal links use `workspace:*`; no `*`, no `file:`, no `link:`. |

## Structure

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 13 | Gateway `src` root holds only the 3 legal file kinds | **N/A** | No gateway. |
| 14 | Every gateway top-level directory named in the archetype lists | **N/A** | No gateway. |
| 15 | No file kind twice at a feature folder's top level | **N/A** | No gateway features. |
| 16 | Every app workspace root entry is in the §5.1 fence | **FAIL** | `apps/store`: illegal files `components.json`, `PRODUCT.md`; illegal dirs `.impeccable/`, `tests/`. `apps/admin`: illegal dir `tests/`. Reproduced with the reference's own allowlist shape (`client-structure-config.js:10-42`). Note both apps also lack `.env.example`, which the fence names — an absence the reference check does not test. |
| 17 | Every file at a client `src` root is a framework root entry or pre-boot init | **PASS** | Both `apps/store/src` and `apps/admin/src` have **0** loose files. |
| 18 | Every file directly inside a route directory is a route file or its co-located test | **FAIL** | `apps/store` **6**: `global-error.tsx`, `providers.tsx`, `account/account-login.tsx`, `account/account-area.tsx`, `checkout/checkout-client.tsx`, `showcase-theme.css`. `apps/admin` **12**: `login/login-form.tsx`, `change-password/change-password-form.tsx`, and 10 under `(panel)/` — `{pages/delete-page, inventory/adjust-form, blog/delete-post, discounts/delete-discount, orders/[id]/transitions, orders/new/form, collections/collections-manager, categories/categories-manager, media/media-library, media/media-upload}.tsx`. Applied the reference's exemptions (`routeMetadataPatterns`, `globals.css`): `icon.png`, `apple-icon.png`, `robots.ts`, `sitemap.ts`, `globals.css` correctly excluded. `showcase-theme.css` is **not** exempt by the reference's config — it is a second stylesheet at a route root and would need either an allowlist entry or a move. |
| 19 | No directory name appears twice in a client's `src` at depth 1–2 | **PASS** | Ran the reference algorithm verbatim (`collectDirNames` + `checkFeatureOneRootPerFeature`, with `unscanned={app,test}`, `exempt={components,lib,hooks,state}`). 0 duplicates in both clients. Per §15.4/§15.2 this is a **proxy**: it cannot see a split feature whose two trees are named differently, and C-1 below shows the tree is not split — it is unfeatured. |
| 20 | A `"use server"` module exports nothing but an async function | **FAIL (2 of 7)** | `apps/admin/src/lib/actions/auth.ts:10` `export interface ActionState`; `apps/admin/src/lib/actions/ctx.ts:10` `export interface ActionCtx`. The other 5 modules are clean. `apps/admin/src/lib/actions/form-helpers.ts` matches a naive `"use server"` grep but is deliberately **not** a server-action module (line 1 comment) — its 4 sync exports are correct, and the real check must match the directive, not the substring. The current dev build is green, so this Next version tolerates type-only exports; the gate should encode what the framework actually rejects. |

## Documentation

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 21 | Exactly one docs entry point per surface root | **FAIL (2 of 3)** | Repo root: `CLAUDE.md` only — PASS. `apps/store`: `AGENTS.md` + `CLAUDE.md`. `apps/admin`: `AGENTS.md` + `CLAUDE.md`. In both apps the `CLAUDE.md` is a one-line `@AGENTS.md` alias, and that `AGENTS.md` is a `next dev`-generated block (`apps/store/AGENTS.md:1-10` names `generate-agent-files.js` and says it is re-added on every dev run) — so the "index" is tool output, not a hand-written pointer to per-surface docs. |
| 22 | Every document under `docs/` is linked from the docs index | **FAIL** | `docs/index.md` does not exist. 7 documents are therefore unlinked: `docs/adr/0001-showcase-design-language.md`, `docs/adr/0002-heroui-component-stack.md`, `docs/agents/{domain,issue-tracker,triage-labels,admin-qc-notes,price-list-debug-notes}.md`. |

## API

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 23 | Every `*.dto.ts` is inside a `dto/` directory | **VACUOUS** | 0 files repo-wide. No gateway means no request contracts; the rule is satisfied by absence and guards nothing today. |
| 24 | Every `*.exception.ts` is inside an `exceptions/` directory | **VACUOUS** | 0 files repo-wide. |
| 25 | No lazy-resolution helper (`forwardRef` and equivalents) | **PASS** | 0 occurrences. The one dynamic import, `packages/scraper/src/pipeline.ts:413` `import("./price-list")`, is a code split with a static import also present, not a lazy-resolution helper. |
| 26 | The composition module declares `imports` only | **N/A** | No gateway composition module. |

## Data

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 27 | Applied migrations are unmodified | **PASS (unbacked)** | One migration, `packages/db/prisma/migrations/0001_init/migration.sql`; `git log --follow` shows **1 commit ever touched it** (`ca169e3`). It is a squashed baseline, consistent with §8's milestone squash. Passes by construction — there is no CI job to keep it true. |
| 28 | The migration drift diff is empty | **UNVERIFIABLE** | Requires `prisma migrate diff` against a live database. Not run, and there is no CI (below) to run it. `prisma.config.ts:10` reads `DATABASE_URL` with a `!`, so a missing env is a runtime throw, not a config error. |

## Design system

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 29 | No colour literal in a component (token file excluded) | **FAIL** | `apps/store`: **1** — `apps/store/src/components/product-buy-box.tsx:156`, an inline `style={{ backgroundColor: variant.colorCode ?? "#d7d7d7" }}`, a genuine §11.1 violation. `apps/admin`: **6** — `apps/admin/src/lib/scraper-import.ts:28-33`, a product colour-palette lookup (`black`/`white`/`gray`/`beige`/`silver`/`steel` with Persian labels). Those are **domain data, not styling**, in `lib/` rather than a component. A gate with a component-shaped scope would clear admin; the raw §15.3 command would not. That scope decision has to be made explicitly, or the ratchet will sit at 6 for ever on a number that means nothing. |

## Build

| # | Rule | Verdict | Evidence |
|---|---|---|---|
| 30 | Every workspace joins the task graph by script name; no per-package graph config | **PASS** | 0 per-package `turbo.json`. Joining is by script name only. |
| 31 | Every build output directory is declared | **PASS (corrected)** | `turbo.json` declares `.next/**`, `!.next/cache/**`, `dist/**`. The only real build output is `.next/` in the two apps; no workspace produces `dist/` (all ship source — a separate finding, §5.2). My first pass flagged `packages/scraper/out/` as an undeclared output; that was wrong — it is 5 gitignored JSON/image files of **scrape runtime output**, not build output. |
| 32 | No secret is available at build time | **FAIL** | `apps/store/next.config.ts:7` and `apps/admin/next.config.ts:7` both `loadDotenv({ path: path.resolve(process.cwd(), "../../.env") })` inside the framework config, so the root `.env` (which the adjacent comment says holds `DATABASE_URL`) is read during `next build` and lands in `.next`. No `.env.example` exists anywhere, so no variable is tiered or documented (§12). |

### Further §12 findings not in the §15.1 list

- **`turbo.json` declares no `test` task and no `audit` task.** §12 requires `lint, typecheck, test` as leaf tasks and `audit` as the root task. Only `build`, `dev`, `lint`, `generate`, `typecheck` exist. Three test files (`apps/store/tests/*`, `apps/admin/tests/security.test.ts`) therefore never run in the graph.
- **The `lint` task is declared but unsatisfiable.** `turbo.json:12` defines it; `grep '"lint"'` across all 7 manifests returns 0. `pnpm lint` → `turbo lint` matches no package.
- **`generate` opts out of the cache.** `turbo.json:14-16` sets `cache: false`; §12's table says `generate` declares generated paths as *outputs* *so codegen participates in the cache*. `packages/db` has `generate: prisma generate` and writes `packages/db/src/generated` (gitignored).
- **`dev` is missing `dependsOn: ["^build"]`.** `turbo.json:8-11` has `cache: false, persistent: true` only.

---

## Corrections to `phase-0-measurements.md`

1. **The blueprint kit moved** from `blueprint/` to `docs/blueprint/` between the two passes. The `stray-tool-config` ratchet baseline is therefore **0 in repo source** (3 with the kit counted, all under `docs/blueprint/reference/`). Finding C-7 stands but its paths changed.
2. **`packages/scraper/out/` is not an undeclared build output** (see #31 above).
3. **New, not previously reported:** a stray directory literally named `local:` sits at the repo root, containing one file, `local:/admin-spec.md` (9,997 bytes, dated Aug 6). It is almost certainly the result of a `local://` artifact being written to disk with its scheme intact. No §5.1 rule governs the repo root, so it is not a fence violation — but it is untracked junk and should be deleted or its content moved, and it is worth finding what wrote it.
4. The repo also gained `tracker/` and `scripts/extract-catalog.mjs` relative to my first structural map. `scripts/` holds a single ad-hoc script with no test, no `audit.sh`, and no wiring into `turbo.json` — consistent with finding B-1 (no enforcement layer), and worth knowing before Phase 1 so the script is either kept deliberately or deleted as dead weight.

## Still unanswerable without a decision

- **Rule 2** needs the §4 rank table written before it can be checked at all. Writing that table is a decision, not a measurement, and it is the input to the §16.1 tier rules.
- **Rule 6** needs a decision on the §4-versus-§10 kernel contradiction, or the check lands red on a design §10 requires.
- **Rule 29** needs a scope decision (component source only, or all of `src/`) that determines whether admin's baseline is 0 or 6.

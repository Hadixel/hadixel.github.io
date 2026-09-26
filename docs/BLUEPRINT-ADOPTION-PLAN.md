# Blueprint adoption plan

Bringing this repo into line with [`ARCHITECTURE-BLUEPRINT.md`](blueprint/ARCHITECTURE-BLUEPRINT.md).

The blueprint is portable and permanent. **This plan is specific and disposable**: when the last
phase lands, delete it. Everything it enforces will live in `turbo.json`, `.dependency-cruiser.js`,
`ratchet.json`, and the CI pipeline.

Every claim below was read from the repo. Where a number appears, the command that produced it
appears with it. The full finding set, with a line number for each, is in
`.scratch/blueprint-audit/findings-register.md`; this plan groups it into phases.

## Target shape

Three surfaces, one data gateway. Today the storefront and the admin panel are both *clients of the
database*; the blueprint makes them clients of **one** gateway, which is what founding rule 1 is for.

| Workspace | Tier | After | Note |
|---|---|---|---|
| `apps/api` | 3 | **new** | The gateway. Owns the schema, the generated client, the migrations, the seeds, and every write. Port **3102** |
| `apps/store` | 3 | unchanged | Public storefront. Speaks HTTP to `apps/api` |
| `apps/admin` | 3 | unchanged | Internal panel. Speaks HTTP to `apps/api` |
| `apps/scraper` | 3 | moved from `packages/scraper` | An app, not a library: three executables, a `README.md`, `out/`, `tests/`. Touches no database — it writes `catalog.json`, and the gateway's seed reads it |
| `packages/contracts` | 1 | renamed from `packages/schema` | The kernel. §5.4: name it `contracts`, not `shared` |
| `packages/transport` | 2 | **new** | `createApiClient(tokenName)`. §5.5's trigger is met the moment both clients call the gateway |
| `packages/ui` | 2 | unchanged | Two consumers — the trigger holds |
| `packages/config` | off-graph | **new** | `tsconfig.base.json` plus one flavour per app type |
| `packages/db` | — | **dissolved** | §5.5: a database package does not exist. Its contents become the gateway's data tier |
| `packages/adapters` | — | **dissolved** | After the migration every consumer is inside `apps/api`, so one consumer by construction. Becomes four infrastructure folders: `storage/`, `payments/`, `sms/`, `shipping/` |

**Rank table, written once, in the deviation register's sibling doc** (§4 says an unranked workspace
is where a second architecture grows; today nothing is ranked).

**If the admin is meant to be excluded from the gateway and keep its own database access, that is a
deviation, not a variant**: it needs a §18 register row, a reason, and a decision on whether that
copies. This plan assumes the single gateway, because that is founding rule 1.

## How to work this plan

**One phase per merge request**, in order. Each phase ends on a **done-when** command with an
expected output; the phase is not finished until that command produces it.

The order comes from blueprint §17.2 and one rule drives it: **the violations are fixed before the
gates land**, so no gate is ever merged red. A gate that ships red teaches everyone to ignore it.

| Phase | What | Blueprint |
|---|---|---|
| [P0](#p0---the-measurement-done) | Measure. No code. **Done** | §17.2 phase 0 |
| [P1](#p1---tooling) | `packages/config`, one root lint config, version reconciliation, the missing tasks | §5.3, §6, §12 |
| [P2](#p2---the-gateway-and-the-boolean-violations) | `apps/api`, the data path closed, every boolean invariant made true | §3, §4, §7, §8 |
| [P3](#p3---the-gates) | dependency-cruiser, turbo boundaries, manypkg, the ratchet, CI | §16 |
| [P4](#p4---the-kernel) | `packages/schema` → `packages/contracts`; one generated-client index | §5.4, §8 |
| [P5](#p5---the-shape) | Feature roots, archetypes, `_components/`, one token layer, ratchets to 0 | §7.1, §7.3, §9.4, §11 |

P2 is the whole plan. It is one large phase split into the merge requests below, and every
correctness finding in the register closes inside it — because the rules it complains about are
exactly the rules that move into the gateway's services.

---

## Part 1 - What already complies

These must survive the migration unchanged. Each is load-bearing, and losing one during a refactor of
this size would cost more than it is worth.

| Blueprint rule | Evidence |
|---|---|
| **§2 Acyclic graph** | 237 source files, 426 local edges (relative, `@/`, and dynamic `import()`, type-only edges included). File-scope SCC **0**, folder-scope SCC **0** in both clients, workspace cycles **0**. The migration adds edges; it must not add a loop |
| **§6 rule 1 Declare where you import** | **0 undeclared imports** across all 7 workspaces. Every bare specifier resolves to that workspace's own manifest. Do not lose this |
| **§2 No lazy-resolution helpers** | `grep -rn "forwardRef\|require(['\"]\./" --include="*.ts" --include="*.tsx" apps packages \| wc -l` → **0**. The ban costs nothing here |
| **§3 rule 4 One composition root** | `packages/db/src/client.ts:23-29` is a single `globalThis` client, the only place a `PrismaPg` adapter is constructed (`:15`). It moves to the gateway intact and gains a composition root around it |
| **§8 Consumers use the index** | `@kmodern/db/` and `generated/prisma` → **0 matches** across both apps, the seeds, the scraper and `scripts/`. All 64 in-`src` consumers use the bare specifier. Only `packages/db/src/client.ts:2` reaches `generated/` beside the index, and P4 fixes that |
| **§2 Ports guard real boundaries** | `packages/scraper/src/sources.ts:16-27` `SourceAdapter`, **2 implementers** (`:78` datees HTML crawl, `schuffel.ts:303` WordPress JSON API), registry at `:226`. Two protocols, one interface. **0 ports exist to dodge a cycle.** Do not re-propose one in the gateway |
| **§12 A caching task runner already owns the graph** | `turbo.json` exists. No hand-rolled `pre*`/`post*` chain to delete — P1 is smaller here than in most repos |
| **§5.5 Two consumers justify `packages/ui`** | Store imports it in 11 files, admin in 1. The package stays |
| **§10 The kernel is real and consumed** | `packages/schema` → `packages/contracts`: zod schemas, `format.ts`, `jalali.ts`, `iran.ts`, `sanitize.ts`, `setting-keys.ts`, four declared entry points, **86 import sites across 70 files** |
| **§8 One migration, immutable, squashed** | `packages/db/prisma/migrations/0001_init/migration.sql`, **1 commit ever** (`ca169e3`), a single squashed baseline |
| **§13 One entry point at the repo root** | `CLAUDE.md` only. It carries working rules as well as links, which is the blueprint's own standing-deviation shape — record it rather than restructure it |
| **§9.2 Each client is internally consistent** | The admin has one mutation path (server actions), one result signal (`ActionState`), one invalidation idiom (`router.refresh()`, 19 sites), one read path. The store is server-first with islands. Both coherent; neither documented — that is P5 |
| **§15.1 `generated/` discipline** | Only 2 files reach `generated/`, both inside the data workspace |
| **§10 RTL and locale as a first-class concern** | Direction is structural in the root layout, tokens are one shared file, and Jalali helpers exist in `packages/schema/src/jalali.ts` and `apps/admin/src/lib/date.ts:24-70` — they are simply bypassed at 14 call sites (P5) |

---

## Part 2 - The gaps

Each gap names the blueprint rule it fails and the phase that closes it. Severity is **C** (correctness
risk), **D** (drift risk), **K** (cosmetic) as recorded in the findings register.

### A. There is no gateway, and three write paths enforce different rules — **C**

Fails [§3](../blueprint/ARCHITECTURE-BLUEPRINT.md#3-the-five-founding-rules) rule 1, §4, §8. Closed by
[P2](#p2---the-gateway-and-the-boolean-violations).

```bash
grep -rn "@kmodern/db" --include="*.ts" --include="*.tsx" apps | wc -l    # 66 files, 66 sites
grep -rn 'import type.*@kmodern/db' --include="*.ts" --include="*.tsx" apps | wc -l   # 4
```

66 client files reach the database. 4 of those edges are **type-only** — `apps/store/src/components/category-sidebar.tsx:2`,
`product-listing.tsx:1`, `mobile-category-filter.tsx:6`, `apps/admin/src/lib/actions/ctx.ts:5` — which is
the exact shape §16.1 says the gate must be configured to see. Two clients also bundle the data
package into the app: `apps/store/next.config.ts:38`, `apps/admin/next.config.ts:11`.

The surface to rebuild behind one gateway:

| Today | Count | Where |
|---|---|---|
| Storefront route handlers | **8** | `apps/store/src/app/api/{auth/logout, cart/enrich, checkout, checkout/preview, otp, search, orders/[id]/pay, orders/[id]/pay/callback}/route.ts` |
| Admin route handlers | **6** | `apps/admin/src/app/{logout, api/admin/media, api/admin/media/upload, api/admin/scraper, api/admin/scraper/import, api/admin/scraper/prices}/route.ts` |
| Admin server actions | **27** | 7 `"use server"` modules under `apps/admin/src/lib/actions/` (`ctx.ts`'s single export is a helper, not an action) |
| Admin pages reading the DB directly | **24** | `apps/admin/src/app/(panel)/**/page.tsx` |
| Storefront files reading the DB directly | **20** | 5 pages, 8 `lib/` modules, 5 components, `app/sitemap.ts` |

### B. The same domain rules are implemented two or three times, sometimes with different guarantees — **C**

Fails §2, §3 rule 5, §10. Closed by [P2](#p2---the-gateway-and-the-boolean-violations) — these are the
rules that become named gateway services.

| Rule | Copies | The risk |
|---|---|---|
| **Order stock lifecycle** | `apps/store/src/lib/orders.ts:138,168,183,196` and `apps/admin/src/lib/inventory.ts:40,63,83,104,121` | The store copy has **no transaction and no compare-and-set**; the admin copy has both. `admin/lib/inventory.ts:6-7` claims they "can never disagree on stock math" |
| **Payment settlement** | `apps/store/src/app/api/orders/[id]/pay/callback/route.ts:18-25, 34-49, 51-58` | Writes `paymentStatus` **three times non-transactionally**, interleaved with three stock mutations. A duplicate callback can interleave `commitStock` and `releaseStock`. The admin twin does it correctly at `apps/admin/src/lib/actions/orders.ts:48-56` |
| **Order transition tables** | `apps/admin/src/lib/actions/orders.ts:14-27` and `apps/admin/src/app/(panel)/orders/[id]/transitions.tsx:14-28` | Byte-identical, server and client. The UI can offer a transition the server rejects |
| **Low-stock predicate** | `apps/admin/src/app/(panel)/{inventory/page.tsx:18,41, layout.tsx:16-17, page.tsx:17-24}` | Three copies, same setting key, same default `3`. Change one and the badge, the page header and the dashboard disagree |
| **`sameOrigin` CSRF check** | `apps/admin/src/app/api/admin/scraper/import/route.ts:14-25`, `scraper/route.ts:30-40`, `scraper/prices/route.ts:19-29`, `api/admin/media/upload/route.ts:21-32` | A security control copy-pasted four times, untested |
| **TOMAN→Rial** | `apps/store/src/app/api/orders/[id]/pay/route.ts:30` and `…/callback/route.ts:29` | A bare `* 10` at the two places a real payment amount is formed. The shared function exists at `packages/schema/src/format.ts:17-20` with **0 callers** |
| **Phone contract** | 5 regexes, **0 normalisers** | `packages/schema/src/index.ts:380` (a duplicate of `:391`), `apps/store/src/components/auth-modal.tsx:8`, `apps/store/src/app/checkout/checkout-client.tsx:243`, `apps/admin/src/app/(panel)/orders/new/form.tsx:73`, `apps/admin/src/lib/actions/settings.ts:96`. `Customer.phone` is a **unique key** (`apps/store/src/lib/auth.ts:58-61`) reached by an unnormalised path |
| **Order totals** | `apps/store/src/lib/orders.ts:87` vs `apps/admin/src/lib/actions/orders.ts:172-177` | The admin recomputes inline and hardcodes `discountAmount: 0` |
| **Order numbering** | `apps/store/src/lib/orders.ts:70-77` vs `apps/admin/src/lib/order-number.ts:7-13` | Same rule, two homes, different names |
| **Jalali dates** | `apps/admin/src/lib/date.ts:24-70` vs `apps/admin/src/app/(panel)/products/page.tsx:127` vs 3 store routes | Three implementations; two of them use server-local time |
| **`faDigits`** | `packages/schema/src/format.ts:6-8`, `apps/admin/src/lib/date.ts:44`, `apps/admin/src/components/ui.tsx:306` | Byte-identical, three copies, imported through two specifiers |
| **Brand / slug canonicalisation** | 4 and 3 respectively | `packages/scraper/src/price-list.ts:430-443`, `packages/scraper/src/sources.ts:226`, `packages/db/seed/update-home-deals.ts:25`, `apps/admin/src/lib/scraper-import.ts:78-80`; slugs at `apps/admin/src/lib/scraper-jobs.ts:314`, `scraper-import.ts:78-80`, `apps/admin/src/lib/actions/content.ts:236` |
| **Session revocation** | `apps/store/src/lib/auth.ts:68-80` vs `apps/store/src/app/api/auth/logout/route.ts:12-16` | The store's auth module opens a session and exposes no revoke; the route re-implements it |
| **Settings schema** | 3 | `packages/schema/src/setting-keys.ts`, `apps/admin/src/lib/actions/settings.ts:17-64`, `apps/admin/src/app/(panel)/settings/page.tsx:64`. One new key = three edits |

**One decision covers most of this table**: the gateway owns the rules, and both clients call it. A
rule that exists once in `apps/api/src/<feature>/<feature>.service.ts` cannot drift, because there is
no second copy to drift from.

### C. Two data scripts are neither idempotent nor refusing — **C**

Fails [§8](../blueprint/ARCHITECTURE-BLUEPRINT.md#8-data-tier-pattern). Closed by
[P2](#p2---the-gateway-and-the-boolean-violations), where the seeds move.

- `packages/db/seed/update-home-deals.ts:113-127` — `prisma.discount.create`, **not** an upsert, no
  uniqueness key. Every run without `--drop-demo` stacks another 15%-off discount. Removal is a
  data-dependent 24h window `deleteMany` at `:61`, so a genuine promo in that window is deleted and a
  stale-but-running one survives.
- `packages/db/seed/seed.ts:122-127` — `productSpecValue.deleteMany` +
  `categorySpecField.delete` for any field absent from the committed catalog, so `db:seed` against a
  live database deletes admin-created rows. Unconditional category renames at `:110-113`, `:139-142`.

Four scripts are already correct and are the model: `blog-import.ts:170-174` (refuses before the first
write at `:177`), `bootstrap.ts:184-191` and `:344-358`, `images.ts:28-38`,
`update-home-manufacturers.ts:22,35-37`.

### D. Secrets and missing security headers — **C**

Fails §12 (configuration tiers), §10 (security headers). Closed by P2.

- `apps/store/next.config.ts:7` and `apps/admin/next.config.ts:7` both
  `loadDotenv({ path: path.resolve(process.cwd(), "../../.env") })` **inside the framework config**,
  so the root `.env` — which the adjacent comment says holds `DATABASE_URL` — is read during
  `next build` and lands in `.next`. **No `.env.example` exists anywhere in the repo.**
- `apps/admin/next.config.ts:12-24` scopes security headers to `/media/:path*`; all 24 panel pages run
  with none. `apps/store/next.config.ts:49-58` has the global set. The two CSP literals differ, and
  §10 says that forced duplication must be recorded in the deviation register — it is not.

### E. The enforcement layer does not exist — **D**

Fails [§16](../blueprint/ARCHITECTURE-BLUEPRINT.md#16-enforcement-and-ci). Closed by
[P3](#p3---the-gates).

```bash
grep -c '"test"' turbo.json                                       # no test task
grep -rn '"lint"' apps/*/package.json packages/*/package.json | wc -l   # 0 — turbo.json declares lint, nobody implements it
ls .github 2>/dev/null || echo "no CI"
```

No `scripts/`, no `.dependency-cruiser.js`, no `ratchet.json`, no `packages/config`, no CI. **Every
rule in the blueprint is currently document-only** — which is the gap that makes all the others recur.
The three test files in the repo cannot run at all, and `apps/admin` has no `vitest.config.ts`, unlike
`apps/store/vitest.config.ts:6-7,11`, `packages/ui` and `packages/scraper`.

### F. No `packages/config`; seven hand-copied compiler configs — **D**

Fails [§5.3](../blueprint/ARCHITECTURE-BLUEPRINT.md#53-config-only-package---packagesconfig), §6 rule 2. Closed by
[P1](#p1---tooling).

No workspace config has `extends`. 14 compiler keys are restated in each app, 7–9 in each package.
`packages/scraper/tsconfig.json:2-10` has already diverged — `target: ES2024` and
`moduleResolution: "Bundler"` where its siblings use `ES2022` and `"bundler"`. `strict` is `true`
everywhere today; nothing holds it there.

### G. Tool versions declared in six manifests, and one linter that does not exist — **D**

Fails §6 rules 2, 3, 4. Closed by [P1](#p1---tooling).

`typescript` is declared in 7 of 7 workspaces, `vitest` in 4, `next` in 3; the root declares only
`turbo`. `react ^19.2.6` in both apps against `^19.2.0` in `packages/ui`'s peer range, and
`pnpm-workspace.yaml`'s `overrides` block pins four transitive packages but **no `react`** — the
two-copies-of-React failure §6 rule 4 names is unguarded. There is no linter at all, so §6 rule 2's
"a lint plugin used by the one root lint config is a root dependency" has no instance today.

### H. Every package ships TypeScript source, and one of them should not be a package — **D**

Fails §5.2 (ships build output), §5.5 (the package-creation trigger). Closed by P1 for the build
step, P2 for `packages/db` and `packages/adapters`.

- All five packages point their `exports` at `./src/*.ts` and none declares a `build` script, so
  consumers compile the library (`apps/admin/next.config.ts:11`). Non-erasable syntax in
  `packages/db/src/generated/` would surface as a load-time `SyntaxError`, not a build error.
- `packages/ui/package.json:25-28` declares `react`/`react-dom` as peers but not as devDependencies
  (`:29-34`), so its own `vitest run` has no React to render with. §5.2 wants both.
- `packages/db/package.json:8` publishes a **seed file** as a runtime subpath:
  `"./manufacturers": "./seed/iranian-manufacturers.ts"`.
- `packages/adapters` has one port (`storage.ts:46-51`, one implementer at `:53`) and three vendor
  boundaries with none; 6 of 7 consumers import a concrete vendor. After the gateway migration every
  consumer is inside `apps/api`, so §5.5 collapses the package into four infrastructure folders.

### I. The clients are filed by layer; no feature has a root — **D**

Fails [§9.4](../blueprint/ARCHITECTURE-BLUEPRINT.md#94-client-structure-conventions), §7.3. Closed by
[P5](#p5---the-shape).

Neither client has a feature root; membership is recoverable only from import edges, and each
feature's files are loose siblings across 4–7 directories. `apps/store/src/components/` holds 35
files of which 25 are single-feature; `apps/store/src/lib/` holds 7 features in 10 files;
`apps/admin/src/lib/actions/catalog.ts` holds 3 features and `content.ts` holds 3. There is no
`src/types/`, `src/features/`, `src/hooks/` or `src/state/` in either client.

**The one-root mechanical gate passes (0 duplicate names at depth 1–2) and cannot see the nine
splits**, because the two trees have different names (§15.2 says this, and D-1 in the register lists
all nine). A split feature is a judgement item, not a gate.

### J. Eighteen route-local components sit in route directories — **D**

Fails §9.4. Closed by [P5](#p5---the-shape), ratcheted from P3.

```bash
find apps/store/src/app apps/admin/src/app -name "*.tsx" -o -name "*.css"   # 18 offenders after the
# framework-metadata exemptions that audit-client-structure.js applies
```

- `apps/store/src/app/` — 6: `providers.tsx`, `global-error.tsx`, `account/account-area.tsx`,
  `account/account-login.tsx`, `checkout/checkout-client.tsx`, `showcase-theme.css`
- `apps/admin/src/app/` — 12, listed in the register under D-29

### K. Three component stacks, and a class-merge helper that does not merge — **D**

Fails §11.2, §3 rule 5, §11.1. Closed by [P5](#p5---the-shape).

Store uses HeroUI (`apps/store/package.json:15-16`); admin re-implements 15 of the 20 components
`packages/ui` already ships, in `apps/admin/src/components/ui.tsx:11-303`, with hand-rolled variant
maps and a `cn` at `:9` that is `filter(Boolean).join(" ")` — concatenation, not merge, so all ~14
admin `cn(...)` sites resolve conflicts by stylesheet order. Admin imports `@kmodern/ui` exactly once
(`apps/admin/src/components/media-picker-button.tsx:11-12`), which proves the wiring works.

The **primitive** token layer is genuinely shared with 0 divergence
(`packages/ui/tailwind.css:78-107`, imported by both). The semantic layer is store-only: 22 HeroUI
variables and 26 composed classes at `apps/store/src/app/showcase-theme.css:6-53,80-88` and
`apps/store/src/app/globals.css:60-654`; `apps/admin/src/app/globals.css` is 5 lines and defines
nothing. A store class copied into admin would compile to nothing — a silent failure.

~700 utility chains, 3 composed classes for the whole system
(`packages/ui/tailwind.css:110-120,129-131`), and **0 of the 12 most repeated** tokenized. The
notice recipe alone is hand-written 16 times across 9 files.

### L. Four token shades are used that the theme never defines — **C**

Fails §11.1. Closed by [P5](#p5---the-shape) — it is a four-line fix and can be cherry-picked earlier.

`packages/ui/tailwind.css:78-107` defines only `flame-50/100/200/600/700/800`. `text-flame-900` and
`text-flame-950` are used on the c2c payment panel
(`apps/store/src/app/order/[orderNumber]/page.tsx:77-78`), `bg-flame-500` at
`apps/store/src/components/block-renderer.tsx:273,294`, `ring-flame-300` in six admin files.
**Those utilities compile to nothing**, so the payment heading renders in the inherited colour.

### M. The documentation surface is below what §13 asks for — **D**

Fails §13, §15.1 (Documentation). Closed by [P5](#p5---the-shape).

- `apps/store/` and `apps/admin/` each carry **two** entry points (`AGENTS.md` + `CLAUDE.md`, the
  latter a one-line alias). §15.1: *exactly one, not zero, not both names.*
- `apps/store/AGENTS.md:1-9` is a `next dev`-generated block naming `generate-agent-files.js` — the
  "index" is tool output, not a pointer to per-surface docs.
- `docs/index.md` does not exist, so all 7 documents are unlinked.
- No document states either client's rendering dialect (§9.2), although the ADRs record the component
  stack in detail and the two clients have opposite mutation idioms.

### N. Dead tooling and stale paths — **K**

Closed by [P1](#p1---tooling).

- `scripts/extract-catalog.mjs:7` reads `apps/legacy-store/src/assets/assets.js`, which does not
  exist; `:12` therefore throws `ENOENT` at the first filesystem statement, and `:38` `eval`s
  substituted source. Its committed output, `packages/db/seed/catalog.json`, carries absolute paths
  from the original author's checkout. Nothing in `turbo.json` or any manifest invokes it.
- `CLAUDE.md` still lists `apps/legacy-store` as a third app.
- `apps/store/components.json:21` registers a `@react-bits` shadcn registry that was never used and
  sets `aliases.ui: "@/components/ui"`, a path that does not exist in the store. `apps/admin` has no
  `components.json` at all.
- App roots carry entries no rule names: `apps/store/PRODUCT.md`, `apps/store/.impeccable/`,
  `apps/store/tests/`, `apps/admin/tests/`. A directory named `local:` sits at the repo root holding
  one file, `local:/admin-spec.md`.
- Dead client code on the storefront's critical path:
  `apps/store/src/components/reactbits/index.tsx:137-190` and `:283-329` have no importers, and the
  module is `"use client"` at `:1`, so every consumer pulls them in. `packages/ui/src/accents/` is
  imported by neither app.
- One colour literal in a component, `apps/store/src/components/product-buy-box.tsx:156`; and 6 in
  `apps/admin/src/lib/scraper-import.ts:28-33` that are a **product colour-palette lookup**, i.e.
  domain data. The ratchet scope must say which it counts.

### O. Deliberate deviations to record, not to fix

§18 says a deviation is recorded at the violation, in the code, and in the prose register for the
standing ones. These four are decisions, and each needs a register row with a reason and a
copy-or-not answer:

1. **The admin's rendering dialect is server components + server actions, not §9.2's "client
   components + query-cache hook".** It has no query-cache library at all
   (`apps/admin/package.json:14-32`). The dialect is internally consistent across all 24 pages and 19
   invalidation sites. **Do not add a query cache to fix a blueprint table** — document the dialect
   instead. May it be copied? Yes, that is the pattern.
2. **The storefront declines cached server data.** `export const dynamic = "force-dynamic"` sits on
   all 13 public routes and `revalidatePath|revalidateTag|unstable_cache|cache(|noStore` → **0 matches**
   in `apps/`. For an SEO audience that is a decision with a performance cost, and it needs an ADR
   stating the reason. Until then it is an undocumented decision, not a deviation.
3. **The kernel holds runtime dependencies.** `packages/schema/package.json:8-11` has `zod` and
   `sanitize-html`. §4 says tier 1 depends on nothing; §10 mandates a schema library in the kernel.
   Both cannot hold literally, so the audit config needs a **named allowance** rather than a
   suppression. The `dependsOn: nothing` rule for tier 1 must be written to permit the declared
   validation library.
4. **Two component stacks survive P5.** Tokens and non-visual primitives are shared; the store keeps
   HeroUI, the admin keeps Radix primitives via `packages/ui`. §10 says a framework-required static
   literal may be copied rather than reinvented; the same reasoning applies to a deliberate visual
   split. §19 warns that a shared component library is a coupling point when design languages differ
   — the register row must say this is that case.

---

## Part 3 - The phases

### P0 - The measurement (done)

No code. The audit, the 31 mechanical invariants, the 14 judgement invariants, and the findings
register are in `.scratch/blueprint-audit/`. The register carries a file and a line for every
finding, sorted into correctness risk, drift risk and cosmetic, and its 493 line citations were
machine-verified against the tree.

**Done when**: every number in this plan reproduces from the command printed beside it. They were
captured from a working tree that already carried uncommitted changes in `apps/admin` and
`apps/store`; re-run before starting P1.

---

### P1 - Tooling

Nothing here changes application behaviour. It lands first because P2 through P5 run their checks
through it, and because §15.1's own verdict is that the boolean invariants must be true *before* the
gates.

1. **`packages/config`.** `tsconfig.base.json` plus one flavour per app type: `tsconfig.client.json`,
   `tsconfig.server.json` (the gateway — this is where `prisma.config.ts` and the Node libs live),
   `tsconfig.library.json`. Every workspace config becomes `extends` plus only `rootDir`, `include`,
   `exclude`, and `paths` for the intra-app `@/*` alias. **No project references, no `composite`.**
2. **One root `eslint.config.mjs`** with `files`-scoped blocks per workspace, a `projectService`
   spanning every workspace tsconfig, and every plugin at the root manifest. One root `.prettierrc`
   and `.prettierignore` — and the ignore must list `docs/blueprint/`, which carries the kit's own
   config.
3. **Complete the task graph.** Add `test` (a real task: three test files exist and cannot run) and
   an empty root `audit`, added here and filled in P3. Give `dev` its `dependsOn: ["^build"]`. Change
   `generate` from `cache: false` to declaring `packages/db/src/generated/**` as outputs, so codegen
   joins the cache (§12's table).
4. **Reconcile versions.** One `typescript` at the root only, removed from all 7 manifests, chosen
   inside dependency-cruiser's accepted range and written beside the rule as §16.1 requires. One
   `vitest`, one `next`, one `react` — with a `react` entry in `pnpm-workspace.yaml`'s `overrides`.
   Add `.env.example` at each app root and at the root, naming every variable and its tier (§12).
5. **Delete dead weight**: `scripts/extract-catalog.mjs`, `local:/`, `apps/store/.impeccable/`, the
   unused `reactbits` components, the dead `GetObjectCommand` import, `IMAGS_BASE`, and
   `apps/store/components.json`'s unused registry and alias.
6. **Fix the app-root fence** so the P3 gate is meaningful: move `apps/*/tests/` to a location
   `vitest.config.ts` already discovers, and relocate `PRODUCT.md` into `docs/`. §5.1 reserves
   per-concern documentation for `docs/`, so this also pre-empts M.
7. **Give the three clients one docs entry point**: delete `apps/*/CLAUDE.md` (the one-line aliases),
   keep the single `AGENTS.md` per app, and write it as a real index into the bounded-context docs.
8. **Add `react` to `packages/ui`'s devDependencies** and a `build` script to every package that
   ships one, so P2 can stop shipping source.

**Done when**:

```bash
npx turbo run typecheck test build && pnpm lint && pnpm audit   # all green from a clean checkout
# §12: lint and audit are root-only tasks, so they are root scripts, not turbo tasks. A turbo
# task nobody implements exits 0 after running nothing — a green gate that checks nothing.
node -e 'const fs=require("fs"),cp=require("child_process");const f=cp.execSync("ls package.json apps/*/package.json packages/*/package.json",{encoding:"utf8"}).trim().split("\n");const bad=f.filter(x=>Object.keys(JSON.parse(fs.readFileSync(x,"utf8")).scripts||{}).some(k=>/^(pre|post)/.test(k)));console.log(bad.length,bad.join(" "));process.exit(bad.length?1:0)'   # 0 — no pre/post lifecycle scripts
# A grep cannot make this check: '"(pre|post)[a-z:]+"' also matches the dependency named "prettier".
find . -mindepth 2 \( -name "*lint.config.*" -o -name ".prettierrc*" -o -name "prettier.config.*" \) \
  | grep -v node_modules | grep -v docs/blueprint | wc -l                # 0
grep -L '"extends"' apps/*/tsconfig.json packages/*/tsconfig.json | wc -l   # 0 — all extend packages/config
grep -rn '"typescript"' package.json apps/*/package.json packages/*/package.json | wc -l   # 1
ls apps/*/.env.example package.json                                           # all present
```

---

### P2 - The gateway and the boolean violations

The only phase that moves application code, and the whole plan. It lands **before** the gates so the
gates land green. §17.2: *closing a second data path outranks everything else here.*

Split into merge requests, each green:

1. **`apps/api`, skeleton first.** `private: true`, named `@kmodern/api`, the task-graph script names
   only, port **3102**, `extends` the server tsconfig, and a data tier that is the **contents of
   `packages/db`**: `prisma/schema.prisma`, `prisma/migrations/0001_init`, `prisma.config.ts`,
   `seed/`, and `src/prisma/index.ts` + the client wrapper from `packages/db/src/{index,client}.ts`.
   Delete `packages/db`. **The migration history moves byte-for-byte; do not regenerate it.**
2. **The composition root and the first feature.** `main.ts` in the §7.4 order, `app.module.ts`
   declaring `imports` and nothing else, global validation (strip *and* reject unknown fields), the
   one `{ statusCode, message, timestamp }` error filter, CORS with an explicit origin allowlist,
   security headers, docs gated to non-production, graceful shutdown. Then **one vertical slice**:
   the read model the storefront's home page needs, end to end, with auth.
3. **Move one resource at a time, store first.** Each merge request takes one resource's whole read
   and write path out of the clients and into a gateway feature in the §7.3 shape — module,
   controller, service, `dto/`, `exceptions/`. Suggested order by risk, highest first:
   1. **orders and payment** — closes the stock-lifecycle divergence (B), the three-write callback
      (B), the `* 10` pair (B), the transition-table split (B), and order numbering (B)
   2. **checkout and cart** — closes the COD rules inline at `api/checkout/route.ts:47-152`, the
      missing city↔province check at `:31-33`, the totals divergence (B)
   3. **auth, OTP and sessions** — closes the phone normalisation (B) and the revocation split (B)
   4. **catalogue, categories, collections, nav, pages, blog** — the bulk of the read surface
   5. **settings, discounts, inventory, audit, customers, media**
   6. **the scraper endpoints** — 3 handlers, and they take the `sameOrigin` check with them
4. **The admin's 27 server actions become gateway endpoints**, and the admin's own action modules
   become thin per-feature server-side modules that call `apps/api` with request credentials (§9.3) and
   return the uniform `{ success, error?, data? }` result. Its 6 route handlers follow the same route.
5. **`packages/transport`**, once there are two real callers: `createApiClient(tokenName)` per §10,
   owning base-URL resolution, the auth header, JSON encoding, empty responses, and a typed
   `{ message, statusCode }` error. The storefront's **13** hand-rolled `fetch` sites
   (`apps/store/src/app/checkout/checkout-client.tsx:73,134,167,188` and the rest) move onto it. The
   admin's path is different and stays that way: its thin server-action modules use §10's
   **server-side** read helper, because credentials come from the request context rather than
   browser storage — the one legitimate duplication the blueprint names. Its 3 remaining direct
   `fetch` sites are client-side callers of that factory, not a second factory.
6. **Dissolve `packages/adapters`** into four infrastructure folders under `apps/api/src`: `storage/`
   (with the missing `LocalStorage` implementer that `apps/admin/src/lib/media.ts:48-106` inlines
   three times), `payments/`, `sms/`, `shipping/`. **Move `packages/scraper` to `apps/scraper`**
   first: it is an app, and it must keep its zero database dependency — the gateway's seed reads the
   files it produces.
7. **The seeds**: move them to `apps/api/seed/`, and make `update-home-deals.ts` idempotent and
   `seed.ts` non-destructive (C). Delete the stale `catalog.json` absolute paths by regenerating
   through the working script — which means restoring `apps/legacy-store` as a source **or** accepting
   the committed file as the input of record, and writing that decision down.
8. **Configuration tiers.** Remove both `loadDotenv` calls (D). `DATABASE_URL` becomes a runtime
   variable read by the gateway at process start; the clients get a public API base URL that is
   inlined at build and declared in the `build` task's `env`, so it is part of the cache key. Security
   headers on every admin route (D), from one canonical set recorded in the register.

**Done when**:

```bash
grep -rn "@kmodern/db" --include="*.ts" --include="*.tsx" apps packages scripts | wc -l   # 0
grep -rn 'from "@kmodern/db"' --include="*.ts" --include="*.tsx" apps | wc -l              # 0, type-only included
ls packages/db packages/adapters 2>&1 | grep -c "No such"                                  # 2
ls packages/transport/src/index.ts apps/api/prisma/migrations/0001_init/migration.sql        # both exist
grep -rn "order.total \* 10" --include="*.ts" apps packages | wc -l                        # 0
grep -rn "function sameOrigin" --include="*.ts" apps packages | wc -l                       # 1
grep -rn "inventoryLowStockThreshold" --include="*.ts" --include="*.tsx" apps | wc -l        # 1
grep -rn "loadDotenv" apps/*/next.config.ts | wc -l                                          # 0
grep -rn 'from "@kmodern/db"' --include="*.tsx" apps/admin/src apps/store/src | wc -l        # 0
npx turbo run typecheck test build                                                        # green
```

Plus: a concurrent-duplicate-callback test for the payment settlement, and a
`pnpm --filter @kmodern/api test` that runs against a disposable Postgres container on a
non-default port with a destructive-suite-specific variable (§8).

---

### P3 - The gates

Every mechanical invariant in §15.1 becomes a command. All of it blocks from day one, which is only
safe because P2 already landed.

1. **`.dependency-cruiser.js`**, primary gate. Four settings are load-bearing and each is a way the
   gate passes while checking nothing (§16.1):
   - `tsPreCompilationDeps: true`. This repo already has 4 `import type` client→database edges, so
     the setting is not academic here.
   - **Two cycle rules.** `scope` is a rule-level key defaulting to `module`; only a second rule at
     `scope: "folder"` catches `<feature-a>/ ⟷ <feature-b>/`.
   - **Assert a non-zero cruised-module count.** Outside dependency-cruiser's accepted TypeScript
     range it prints `0 modules cruised` and **exits 0** — a routine compiler bump would disarm the
     primary gate with a green tick. P1's pinned `typescript` is what makes this safe.
   - Exclude `\.spec\.ts$` (§7.2).

   Rules to encode: tier rank (§4, from the rank table), the four in-app archetypes (§7.1), file-kind
   rank (§7.2), no source file importing an entrypoint, and **no client importing the data client,
   including by type-only import** — the edge P2 closed and the one this repo is most likely to
   re-open.
2. **`turbo boundaries`** for cross-workspace tags and package cycles. It owns the
   `@boundaries-ignore` directive, and §18 requires a reason on the same line.
3. **`manypkg`**: root has no runtime dependency, a peer implies a dev dependency, one version per
   tool. This is what keeps P1's reconciliation true.
4. **`ratchet.json`**, seeded at the counts below. Every command carries its own excludes, because
   **the command is the metric** (§15.3 rule 1).

   | Metric | Seed | Target | Note |
   |---|---|---|---|
   | `stray-tool-config` | **0** after P1 | 0 | must exclude `docs/blueprint/`, which holds the kit's 3 configs |
   | `colour-literal` store | **1** | 0 | `apps/store/src/components/product-buy-box.tsx:156` |
   | `colour-literal` admin | **0** | 0 | **scope decision:** the 6 in `apps/admin/src/lib/scraper-import.ts:28-33` are a product colour-palette lookup, not styling. Count component source only, and say so in `ratchet.json` — otherwise the entry sits at 6 for ever on a number that means nothing |
   | `suppression` | **0** | 0 | the metric that stops accepted deviations compounding |
   | `route-local` store | **6** | 0 | 5 components + `showcase-theme.css`; the framework-metadata exemptions applied |
   | `route-local` admin | **12** | 0 | all listed in the register under D-29 |
   | `app-root` store | **4** | 0 | `PRODUCT.md`, `components.json`, `.impeccable/`, `tests/` — 0 after P1 |
   | `app-root` admin | **1** | 0 | `tests/` — 0 after P1 |
   | `feature-two-homes` | **0** | 0 | already green; §15.4 says it stays as a proxy, and §15.2 keeps the judgement item |
   | `flat-dto` / `flat-exception` | seed at whatever P2 produces | 0 | today 0, but vacuously: there is no gateway. Both exist from the first file of each kind (§7.3), so the seed is whatever the first gateway feature leaves flat |

5. **CI**: one pipeline, every job blocking, `install → typecheck → lint → test → audit → build`. The
   gateway's suite gets its own job with a Postgres service pinned to the production major version and
   a throwaway database. §16.2: *the `audit` job blocks from the day it lands* — which is only safe
   because P2 landed. **The pipeline's trigger branches are a decision of their own and belong in an
   ADR.**

**Done when**:

```bash
npx turbo run audit     # exits 0, reports a non-zero cruised-module count, prints the ratchet table at seed
```

and a merge request containing a deliberate `apps/store` → `packages/db` import is blocked.

---

### P4 - The kernel

Two independent mechanical renames with no broken intermediate state, so they land as separate
changes and the typecheck proves each.

1. **`packages/schema` → `packages/contracts`**, and the **86 import sites across 70 files**
   repointed. §5.4: *name it `contracts`, not `shared`* — `schema` describes the mechanism, and a
   package named for what it holds is the point. The runtime-dependency allowance from deviation
   O-3 is encoded in the audit config, not as a suppression.
2. **One generated-client index.** `apps/api/src/prisma/index.ts` re-exports the generated client,
   its enums and the `Prisma` namespace; `client.ts:2` stops reaching `generated/` and imports the
   index. Promote the dependency-cruiser rule from warning to error.

While the kernel is in hand, the three canonical formats it declares get their single normaliser, and
the write paths start calling it: `iranPhoneSchema` gains the `.transform()` the package has never
had (it has **zero** today), `formatRial` acquires its first caller, and `normalizeCityName`
(`packages/schema/src/iran.ts:48`, currently 0 callers) is used at the admin address write path
(`apps/admin/src/lib/actions/orders.ts:112-113`). This is B's phone and money rows closing on the
kernel side rather than in each service.

**Done when**:

```bash
grep -rn "@kmodern/schema" --include="*.ts" --include="*.tsx" --include="*.json" apps packages | wc -l   # 0
ls packages/contracts/src/index.ts                                                                       # exists
grep -rl "generated/prisma" --include="*.ts" apps/api/src | grep -v "src/prisma/index.ts" | grep -v "/generated/" | wc -l   # 0
npx turbo run typecheck test audit                                                                       # green
```

---

### P5 - The shape

The largest diff and the lowest risk: file moves and import rewrites. P3 seeded the ratchets, so
this phase drives them to zero and **retires** each one per §15.4 — an entry retires only when its
count has reached zero **and** a `severity: 'error'` command exists that fails on the first
violation.

1. **Feature roots in both clients.** One directory per feature holding its `lib/`, `components/`,
   `hooks/`, `state` and `types.ts`; `src/lib/`, `src/components/` and `src/types/` keep only
   app-wide code. The scissor cuts are the ones the register names: store catalogue (17 files / 6
   directories), store orders (9/7), store cart (9/7), admin scraper (9/5). The nine splits in D-1 are
   **not** fixed by this move — they are fixed by choosing one home per rule, which is a judgement
   call per pair.
2. **The gateway's shape.** `src` root down to `main.ts` and `app.module.ts`; an archetype assigned to
   every top-level directory and added to the lists the boundary rules read; `dto/` and
   `exceptions/` from the first file of each kind, in every feature.
3. **The 18 route-local components** into `_components/` or a feature root. This is the long tail and
   the part a ratchet handles well.
4. **The two oversized units.** `apps/admin/src/components/scraper-panel.tsx` is 1475 lines with **45
   contiguous `useState`** at `:317-361` and a single 828-line component at `:316-1143`; the repo has
   **2 custom hooks and 0 `use-<feature>.ts` files** in total, so §9.4's remedy has never once been
   applied. Extract `use-scraper-job.ts` and `use-catalog-review.ts` — the lifecycle predicate it
   re-derives at `:363` already exists twice elsewhere. `apps/store/src/components/block-renderer.tsx`
   is 572 lines with 20 of 25 block types inline, and it **queries the database at `:410`**, which
   P2 removes.
5. **One token layer** (K, L). Move the semantic mapping out of `apps/store/src/app/showcase-theme.css`
   into `packages/ui/tailwind.css` so both clients get it; retire
   `apps/admin/src/components/ui.tsx` in favour of `packages/ui`, which already ships the 9 named
   components admin re-implements (Badge, Button, Card, CardHeader, Checkbox, Input, Label, Select,
   Textarea) plus the whole Table family — only Field, Pagination, EmptyState and Spinner are
   genuinely admin-only. Wire admin to the merging `cn` at `packages/ui/src/cn.ts:4-5`; add the four
   missing `flame` shades (L) and the composed classes the measurement earned — the notice recipe
   (16 uses), the form-control recipe (11), the two-column field grid (12).
6. **The documentation system** (M). One `docs/index.md` linking all 7 documents; one entry point per
   surface; an ADR for each client recording its rendering dialect (§9.2) and one for the pipeline's
   trigger branches (§16.2); the rank table from Part 1; the four deviation rows from Part 2 O.
7. **The judgement items that no gate covers**, worked by hand as §15.2 intends: the catch-all
   folders, the four units carrying several jobs
   (`packages/scraper/src/pipeline.ts:191-441` is 251 lines doing 8 jobs), and the six split features
   the proxy gate cannot see.

Apply the moves with a script carrying **one assertion per site**, so an unmatched path aborts the
run instead of silently doing nothing.

**Done when**:

```bash
npx turbo run audit     # every ratchet at 0; app-root, route-files-only and feature-one-root are errors
# and each retired metric's command now fails on a deliberate violation:
printf 'export const x = 1\n' > apps/store/src/app/cart/probe.tsx && npx turbo run audit   # must fail
rm apps/store/src/app/cart/probe.tsx
npx turbo run typecheck lint test build    # green
```

---

## Part 4 - When this plan is done

Delete this file. The record that matters is `turbo.json`, `.dependency-cruiser.js`, `ratchet.json`
and the CI pipeline, all of which fail loudly and cannot go stale.

What stays: the blueprint, the rank table, the four deviation rows, the ADRs for each client's
rendering dialect and for the pipeline's triggers, and a short companion doc recording this repo's
concrete choices — actual ports, actual archetype assignment per directory, actual token values — per
§13.

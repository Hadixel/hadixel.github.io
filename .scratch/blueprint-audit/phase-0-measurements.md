# Blueprint audit — Phase 0 (measure)

Repo: `kmodern` (Persian RTL commerce monorepo). Mode: **Audit** (§1). Blueprint: `blueprint/ARCHITECTURE-BLUEPRINT.md`.
Scope of this document: §17.2 **Phase 0 only** — measurement. **Nothing was changed.** Findings are
sorted into correctness risk / drift risk / cosmetic, per §17.2.

`blueprint/reference/` and `blueprint/examples/` are another repo's artefacts and were read as
examples only, per instruction. They are counted below as *blueprint kit* files where a command
would otherwise sweep them in (finding C-7), never as repo config.

---

## 0. Commands that do not exist yet

`turbo run audit` (§1 Audit mode, §16.1) is not runnable: there is no `audit` task, no
`scripts/`, and no dependency-cruiser config. **The mechanical pass below was therefore done with
ad-hoc read-only commands**, not with the gate the blueprint prescribes. Everything below marked
"measured" is a fact from those commands; nothing is inferred from a rule.

Baseline counts for the §15.3 ratchet, measured now, with this repo's paths substituted:

| Metric (§15.3) | Command used | Count |
|---|---|---|
| `flat-dto` | `find apps packages -name "*.dto.ts" -not -path "*/node_modules/*" \| wc -l` | **0** (no gateway exists) |
| `flat-exception` | `find apps packages -name "*.exception.ts" …` | **0** (no gateway exists) |
| `stray-tool-config` | §15.3 `find` enumeration | **3** — all three inside `blueprint/reference/` (`.prettierrc`, `.prettierignore`, `eslint.config.mjs`); **0 in repo source** |
| `colour-literal` (store) | `grep -rEoh "#[0-9a-fA-F]{3,8}" --include="*.ts" --include="*.tsx" apps/store/src \| wc -l` | **1** |
| `colour-literal` (admin) | same, `apps/admin/src` | **6** |
| `suppressions` | `grep -rn "boundaries-ignore" --include="*.ts" --include="*.tsx" apps packages \| wc -l` | **0** |

Graph facts (throwaway script, since dependency-cruiser is absent; relative + `@/` + dynamic
`import()` specifiers, `.next`/`node_modules`/`out`/`generated` excluded, `*.ts`/`*.tsx` only):

| Check (§15.1) | Result |
|---|---|
| 237 source files, 426 local import edges | — |
| File-scope cycles | **0** |
| Folder-scope cycles in `apps/store/src`, `apps/admin/src` | **0** |
| Workspace-level package cycles | **0** (`db→schema`, `ui→schema` only) |
| Client → client imports | **0** |
| `forwardRef` and equivalents | **0** (one dynamic `import("./price-list")` in `packages/scraper/src/pipeline.ts:413`, a code split, not a lazy-resolution helper) |
| Files outside `packages/db/src/index.ts` importing a `generated/` path | **0** (only `packages/db/src/client.ts:2`, inside the data workspace) |

---

## A. Correctness risk

### A-1. There is no data gateway, and three live write paths touch the database — §3 rule 1, §4

The blueprint's top law is *one process talks to the database; every client read and write is an
HTTP call into it*. This repo has no gateway. Both clients reach Postgres directly:

- **66** `@kmodern/db` import sites across **61** files under `apps/`.
- Store: `apps/store/src/lib/queries.ts`, `auth.ts`, `orders.ts`, `settings.ts`, `nav.ts`,
  `discounts.ts`, `shipping.ts`, `sitemap.ts`, plus **5 API route handlers** under
  `apps/store/src/app/api/` (`checkout/route.ts`, `checkout/preview/route.ts`, `cart/enrich/route.ts`,
  `orders/[id]/pay/route.ts`, `orders/[id]/pay/callback/route.ts`).
- Admin: **22 route pages** under `apps/admin/src/app/(panel)/`, **8 server-action modules** under
  `apps/admin/src/lib/actions/`, and **3 API routes** under `apps/admin/src/app/api/admin/scraper/`.
- Seed/scripts: `packages/db/seed/*.ts`.

Write invariants are therefore enforced in at least three places with no shared rule. This is the
one finding that outranks the rest (blueprint §17.2 phase 2: *closing a second data path outranks
everything else*).

### A-2. `DATABASE_URL` is a build-time secret — §12 configuration tiers

`apps/store/next.config.ts:7` and `apps/admin/next.config.ts:7`:

```ts
loadDotenv({ path: path.resolve(process.cwd(), "../../.env") });
```

The root `.env` (which the `next.config.ts` comment in both apps states holds `DATABASE_URL`) is
loaded **inside the framework config**, so it is present during `next build` and is cached into
`.next`. §12: *a secret that reaches a build is no longer a secret*. There is no `.env.example`
anywhere in the repo (`find . -name ".env.example"` → 0 results), so no variable is documented or
tiered.

### A-3. No error envelope; three different result shapes — §7.6, §9.3, §3 rule 5

No `{ statusCode, message, timestamp }` envelope and no global filter exist (there is no gateway to
install one in). Handlers assemble their own bodies, and the shapes disagree per call site:

- `apps/store/src/app/api/otp/route.ts:11` — `{ error: "…" }`, `:14` — `{ ok: true, devCode }`
- `apps/store/src/app/checkout/checkout-client.tsx:134,167` — a `json.totals` object
- `apps/admin/src/lib/actions/*.ts` — a third shape, `{ ok, error }` (e.g. `catalog.ts:339-341`)

`grep -rln "statusCode" apps/*/src/app/api` → 0 files.

### A-4. Admin serves page routes with no security headers — §10 security headers

`apps/store/next.config.ts:49-58` installs a global set (`X-Content-Type-Options`,
`X-Frame-Options`, CSP) for `/:path*`. `apps/admin/next.config.ts:12-24` installs headers for
**`/media/:path*` only** — every admin page route runs without them. The two header sets are also
different literal CSPs, which §10 says is the one place duplication is intentional, and therefore
must be recorded in the deviation register; it is not.

### A-5. Duplicate business logic per action — §3 rule 5, §7.5

Eight delete paths exist twice, once as a bare server action and once as a `useActionState`
wrapper that only re-calls it:

- `apps/admin/src/lib/actions/catalog.ts:252` `deleteCategory` / `:340` `deleteCategoryAction`;
  `:274` `deleteCollection` / `:344` `deleteCollectionAction`
- `apps/admin/src/lib/actions/content.ts:125` / `:143`, `:395` / `:411`
- `apps/admin/src/lib/actions/settings.ts:190` / `:204`
- `apps/admin/src/lib/actions/media.ts:8` / `:27`

Same behaviour, two entry points, no canonical one.

### A-6. Domain formats formatted inline at 14 sites — §10

§10 (RTL/first-class locale): *all date and number formatting goes through kernel helpers, and no
component formats a date or a currency inline.* Measured: 14 `toLocaleDateString` / `toLocaleString`
/ `Intl.` sites, including `apps/store/src/app/order/[orderNumber]/page.tsx:71,119`,
`apps/store/src/app/blog/[slug]/page.tsx:24`, `apps/store/src/app/blog/page.tsx:30,45`,
`apps/store/src/components/post-card.tsx:101`, `apps/store/src/components/order-row.tsx:44`,
`apps/store/src/components/search-suggestions.tsx:19`,
`apps/store/src/components/reactbits/index.tsx:183`, and
`apps/admin/src/app/(panel)/products/page.tsx:127`. `packages/schema/src/format.ts` exists — the
canonical helper is present and bypassed.

---

## B. Drift risk

### B-1. No enforcement layer of any kind — §16

`turbo.json` declares `build`, `dev`, `lint`, `generate`, `typecheck` and **no `audit`**. There is no
`scripts/`, no `.dependency-cruiser.js`, no `ratchet.json`, no `packages/config`, no CI pipeline file
in the repo. `grep '"lint"' apps/*/package.json packages/*/package.json` → **0 matches**: the root
`"lint": "turbo lint"` script in `package.json:20` resolves to a task no workspace implements.

Consequence for the audit itself: cycles, tier edges and the client→database edge are currently
unchecked and were measured by hand here.

### B-2. Tool versions declared in six manifests, none at the root only — §6 rules 3, 4

`typescript ^5.6.0` appears in all 7 workspace manifests; `vitest ^5.0.0` in four; `next ^16.3.6` in
three; `react`/`react-dom ^19.2.6` in both apps while `packages/ui` asks for `^19.2.0` in
`peerDependencies`. Root `package.json:21-23` declares only `turbo`. `pnpm-workspace.yaml` has an
`overrides` block for four transitive packages, but **no `react` pin** — the two-copy-of-React
failure §6 rule 4 names is unguarded.

### B-3. `packages/ui` declares `react` as a peer but not as a dev dependency — §5.2

`packages/ui/package.json`: `peerDependencies` has `react`/`react-dom`; `devDependencies` has
`@types/react`, `@types/react-dom`, `next`, `typescript`, `vitest` — **no `react`**. §5.2: a component
library declares the UI runtime in `peerDependencies` *and* `devDependencies` so it type-checks
alone.

### B-4. Every package ships TypeScript source, not build output — §5.2

All five packages set `"main"`-equivalent `exports` to `./src/index.ts` and all seven tsconfigs set
`"noEmit": true`. §5.2 requires `dist` + `types` and rejects source-publishing, for the stated
reason: non-erasable syntax dies at load. `packages/db` re-exports generated Prisma code
(`packages/db/src/index.ts:1-3`) through a source path, so a non-erasable construct in the
generator output would surface as a `SyntaxError` at load rather than at build.

### B-5. The database package exists — §5.5, §4

`packages/db` is precisely the artefact §5.5 says must not: one consumer by construction (here,
several, illegally). The manifest even carries the tell — `"./manufacturers": "./seed/iranian-manufacturers.ts"`
exports a seed file as a package entry point. §5.5's diagnosis applies verbatim: *the package is the
symptom; the client's import is the violation.*

### B-6. Clients compile against generated model types — §5.4

`apps/store/src/lib/discounts.ts:69` — `type DbDiscount = Prisma.DiscountGetPayload<…>`;
`apps/admin/src/lib/inventory.ts:11` — `type InventoryClient = Pick<Prisma.TransactionClient, …>`.
A column rename in `packages/db/prisma/schema.prisma` becomes a client compile error, which is
exactly the coupling §5.4's "restatement is the point" paragraph exists to prevent.

### B-7. `packages/scraper` is an app-shaped workspace in `packages/` — §5

`packages/scraper` carries `README.md`, `out/`, `tests/`, `vitest.config.ts` and three CLI
entrypoints (`scrape`, `price-list`, `tui`, re-exported from the root `package.json:15-17` as
`turbo`-less pnpm filters). §4: an unranked workspace is where a second architecture grows; every
`apps/*` and `packages/*` workspace must carry a rank. No tier ranks are recorded anywhere in the repo.

### B-8. Hand-copied compiler options, seven times — §5.3, §6 rule 2

Seven tsconfigs each restate `target`, `module`, `moduleResolution`, `strict`, `skipLibCheck`,
`noEmit` (e.g. `apps/store/tsconfig.json:2-27` and `packages/scraper/tsconfig.json:2-10` differ in
`target`, `moduleResolution` casing and `lib`). There is no `packages/config` to extend. `strict`
is `true` everywhere today, but nothing holds it there.

---

## C. Structure and documentation — mostly cosmetic, three judgement-relevant

### C-1. Client `src` roots: only `app/`, `components/`, `lib/` — §9.4

Both clients pass the `src`-root fence (no loose files; `find -maxdepth 1 -type f` in both → empty).
No duplicate directory names at depth 1–2 in either client (the retired `client-feature-one-root`
proxy would be clean).

But there are **no feature roots at all**. Every feature lives as a loose file in the layer folders:
`apps/store/src/lib/` holds `auth.ts`, `cart.ts`, `discounts.ts`, `nav.ts`, `orders.ts`,
`queries.ts`, `recent-searches.ts`, `search-nav.ts`, `settings.ts`, `shipping.ts`; `apps/admin/src/lib/`
holds 13 siblings plus `actions/`. §9.4: *a feature has exactly one root directory*; §15.2 lists
*is a directory inside `src/lib/` genuinely app-wide, or is it a feature root filed by layer?* — for
these files, filed by layer.

### C-2. Non-route files inside route directories — §9.4 (13 in store, 11 in admin)

- `apps/store/src/app/`: `providers.tsx`, `global-error.tsx`, `sitemap.ts`, `robots.ts`,
  `account/account-area.tsx`, `account/account-login.tsx`, `checkout/checkout-client.tsx`
  (the first four are framework metadata/global files the rule exempts; the last three are not).
- `apps/admin/src/app/`: `login/login-form.tsx`, `change-password/change-password-form.tsx`,
  `(panel)/blog/delete-post.tsx`, `(panel)/categories/categories-manager.tsx`,
  `(panel)/collections/collections-manager.tsx`, `(panel)/discounts/delete-discount.tsx`,
  `(panel)/inventory/adjust-form.tsx`, `(panel)/media/media-library.tsx`,
  `(panel)/media/media-upload.tsx`, `(panel)/orders/[id]/transitions.tsx`, `(panel)/orders/new/form.tsx`,
  `(panel)/pages/delete-page.tsx`.

All 14 route-local components should be in a `_components/` directory in the route, or a feature root.

### C-3. App workspace root fence — §5.1

Legitimate under the fence: `public/`, `next.config.ts`, `postcss.config.mjs` (style pipeline),
`vitest.config.ts` (test runner), `next-env.d.ts`, `tsconfig.tsbuildinfo`, `package.json`,
`tsconfig.json`, `src/`. Not named by any rule, each a fence violation to resolve one way or the other:

- `apps/store/PRODUCT.md`, `apps/store/components.json`, `apps/store/.impeccable/` (1 file)
- `apps/store/tests/`, `apps/admin/tests/` — 3 test files total
  (`manufacturer-marquee.test.ts`, `search-endpoint.test.ts`, `security.test.ts`)
- no `.env.example` at either app root (A-2)

### C-4. Documentation surface — §13, §15.1 Documentation

- Repo root: `CLAUDE.md` only. Per the blueprint's own standing-deviation shape it may carry rules as
  well as links; recorded here, not filed as a violation.
- Each app carries **two** entry-point files: `apps/store/AGENTS.md` + `apps/store/CLAUDE.md`
  (the latter is a one-line `@AGENTS.md` alias; same at `apps/admin/`). §13/§15.1: *exactly one,
  not zero, not both names.*
- `apps/store/AGENTS.md:1-10` is a **tool-generated block** written by `next dev`
  (`generate-agent-files.js`, per its own text), not an index pointing at per-surface docs.
- `docs/` holds 7 documents — `adr/0001-showcase-design-language.md`, `adr/0002-heroui-component-stack.md`,
  `agents/{admin-qc-notes,domain,issue-tracker,price-list-debug-notes,triage-labels}.md` — and
  **no docs index**. §15.1: *every document under `docs/` is linked from the docs index*; the index
  does not exist. The two ADRs are also unnumbered relative to a `0003+` gap that no topic docs fill.
- `CONTEXT.md` at the root is a good domain map and does document the showcase design language; it is
  the only place the rendering dialect is written down, and it names a single storefront.

### C-5. Colour literals — §11.1

7 total (see §0 table). 6 of the 7 are **not** UI colour: `apps/admin/src/lib/scraper-import.ts:28-33`
is a product colour-palette lookup (`black`/`white`/`gray`/`beige`/`silver`/`steel`) that is data,
not styling. The one genuine violation is
`apps/store/src/components/product-buy-box.tsx:156` — `variant.colorCode ?? "#d7d7d7"` as an inline
`style`. Stylesheets: `apps/store/src/app/showcase-theme.css` (20 hex) and `packages/ui/tailwind.css`
(17 hex) are the token definition files, which the rule excludes.

### C-6. `"use server"` modules export types — §15.1 (2 files, build currently green)

`apps/admin/src/lib/actions/auth.ts:10` and `apps/admin/src/lib/actions/ctx.ts:10` both
`export interface` from a `"use server"` module. `apps/admin/src/lib/actions/form-helpers.ts` matches
a `"use server"` *grep* but its line 1 comment states it is deliberately not one — the sync exports
there are correct. The two interface exports are the items to verify: the current dev build is green,
so this Next version tolerates type-only exports, and the rule should be pinned to a check rather
than assumed.

### C-7. The blueprint kit itself sits inside the repo — §5.1/§15.3 interaction

`blueprint/reference/{.prettierrc,.prettierignore,eslint.config.mjs}` are the 3 `stray-tool-config`
hits. They are not repo config, but any `find` from the repo root counts them forever, and
`blueprint/` has no `.gitignore` entry. Either move the kit outside the repo or the future
`stray-tool-config` command must exclude `blueprint/` — and the exclusion must be written into
`ratchet.json`, since §15.3 rule 1 makes the command the metric.

---

## D. Judgement invariants, worked by hand (§15.2)

Read the tree; the mechanical proxies above do not cover these.

| Question | Finding |
|---|---|
| One job per folder, or a catch-all? | **No.** `apps/store/src/components/` (38 files, one flat listing) and `apps/admin/src/lib/` (13 + `actions/`) are catch-alls by layer, not by feature — C-1. |
| Right archetype per directory (§7.1)? | **N/A** — no gateway, so no in-app archetypes. `packages/scraper/src` holds CLI entrypoints (`cli.ts`, `tui.ts`, `price-list-cli.ts`) beside library code in one package — B-7. |
| Ports guarding a real swappable boundary? | **Yes, and correct.** `packages/adapters` (`storage.ts`, `zarinpal.ts`, `postex.ts`, `kavenegar.ts`) guards real boundaries — object storage vs local, four independent payment/SMS providers. 12 consumers, so the two-consumer trigger is met. No port exists to break a cycle. |
| Domain type duplicated in a client instead of read from the kernel? | **Partly.** The kernel `packages/schema` exists and is well-formed (zod schemas, `format.ts`, `sanitize.ts`, `iran.ts`, `jalali.ts`). But Prisma payload types are restated in clients (B-6) and the currency/date kernel helper is bypassed (A-6). |
| Feature grown large enough to split? | **Yes — three.** `apps/admin/src/components/scraper-panel.tsx` (**1475 lines**, 3× the §9.4 400–500 ceiling); `packages/scraper/src/price-list.ts` (706) and `tui.ts` (602); `apps/store/src/components/block-renderer.tsx` (572). Also `apps/admin/src/lib/scraper-jobs.ts` (492) and `blog-editor.tsx` (442). |
| Test reaching into another feature's internals? | **No.** 3 test files, none cross-imports. |
| Controller reaching past its service? | **N/A** — no controllers. Equivalent smell: store API routes call `db()` and the payment/SMS adapters directly from the handler (e.g. `apps/store/src/app/api/checkout/route.ts:9`) with no service layer between the HTTP surface and the write. |
| Rendering dialect documented and internally consistent? | **Partly.** `CONTEXT.md` describes tokens and the showcase language, but no document states the dialect per client, and no ADR records it (§9.2 asks for it). |
| Unit mixing fetching + transformation + rendering? | **Yes — `apps/store/src/components/reactbits/index.tsx`** (329 lines, one file exporting a vendored third-party bundle *and* formatting with `new Intl.NumberFormat` at line 183). |
| Repeated utility chain owed a composed class? | **Unmeasured.** Not evaluated in this pass; the token file `showcase-theme.css` is the place to look. |
| SOLID / one reason to change per unit? | Two concrete hits: the `delete*` / `delete*Action` pairs (A-5), and `packages/scraper/src/pipeline.ts` (490 lines) doing crawl + parse + price-list merge. |

---

## E. What the audit could not answer

- **The next build's behaviour.** `next build` was not run; A-2's build-time secret exposure and
  C-6's type-export tolerance are read from config and source, not from an observed build.
- **Colour-literal count under a real token-aware scanner.** The §15.3 command counts raw hex in
  `.ts`/`.tsx`; a scanner that understands token references reports a different, lower number.
  §15.3 rule 1 applies: whichever command is adopted *is* the metric.
- **The 18% hidden type-only edge class** (§16.1). The throwaway graph did resolve `import type`
  specifiers, and 4 client→db imports are type-only
  (`grep -rn "import type.*@kmodern/db" apps` → 4), but the claim about type-only edges being
  invisible is a property of dependency-cruiser defaults and was not reproduced here.
- **Migration immutability and drift** (§15.1 Data). `packages/db/prisma/` was not inspected; those
  two CI jobs do not exist and would be Phase 1–3 work regardless.

---

## F. Phase 0 conclusion

**The repo is not a partial adoption of this blueprint; it is a different architecture.** §17.2
assumes an existing repo that has drifted from laws it once adopted. Here the laws that were never
adopted are the load-bearing ones: there is no gateway (A-1), and the enforcement layer is absent
entirely (B-1). The genuine strengths — a clean acyclic graph, a real `packages/schema` kernel, a
correct port package, zero suppressions — are worth protecting through gates, not restructuring.

Before any fix is sequenced, one decision is required and it is not a Phase 0 finding: **is the
gateway law adopted at all?** If yes, A-1 is a multi-quarter migration and phases 1–5 apply as
written. If no, the correct move is a deviation register entry naming §3 rule 1 and §8 as
deliberately not adopted, plus the gates for the laws that *are* adopted — and the two write-path
invariant sets in A-1 become an explicit, documented cost rather than an accident.

Nothing in this pass was fixed. Working tree left as found (it already carried uncommitted changes
in `apps/admin` and `apps/store` before this pass began).

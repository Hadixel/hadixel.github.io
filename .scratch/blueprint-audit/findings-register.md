# Blueprint audit — findings register

Every finding from all three Phase 0 passes, sorted into the three groups §17.2 asks for:
**correctness risk**, **drift risk**, **cosmetic**. Every entry carries its file path and line.

Sources: `phase-0-measurements.md`, `phase-0-mechanical-invariants.md`,
`phase-0-judgement-invariants.md`. Still Phase 0 — **nothing was fixed.**

**Tally: 22 correctness · 41 drift · 14 cosmetic.** The ordering inside each group is by severity,
not by discovery order.

How to read a group:
- **Correctness risk** — can produce a wrong result, corrupt data, or lose a secret. Fix order matters.
- **Drift risk** — two or more copies of one thing, or a rule nobody checks. Compiles today; diverges later.
- **Cosmetic** — named by a law, cheap, no behavioural consequence.

---

# Group 1 — Correctness risk (22)

### C-1 · Three live write paths reach the database; there is no gateway
Violates §3 rule 1, §4, §8. **66 files, 66 sites** (62 value imports, 4 type-only); 64 under `src/`, plus 2 in the framework configs.
- `apps/store/src/lib/queries.ts`, `auth.ts`, `orders.ts`, `settings.ts`, `nav.ts`, `discounts.ts`, `shipping.ts`, `sitemap.ts`
- `apps/store/src/app/api/checkout/route.ts:3`, `checkout/preview/route.ts:3`, `cart/enrich/route.ts:3`, `orders/[id]/pay/route.ts:3`, `orders/[id]/pay/callback/route.ts:3`
- `apps/admin/src/app/(panel)/` — 22 page files
- `apps/admin/src/lib/actions/{auth,catalog,content,ctx,media,orders,settings}.ts`
- `apps/admin/src/app/api/admin/scraper/{route.ts:3,import/route.ts:3,prices/route.ts:3}`
- Both clients additionally bundle the client into the app: `apps/store/next.config.ts:38`, `apps/admin/next.config.ts:11`

### C-2 · The order stock lifecycle is implemented twice, with different concurrency guarantees
§2 one-way law, §3 rule 5. This is the single highest-severity finding in the audit.
- `apps/store/src/lib/orders.ts:138` `reserveStock`, `:168` `commitStock`, `:183` `releaseStock`, `:196` `restock` — bare `db().variant.update`, **no transaction, no compare-and-set**
- `apps/admin/src/lib/inventory.ts:40,63,83,104,121` — same four names, each phase wrapped in `db().$transaction` with an `updateMany` stock/reserved guard (`:35-38`, `:66-73`)
- `apps/admin/src/lib/inventory.ts:6-7` — header comment claims it mirrors the store "so the two apps can never disagree on stock math"

### C-3 · The payment callback writes `paymentStatus` three times, non-transactionally
§8, §3 rule 1. A concurrent duplicate callback can interleave `commitStock` and `releaseStock` on the same order.
- `apps/store/src/app/api/orders/[id]/pay/callback/route.ts:18-25` (failure path: `releaseStock` → `update` → `recordOrderEvent`)
- `…/callback/route.ts:34-49` (success path: `commitStock` → `update` → `recordOrderEvent`)
- `…/callback/route.ts:51-58` (double-spend fallback: the same three steps written out a second time)
- Correct twin, for contrast: `apps/admin/src/lib/actions/orders.ts:48-56` — compare-and-set `updateMany` with the comment *"A concurrent duplicate request cannot apply the same transition twice."*

### C-4 · Five order-creation rules inlined in the checkout HTTP handler
§7.3 (the service holds the rules), §7.6.
- `apps/store/src/app/api/checkout/route.ts:47-51` — COD offered only when the derived shipping method is `LOCAL`
- `…/checkout/route.ts:52-57` — COD ceiling, magic default `50_000_000` written at the call site (same key also defaulted at `apps/admin/src/lib/actions/settings.ts:35`)
- `…/checkout/route.ts:59-66` — "at most one AWAITING order per customer" as an inline `findFirst`; the author's own unsettled intent is left in the comment at `:64`
- `…/checkout/route.ts:68-103` — `db().order.create` seeding the whole initial state machine
- `…/checkout/route.ts:139-152` — `commitCodStock` defined *inside the route*, hard-coding a 48-hour reservation at `:150`
- `…/checkout/route.ts:122-129` — the Kavenegar adapter called directly from the handler

### C-5 · A store business rule is enforced at one write path and absent at the other
§3 rule 5, §10. City↔province agreement is checked in preview, and in the place route it is a comment.
- Enforced: `apps/store/src/app/api/checkout/preview/route.ts:26` (`cityBelongsToProvince` from the kernel)
- Missing: `apps/store/src/app/api/checkout/route.ts:31-33` — placeholder comment only

### C-6 · The TOMAN→Rial factor is a bare `* 10` in two payment handlers; the shared function has zero callers
§10 canonical formats. A factor-of-ten error on a real payment amount.
- `apps/store/src/app/api/orders/[id]/pay/route.ts:30` — `amountRial: order.total * 10, // 011: TOMAN→Rial at gateway`
- `apps/store/src/app/api/orders/[id]/pay/callback/route.ts:29` — `verifyPayment(cfg, authority, order.total * 10)`
- Unused canonical function: `packages/schema/src/format.ts:17-20` `formatRial` — **0 call sites** repo-wide
- The inverse has no shared function at all: `packages/adapters/src/postex.ts:44` (`/ 10`), `packages/scraper/src/price-list.ts:391` (`/ 10`)
- The currency unit is spelled four independent ways: `packages/scraper/src/price-list.ts:655`, `:679`, `apps/admin/src/lib/scraper-import.ts:69`, and the committed `packages/scraper/out/price-list-report.json`

### C-7 · The phone contract is five regex definitions and zero normalisers
§10: *normalise at every write path with one shared function*. `packages/schema` contains **no** `.transform()` call anywhere.
- Canonical (and duplicated in-file): `packages/schema/src/index.ts:391` `iranPhoneSchema`, and an inlined second copy at `:380` in `addressSchema`
- `apps/store/src/lib/auth.ts:58-61` — `db().customer.upsert({ where: { phone } })`. **`Customer.phone` is a unique lookup key**, so two spellings of one human create two customers
- `apps/store/src/lib/auth.ts:25` — OTP row written from the raw request body (`apps/store/src/app/api/otp/route.ts:10-12`), no `.trim()` anywhere between
- `apps/store/src/components/auth-modal.tsx:8` — third copy of the regex, `:150` its own digit strip
- `apps/store/src/app/checkout/checkout-client.tsx:243` — `replace(/\D/g,"").slice(0,11)`; slicing a `+989…` input to 11 chars produces `+9891212345`, which then **fails the server regex**. A client transform that can generate a value no server rule accepts. `:258` the same for postal codes
- `apps/admin/src/app/(panel)/orders/new/form.tsx:73` — HTML-only `pattern="09[0-9]{9}"`
- `apps/admin/src/lib/actions/settings.ts:96` — a fifth copy inlined instead of importing `iranPhoneSchema`
- Stored strings go to SMS unreformatted: `…/pay/callback/route.ts:46`, `apps/store/src/app/api/checkout/route.ts:126`

### C-8 · The same-origin CSRF check is copy-pasted four times, untested
§3 rule 5, §10 security headers. Four chances to be wrong, zero coverage.
- `apps/admin/src/app/api/admin/scraper/import/route.ts:14-25`
- `apps/admin/src/app/api/admin/scraper/route.ts:30-40`
- `apps/admin/src/app/api/admin/scraper/prices/route.ts:19-29`
- `apps/admin/src/app/api/admin/media/upload/route.ts:21-32`

### C-9 · The low-stock definition exists in three independent copies
§3 rule 5. Change one predicate and the sidebar badge, the inventory page header and the dashboard disagree.
- `apps/admin/src/app/(panel)/inventory/page.tsx:18` and `:41`
- `apps/admin/src/app/(panel)/layout.tsx:16-17`
- `apps/admin/src/app/(panel)/page.tsx:17-24`
- All three read `settingKeys.inventoryLowStockThreshold` with the literal default `3`. There is no `getLowStockCount()`.

### C-10 · The admin order-creation path bypasses the totals rule and hardcodes the discount to zero
§3 rule 5. Two order-creation write paths, two different money rules.
- `apps/admin/src/lib/actions/orders.ts:172-175` — subtotal recomputed inline
- `apps/admin/src/lib/actions/orders.ts:177` — `discountAmount: 0` hardcoded
- Correct twin: `apps/store/src/lib/orders.ts:87` `computeOrderTotals`, used by both store paths (`api/checkout/preview/route.ts:32`, `api/checkout/route.ts:47`)
- `currency: "TOMAN"` hardcoded at both write sites: `apps/store/src/app/api/checkout/route.ts:84`, `apps/admin/src/lib/actions/orders.ts:179`

### C-11 · The order transition tables are duplicated across the server/client boundary
§3 rule 5. The UI can offer a transition the server rejects.
- `apps/admin/src/lib/actions/orders.ts:14-27` — `FULFILLMENT_NEXT`, `PAYMENT_NEXT`
- `apps/admin/src/app/(panel)/orders/[id]/transitions.tsx:14-28` — byte-identical, client side
- Store equivalent labels, also split — and the page declares them **twice**: module level at `apps/store/src/app/order/[orderNumber]/page.tsx:16` (`fulfillmentLabel`), `:26` (`paymentLabel`), `:33` (`paymentMethodLabel`), then again inside the component at `:156` and `:165`; the client half is `apps/store/src/components/order-row.tsx:14-18`

### C-12 · Session revocation is re-implemented outside the auth module
§3 rule 5, §7.5. The store's auth module opens a session and exposes no revoke.
- `apps/store/src/lib/auth.ts:68-80` — no revoke path
- `apps/store/src/app/api/auth/logout/route.ts:12-16` — token hash + `customerSession.updateMany` re-implemented
- Correct twin: `apps/admin/src/lib/auth.ts:172-181`

### C-13 · `scripts/extract-catalog.mjs` cannot run; its committed output is unresolvable
Dead tooling that reads a deleted path and `eval`s substituted source.
- `scripts/extract-catalog.mjs:7` — `SRC = join(ROOT, "apps/legacy-store/src/assets/assets.js")`; `apps/legacy-store` does not exist
- `scripts/extract-catalog.mjs:12` — `readFileSync(SRC)` — throws `ENOENT` at the first filesystem statement
- `scripts/extract-catalog.mjs:38` — `eval` of substituted source text
- Output left behind: `packages/db/seed/catalog.json` — absolute paths from the original author's checkout, e.g. line 1 `/home/asd/dev/projects/react/E-commerce/apps/legacy-store/src/assets/…`
- Same dead dependency: `packages/db/seed/seed.ts:91` `IMAGS_BASE` (never read), and the root `CLAUDE.md` still lists `apps/legacy-store` as a third app

### C-14 · A data script is neither idempotent nor refusing: repeated runs stack discounts
§8: *seeds and one-off backfills … are either idempotent or refuse to overwrite existing rows.*
- `packages/db/seed/update-home-deals.ts:113-127` — `prisma.discount.create`, **not** an upsert, no uniqueness key. Every `pnpm db:home-deals` without `--drop-demo` inserts another 15%-off `PERCENT`/`PRODUCTS`/`AUTOMATIC` discount on the 4 newest published products, stacking on the last run's.
- `packages/db/seed/update-home-deals.ts:61` — removal is a data-dependent 24h window `deleteMany`, so a genuine promo created in that window is deleted and a stale-but-running one is never dropped
- Contrast, correctly guarded: `packages/db/seed/blog-import.ts:170-174` (refuses before the first write at `:177`), `packages/db/seed/bootstrap.ts:184-191` (scaffold test) and `:344-358` (refuses to overwrite the admin user), `packages/db/seed/images.ts:28-38`, `packages/db/seed/update-home-manufacturers.ts:22,35-37`

### C-15 · A data script deletes admin-created rows on every run
§8 immutability of data. `db:seed` against a live database removes spec fields an admin added.
- `packages/db/seed/seed.ts:122-127` — `productSpecValue.deleteMany` + `categorySpecField.delete` for any field absent from the committed catalog
- `packages/db/seed/seed.ts:110-113` and `:139-142` — unconditional category and subcategory renames

### C-16 · `DATABASE_URL` is loaded at build time and lands in `.next`
§12: *a secret that reaches a build is no longer a secret.* No `.env.example` exists anywhere, so no variable is tiered or documented.
- `apps/store/next.config.ts:7` — `loadDotenv({ path: path.resolve(process.cwd(), "../../.env") })` inside the framework config
- `apps/admin/next.config.ts:7` — identical
- The adjacent comment at both files states the root `.env` holds `DATABASE_URL`
- `find . -name ".env.example"` → 0 results

### C-17 · The admin serves every page route with no security headers
§10 security headers. The store has a global set; the admin's set covers only `/media/:path*`.
- `apps/store/next.config.ts:49-58` — `X-Content-Type-Options`, `X-Frame-Options`, CSP on `/:path*`
- `apps/admin/next.config.ts:12-24` — headers scoped to `/media/:path*` only; all 22 panel pages run with none
- The two CSP literals also differ, and §10 says that forced duplication must be recorded in the deviation register — it is not

### C-18 · Four token shades are used that the theme never defines, so those utilities compile to nothing
§11.1. A payment page heading is rendering in the inherited colour.
- Defined: `packages/ui/tailwind.css:78-107` — only `flame-50/100/200/600/700/800`
- `text-flame-900` / `text-flame-950` — `apps/store/src/app/order/[orderNumber]/page.tsx:77-78`, `apps/store/src/app/checkout/checkout-client.tsx:272,275`
- `text-flame-300`, `hover:text-flame-200` — `apps/store/src/app/cart/page.tsx:219`
- `bg-flame-500` — `apps/store/src/components/block-renderer.tsx:273,294`; `text-flame-500` — `packages/ui/src/showcase/showcase.tsx:28`
- `ring-flame-500` / `ring-flame-300` — `apps/admin/src/components/ui.tsx:26,100,121,181,221,257`, `apps/admin/src/app/(panel)/error.tsx:8`, `apps/admin/src/app/(panel)/not-found.tsx:8`, `apps/admin/src/components/media-picker-button.tsx:101`, `apps/admin/src/components/scraper-panel.tsx:1068,1105,1281,1309`

### C-19 · Read paths bypass the read facade, including from inside presentational components
§7.3, §9.4. A component reaching the database is the sharpest form: any filtering the facade applies is skipped.
- `apps/store/src/components/block-renderer.tsx:410` — `db()` inside a render path
- `apps/store/src/components/post-body.tsx:47` — same
- `apps/store/src/app/category/[slug]/page.tsx:2,15` — imports `db` *alongside* the facade, then a raw `db().category.findUnique`
- `apps/store/src/app/collection/[slug]/page.tsx:2,3` — identical shape
- The facade itself is real: `apps/store/src/lib/queries.ts` (10 named `get*` functions, subtree expansion `:44-46`, documented aggregate-ordering workaround `:68-70`)

### C-20 · The data client is a service locator, not an injectable wrapper
§8: *one injectable client wrapper*. Nothing can be substituted, so nothing can be tested against a fake.
- `packages/db/src/client.ts:23-29` — `db()` takes no arguments; 57 `db()` call sites across both apps
- `packages/db/src/client.ts:11-19` — `createPrismaClient` has exactly one external caller, `packages/db/seed/blog-import.ts:95`
- The only injection anywhere: `packages/db/seed/seed.ts:98` `seedCatalog(prisma)`

### C-21 · Brand and slug canonicalisation are implemented four and three times respectively
§10 canonical domain formats, §3 rule 5.
- Brands: `packages/scraper/src/price-list.ts:430-443` (`brandKey`, hard-coding `datees|datys|داتیس` etc.), `packages/scraper/src/sources.ts:226` (`SOURCES`), `packages/db/seed/update-home-deals.ts:25` (`RAIL_BRANDS`), `apps/admin/src/lib/scraper-import.ts:78-80` (`brandSlug`)
- Slugs: `makeSlug` via `apps/admin/src/lib/scraper-jobs.ts:314`, `apps/admin/src/lib/scraper-import.ts:78-80`, `blogTagSlug` at `apps/admin/src/lib/actions/content.ts:236`
- Products, categories, collections, pages and posts take the slug **raw from the form** with only a length check: `apps/admin/src/lib/actions/catalog.ts:39,181,270`, `apps/admin/src/lib/actions/content.ts:59,163`

### C-22 · Normalisers exist and are never called
§10: *no call site re-derives them.* Zero call sites each.
- `packages/schema/src/iran.ts:48-50` `normalizeCityName` — 0 callers; the raw fields are persisted at `apps/admin/src/lib/actions/orders.ts:112-113`
- `packages/schema/src/format.ts:22-24` `formatPrice` — 0 callers
- `packages/schema/src/format.ts:17-20` `formatRial` — 0 callers (see C-6)
- `packages/schema/src/iran.ts` contains no phone logic at all, despite being the natural home for it

---

# Group 2 — Drift risk (41)

### D-1 · Nine features are split across two differently-named homes
§9.4 one root per feature. The mechanical proxy passed (0 duplicate names at depth 1–2) and, exactly as §15.2 warns, **cannot see these** — the two trees have different names.
- Stock lifecycle: `apps/store/src/lib/orders.ts:138-205` vs `apps/admin/src/lib/inventory.ts:40-121` (also C-2)
- Order numbering: `apps/store/src/lib/orders.ts:70-77` vs `apps/admin/src/lib/order-number.ts:7-13`
- Settings readers: `apps/store/src/lib/settings.ts:16-29` vs `apps/store/src/lib/queries.ts:218-221`; admin mixes accessor and raw read at `apps/admin/src/app/(panel)/settings/page.tsx:64`
- Discount money rule: `apps/store/src/lib/discounts.ts:71-77` vs `apps/store/src/lib/queries.ts:213-219`
- Persian digits: `apps/admin/src/lib/date.ts:44-46` vs `apps/admin/src/components/ui.tsx:306-308`; imported from `./ui` at `apps/admin/src/components/shell.tsx:10` and `apps/admin/src/components/scraper-panel.tsx:25`, from `@/lib/date` in 12 pages
- Transition tables: `apps/admin/src/lib/actions/orders.ts:14-27` vs `apps/admin/src/app/(panel)/orders/[id]/transitions.tsx:14-28` (also C-11)
- Jalali dates, three implementations: `apps/admin/src/lib/date.ts:24-70` (ICU, `Asia/Tehran`, `TZ` at `:9`) vs `apps/admin/src/app/(panel)/products/page.tsx:127` vs `apps/store/src/app/order/[orderNumber]/page.tsx:74`, `apps/store/src/app/blog/page.tsx:37`, `apps/store/src/app/blog/[slug]/page.tsx:22`
- Session revocation: `apps/store/src/lib/auth.ts:68-80` vs `apps/store/src/app/api/auth/logout/route.ts:12-16` (also C-12)
- Nav target enum: `apps/store/src/lib/nav.ts:33-58` (kernel `LinkRef`) vs `apps/admin/src/components/nav-editor.tsx:15` (`TargetType` string union)

### D-2 · Eight delete paths exist twice
§3 rule 5, §9.3. Same behaviour, two entry points, no canonical one.
- `apps/admin/src/lib/actions/catalog.ts:252` / `:340`; `:274` / `:344`
- `apps/admin/src/lib/actions/content.ts:125` / `:143`; `:395` / `:411`
- `apps/admin/src/lib/actions/settings.ts:190` / `:204`
- `apps/admin/src/lib/actions/media.ts:8` / `:27`

### D-3 · Three different result shapes, no error envelope
§7.6, §9.3, §3 rule 5. `grep statusCode` over both API trees → 0 files.
- `{ error: … }` and `{ ok: true, devCode }` — `apps/store/src/app/api/otp/route.ts:11`, `:14`
- A `json.totals` object — `apps/store/src/app/checkout/checkout-client.tsx:134,167`
- `{ ok, error }` — `apps/admin/src/lib/actions/*.ts`, e.g. `apps/admin/src/lib/actions/catalog.ts:339-341`

### D-4 · Two clients, two mutation idioms, neither documented
§9.2, §13. The store has zero server actions; the admin has zero query cache. 19 `router.refresh()` sites, one idiom.
- Store mutations, all hand-rolled `fetch` to JSON routes: `apps/store/src/app/checkout/checkout-client.tsx:73,134,167,188`; `apps/store/src/components/pay-button.tsx:19`; `apps/store/src/components/auth-modal.tsx:59,92`; `apps/store/src/components/otp-modal.tsx:32,67`; `apps/store/src/app/cart/page.tsx:49`; `apps/store/src/app/account/account-area.tsx:28`
- Admin: 7 `"use server"` modules + `useActionState` in 15 components, invalidated at `apps/admin/src/app/(panel)/blog/delete-post.tsx:13`, `apps/admin/src/app/(panel)/categories/categories-manager.tsx:54,125,203`, `apps/admin/src/app/(panel)/collections/collections-manager.tsx:73,155`, `apps/admin/src/app/(panel)/discounts/delete-discount.tsx:13`, `apps/admin/src/app/(panel)/inventory/adjust-form.tsx:16`, `apps/admin/src/app/(panel)/media/media-library.tsx:17`, `apps/admin/src/app/(panel)/media/media-upload.tsx:26`, `apps/admin/src/app/(panel)/orders/[id]/transitions.tsx:43`, `apps/admin/src/app/(panel)/pages/delete-page.tsx:13`, `apps/admin/src/components/discount-form.tsx:33`, `apps/admin/src/components/nav-editor.tsx:125`, `apps/admin/src/components/page-builder.tsx:172`, `apps/admin/src/components/product-form.tsx:52`, `apps/admin/src/components/settings-form.tsx:26`

### D-5 · Caching is affirmatively declined on every public route, with no ADR
§9.2 "cached server data" for the SEO audience. `revalidatePath|revalidateTag|unstable_cache|cache(|noStore` → **0 matches** in `apps/`.
- `export const dynamic = "force-dynamic"` on all 13: `apps/store/src/app/page.tsx:6`, `[slug]/page.tsx:7`, `account/page.tsx:7`, `blog/page.tsx:7`, `blog/[slug]/page.tsx:7`, `category/[slug]/page.tsx:6`, `checkout/page.tsx:6`, `collection/[slug]/page.tsx:6`, `order/[orderNumber]/page.tsx:14`, `orders/page.tsx:7`, `product/[slug]/page.tsx:9`, `products/page.tsx:4`, `api/search/route.ts:4`

### D-6 · No enforcement layer of any kind
§16, §12. Nothing below can fail, so nothing below is checked.
- `turbo.json:2-18` — no `test` task, no `audit` task
- `turbo.json:12` — a `lint` task that no workspace implements (`grep '"lint"'` over 7 manifests → 0)
- `turbo.json:14-16` — `generate` sets `cache: false` instead of declaring outputs, so codegen is outside the cache
- `turbo.json:8-11` — `dev` missing `dependsOn: ["^build"]`
- `package.json:8-21` — no `test` script, no `audit` script
- No `.github/` directory — no CI at all
- No `scripts/audit.sh`, no `.dependency-cruiser.js`, no `ratchet.json`, no `packages/config`

### D-7 · Tool versions declared in six manifests, none at the root
§6 rules 3, 4. A routine bump changes what each check means.
- `typescript` in 7 of 7 manifests; `vitest` in 4; `next` in 3; root declares only `turbo` (`package.json:21-23`)
- `react`/`react-dom ^19.2.6` in both apps vs `packages/ui` asking `^19.2.0` in peerDependencies
- `pnpm-workspace.yaml` `overrides` pins four transitive packages but **no `react`** — the two-copies-of-React failure §6 rule 4 names is unguarded

### D-8 · Seven hand-copied tsconfigs and no shared base
§5.3, §6 rule 2. Strictness is `true` everywhere today; nothing holds it there.
- No `extends` in any of the 7. Restated keys: 14 each in `apps/store/tsconfig.json:2-27` and `apps/admin/tsconfig.json:2-27`; 9 in `packages/scraper/tsconfig.json:2-10`; 8 in `packages/ui/tsconfig.json:2-10`; 7 each in `packages/db/tsconfig.json:2-9`, `packages/schema/tsconfig.json:2-9`, `packages/adapters/tsconfig.json:2-9`
- `packages/scraper/tsconfig.json` already diverges: `target: ES2024` and `moduleResolution: "Bundler"` where its siblings use `ES2022` / `"bundler"`

### D-9 · Every package ships TypeScript source, and none has a build step
§5.2: ships build output, not source. Consumers compile the library.
- `packages/ui/package.json:6-9`, `packages/schema/package.json:6-10`, `packages/db/package.json:7-8`, `packages/adapters/package.json:7`, `packages/scraper/package.json:7-9` — all point at `./src/*.ts`
- No `build` script in any of the 5; `turbo.json:3-7` declares outputs `.next/**` and `dist/**`, and nothing produces `dist/`
- Consequence: non-erasable syntax in `packages/db/src/generated/` would surface as a load-time `SyntaxError`, not a build error

### D-10 · `packages/ui` declares `react` as a peer but not as a dev dependency
§5.2: the runtime goes in *both*. Its own `vitest run` has no React to render with; the two tests only exercise pure logic, which is why the gap is invisible.
- `packages/ui/package.json:25-28` — `peerDependencies: { react, react-dom }`
- `packages/ui/package.json:29-34` — `devDependencies` has `@types/react`, `@types/react-dom`, `next`, `typescript`, `vitest` — **no `react`**

### D-11 · The database package exists, and publishes a seed file as an entry point
§5.5: *a database package does not exist.* The manifest carries the tell.
- `packages/db/package.json:8` — `"./manufacturers": "./seed/iranian-manufacturers.ts"`
- §5.5's own diagnosis applies: the package is the symptom, the client's import is the violation (C-1)

### D-12 · Clients compile against generated Prisma model types
§5.4: *the restatement is the point — it is where a column rename stops being a client's problem.*
- `apps/store/src/lib/discounts.ts:69` — `type DbDiscount = Prisma.DiscountGetPayload<…>`
- `apps/admin/src/lib/inventory.ts:11` — `type InventoryClient = Pick<Prisma.TransactionClient, …>`
- Type-only, into the presentation layer: `apps/store/src/components/category-sidebar.tsx:2`, `apps/store/src/components/product-listing.tsx:1`, `apps/store/src/components/mobile-category-filter.tsx:6`, `apps/admin/src/lib/actions/ctx.ts:5`

### D-13 · The app-wide result contract lives inside one feature's folder
§9.4. `ActionState` is declared in the auth action and imported by 20 files across 8 other features.
- `apps/admin/src/lib/actions/auth.ts:10`

### D-14 · The cart item type is declared twice
- `apps/store/src/lib/cart.ts:9` `CartItemInput` vs `apps/store/src/components/cart-provider.tsx:7` `CartLine`

### D-15 · The settings schema is maintained in three places
Adding one key means three edits.
- Canonical: `packages/schema/src/setting-keys.ts`
- Hand-maintained section→field→type map plus an `ENUM_VALUES` allow-list: `apps/admin/src/lib/actions/settings.ts:17-64`, `:60-62`
- A second `SECTION_DEFS`: `apps/admin/src/app/(panel)/settings/page.tsx:64`

### D-16 · The nav target vocabulary is declared twice
- Kernel: `apps/store/src/lib/nav.ts:33-58` · Client union: `apps/admin/src/components/nav-editor.tsx:15`, while the action validates with the kernel `menuSchema`

### D-17 · `toFaDigits` is imported through two different specifiers for the same symbol
- `apps/store/src/components/order-row.tsx:2` (`@kmodern/schema/format`) vs `packages/ui/src/showcase/showcase.tsx:3` and `packages/ui/src/showcase/product-gallery.tsx:8` (`@kmodern/schema`)

### D-18 · Date and number formatting is inlined at 14 sites while the kernel helper exists
§10: *no component formats a date or a currency inline.*
- `apps/store/src/app/order/[orderNumber]/page.tsx:71,119`; `apps/store/src/app/blog/[slug]/page.tsx:24`; `apps/store/src/app/blog/page.tsx:30,45`; `apps/store/src/components/post-card.tsx:101`; `apps/store/src/components/order-row.tsx:44`; `apps/store/src/components/search-suggestions.tsx:19`; `apps/store/src/components/reactbits/index.tsx:183`; `apps/store/src/app/checkout/checkout-client.tsx:152` (despite importing `formatToman`/`toFaDigits` at `:9`); `apps/admin/src/app/(panel)/products/page.tsx:127`
- The helper being bypassed: `packages/schema/src/format.ts:6-8`

### D-19 · Admin re-implements 15 components with a class-merge helper that does not merge
§11.2, §3 rule 5. `cn` is concatenation, so conflicting utilities resolve by stylesheet order, not intent — all ~14 admin `cn(...)` sites are affected.
- `apps/admin/src/components/ui.tsx:9` — `(...c) => c.filter(Boolean).join(" ")` vs the real `twMerge(clsx())` at `packages/ui/src/cn.ts:4-5`
- The duplicated components, each with hand-rolled variant maps instead of `cva`: `apps/admin/src/components/ui.tsx:11` Button, `:56` Label, `:60` Field, `:102` Input, `:106` Textarea, `:110` Select, `:118` Checkbox, `:127-149` Card/CardHeader/CardBody, `:150-162` Badge, `:179-234` Table family — all present in `packages/ui/src/components/`
- `faDigits` reimplemented a third time at `apps/admin/src/components/ui.tsx:306-308`

### D-20 · Three component stacks coexist; `packages/ui` is imported by admin exactly once
§11.2, §5.5. That one import proves the wiring works.
- Store: HeroUI — `apps/store/package.json:15-16`, `apps/store/src/app/providers.tsx:3`
- Admin: the local kit above
- Shared: `packages/ui`, imported by admin at `apps/admin/src/components/media-picker-button.tsx:11-12` and by 11 store files
- Only 4 symbols are genuinely shared: `Price`, `RankNumeral`, `SectionHeader`, `ProductGallery`/`ColorDotSwatches`

### D-21 · The semantic token layer and the composed classes exist in one client only
§11.1. A store class copied into admin would compile to nothing — a silent failure, not an error.
- Store-only semantic mapping (22 HeroUI variables): `apps/store/src/app/showcase-theme.css:6-53`
- Store-only `.card-lift`: `apps/store/src/app/showcase-theme.css:80-88`, used at `apps/store/src/components/showcase-card.tsx:48`, `apps/store/src/components/floating-product-card.tsx:27`, `apps/store/src/components/site-header.tsx:89`
- ~26 store-only composed classes: `apps/store/src/app/globals.css:60-654`
- Store call sites reading variables admin never defines: `apps/store/src/app/cart/page.tsx:192,210`, `apps/store/src/app/checkout/checkout-client.tsx:394`, `apps/store/src/app/order/[orderNumber]/page.tsx:110,128`, `apps/store/src/app/api/cart/…` via `otp-modal.tsx:93`, `search-bar.tsx:81`
- Admin: `apps/admin/src/app/globals.css` is 5 lines and defines **zero** custom properties
- The primitive layer is genuinely shared with 0 divergence: `packages/ui/tailwind.css:78-107`, imported by both

### D-22 · ~700 utility chains, 3 composed classes, and 0 of the 12 most repeated tokenized
§11.1: *if the chain is new and repeats, add a token.*
- The whole system's composed layer: `packages/ui/tailwind.css:110-114` `text-price`, `:116-120` `text-code`, `:129-131` `animate-badge-pop`
- `grid grid-cols-1 gap-4 md:grid-cols-2` — 12 exact (`apps/admin/src/app/(panel)/orders/new/form.tsx:69,124`, `apps/admin/src/components/blog-editor.tsx:244,306`, `apps/admin/src/components/discount-form.tsx:61`, `apps/admin/src/components/page-builder.tsx:205`, `apps/admin/src/components/product-form.tsx:92,142,222`, `apps/admin/src/components/scraper-panel.tsx:1421,1442`, `apps/admin/src/components/settings-form.tsx:65`)
- `text-sm font-bold text-ink` — 11 exact
- The notice recipe, 16 exact across 9 files: `rounded-card bg-red-50 px-3 py-2 text-sm text-red-700` at `apps/admin/src/app/(panel)/media/media-library.tsx:29`, `apps/admin/src/app/(panel)/orders/[id]/transitions.tsx:100`, `apps/admin/src/app/(panel)/orders/new/form.tsx:155`, `apps/admin/src/app/change-password/change-password-form.tsx:28`, `apps/admin/src/app/login/login-form.tsx:28`, `apps/admin/src/components/blog-editor.tsx:318`, `apps/admin/src/components/nav-editor.tsx:236`, `apps/admin/src/components/page-builder.tsx:252`, `apps/admin/src/components/product-form.tsx:238`, `apps/admin/src/components/settings-form.tsx:87`; emerald twin ×6; and a **third** implementation of the same idea at `apps/store/src/components/status-notice.tsx:3-7,25`
- The form-control recipe, 11 exact: `rounded-card border border-fog px-3 py-2 text-sm`
- `px-3 py-2 text-sm` — 40 exact
- The admin filter bar — 7 exact: `apps/admin/src/app/(panel)/audit/page.tsx:88`, `blog/page.tsx:41`, `discounts/page.tsx:41`, `inventory/page.tsx:53`, `orders/page.tsx:64`, `pages/page.tsx:56`, `products/page.tsx:72`
- `text-price` exists and is ignored ~15×: `apps/store/src/app/cart/page.tsx:183,196`, `apps/store/src/app/order/[orderNumber]/page.tsx:143,145`, `apps/store/src/components/order-row.tsx:51`, `apps/store/src/app/checkout/checkout-client.tsx:332,354,370`
- Arbitrary values repeating where a token documents the value: `rounded-[30px]` ~30×, `text-[11px]` ~20×

### D-23 · The generated client is entered from two modules, not one index
§8, §5.2.
- `packages/db/src/index.ts:1-2` (two export statements naming the same module) and `packages/db/src/client.ts:2`

### D-24 · The kernel's exports map is not one entry per entry point, and `index.ts` is both definition site and barrel
§5.2 "group by feature, not by layer", §5.2 exports map.
- `packages/schema/package.json:6-10` — 4 entries, but a partial re-export tail at `packages/schema/src/index.ts:462-470` that omits `sanitize` and `setting-keys`, which is why those needed subpaths
- `packages/ui/package.json:6-9` — no wildcard, but a single `.` barrel over feature folders on disk (`packages/ui/src/index.ts:1-45`), so `components/section-header` and `showcase/price` are not individually addressable

### D-25 · No tier rank is recorded anywhere, so the upward-import rule cannot be checked at all
§4: *an unranked workspace is where a second architecture grows.*
- Observed edges: `admin→{db,schema,ui,adapters,scraper}`, `store→{db,schema,ui,adapters}`, `db→schema`, `ui→schema`. `adapters` and `scraper` have no kernel edge and no rank assigned. No rank table exists in any file.

### D-26 · The kernel holds runtime dependencies, which §4 forbids and §10 requires
A blueprint tension, not a repo bug — but the check cannot land until it is resolved.
- `packages/schema/package.json:8-11` — `zod`, `sanitize-html`
- §4: tier 1 *depends on nothing*. §10: *a schema library in the kernel.* Both cannot hold literally.

### D-27 · `packages/scraper/src` is 16 flat files with 3 executables as siblings
§5.2 group by feature; §7.1 archetype discipline by analogy.
- Entrypoints: `packages/scraper/src/cli.ts:1` (shebang, `process.exit` at `:89`, `:93`), `packages/scraper/src/price-list-cli.ts:1` (`:16`, `:53`), `packages/scraper/src/tui.ts:1` (602 lines, `main()` at `:594`)
- Inconsistent direction inside one package: `packages/scraper/src/pipeline.ts:426` dynamic-imports `./price-list` while `packages/scraper/src/index.ts:3` imports it statically
- `packages/scraper/src/source-options.ts` — 9 lines of Persian label data consumed by the **admin UI** at `apps/admin/src/app/(panel)/scraper/page.tsx:2`, published as its own subpath (`packages/scraper/package.json:9`) and absent from `index.ts`. A CLI package is now a UI data source.

### D-28 · Two `"use server"` modules export types; a naive gate would also catch a module that is deliberately not one
§15.1 "use server exports only async functions". The current build is green, so this Next version tolerates it — the gate must encode what the framework actually rejects.
- `apps/admin/src/lib/actions/auth.ts:10` `export interface ActionState`
- `apps/admin/src/lib/actions/ctx.ts:10` `export interface ActionCtx`
- False positive to avoid: `apps/admin/src/lib/actions/form-helpers.ts:1` is a grep hit but is deliberately *not* a server-action module; its 4 sync exports are correct

### D-29 · 18 route-local components sit directly in route directories
§9.4: route directories hold only framework route files. The trigger is a count of one, and `_components/` is the destination.
- `apps/store/src/app/` — 6: `providers.tsx`, `global-error.tsx`, `account/account-area.tsx`, `account/account-login.tsx`, `checkout/checkout-client.tsx`, `showcase-theme.css`
- `apps/admin/src/app/` — 12: `login/login-form.tsx`, `change-password/change-password-form.tsx`, `(panel)/blog/delete-post.tsx`, `(panel)/categories/categories-manager.tsx`, `(panel)/collections/collections-manager.tsx`, `(panel)/discounts/delete-discount.tsx`, `(panel)/inventory/adjust-form.tsx`, `(panel)/media/media-library.tsx`, `(panel)/media/media-upload.tsx`, `(panel)/orders/[id]/transitions.tsx`, `(panel)/orders/new/form.tsx`, `(panel)/pages/delete-page.tsx`
- Correctly exempt under the reference config: `icon.png`, `apple-icon.png`, `robots.ts`, `sitemap.ts`, `globals.css`

### D-30 · App workspace roots carry entries no rule names
§5.1 fence. Also: both apps **lack** the `.env.example` the fence names, which the reference check does not test.
- `apps/store/components.json`, `apps/store/PRODUCT.md`, `apps/store/.impeccable/`, `apps/store/tests/`
- `apps/admin/tests/`

### D-31 · Two docs entry points per app, and one is tool-generated
§13, §15.1: *exactly one, not zero, not both names.*
- `apps/store/AGENTS.md` + `apps/store/CLAUDE.md` (the latter is a one-line `@AGENTS.md` alias)
- `apps/admin/AGENTS.md` + `apps/admin/CLAUDE.md`
- `apps/store/AGENTS.md:1-9` is a `next dev`-generated block naming `generate-agent-files.js` and stating it is re-added on every dev run — the "index" is tool output, not a pointer to per-surface docs

### D-32 · `docs/` has no index, so all 7 documents are unlinked
§15.1: *every document under `docs/` is linked from the docs index.*
- `docs/index.md` does not exist
- Unlinked: `docs/adr/0001-showcase-design-language.md`, `docs/adr/0002-heroui-component-stack.md`, `docs/agents/domain.md`, `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/admin-qc-notes.md`, `docs/agents/price-list-debug-notes.md`
- The ADRs record the component stack in detail and nothing about rendering — that is D-4's documentation half

### D-33 · One test reaches out of its workspace; the fixture in another is unchecked; none of the three can run
§15.2 test surface; §12 "test is a first-class task".
- `apps/store/tests/manufacturer-marquee.test.ts:3` — `../../../packages/db/seed/iranian-manufacturers`, bypassing the declared public export at `packages/db/package.json:7`. It also re-declares the domain rule internally at `:5` and `:6-21`
- `apps/store/tests/search-endpoint.test.ts:16-30` — a 14-field invented fixture, `:31` cast `as unknown as Results[number]`, so a real return-type change still compiles
- `apps/admin/tests/security.test.ts:7-13,15-30,32-38` — three unrelated features under one name
- `apps/admin` has **no `vitest.config.ts`**, unlike `apps/store/vitest.config.ts:6-7` (alias) and `:11` (`include`), `packages/ui`, `packages/scraper`
- `turbo.json:2-18` and `package.json:8-21` — no `test` task or script; no CI

### D-34 · Four units carry several jobs each
§15.2 SOLID (SRP). No inheritance anywhere in the monorepo — 2 classes, 0 hierarchies — so LSP is not the problem.
- `packages/scraper/src/pipeline.ts:191-441` — `runPipeline`, **251 lines, 8 jobs**; vendor hard-wired at `:312`; a DTO mapper for another workspace at `:464-490` (consumed by `packages/db/seed/seed.ts:23-36`)
- `packages/scraper/src/price-list.ts` — 706 lines, 23 top-level functions, 5 concerns
- `apps/admin/src/lib/scraper-jobs.ts` — 492 lines, 1 class, 16 methods, 8 concerns
- `packages/scraper/src/tui.ts:147-592` — `ScraperTui`, 602 lines, 8 responsibilities, 0 seams
- Interface wider than its consumers: `packages/scraper/src/pipeline.ts:40-60` — 15 optional members, of which `imageDir`, `imageMinIntervalMs`, `imageMaxBytes`, `outDir` have no consumer outside the file

### D-35 · The size ceiling has passed without the prescribed extraction, and the remedy has never been applied once
§9.4. The whole monorepo has **2 custom hooks and 0 `use-<feature>.ts` files**.
- `apps/admin/src/components/scraper-panel.tsx` — 1475 lines; **45 contiguous `useState` at `:317-361`**; one 828-line component at `:316-1143`; 7 local components; 9 pure helpers; its own fetch transport at `:281-301`; its own URL sanitiser; its own multi-select widget; 7 label dictionaries; 9 feature concerns. Only extraction is the type contract (`apps/admin/src/lib/scraper-types.ts`)
- `apps/store/src/components/block-renderer.tsx` — 572 lines; 20 of 25 block types inline in the 482-line `switch` at `:79-560`; **queries the DB at `:410`**
- `apps/store/src/app/checkout/checkout-client.tsx` — 417 lines, 17 `useState`, **zero** extraction
- `apps/admin/src/components/blog-editor.tsx` — 443 lines; ~105 lines of JSON codec (`:57-161`) never extracted
- `apps/admin/src/components/page-builder.tsx` — 398 lines; a 103-line config table at `:53-155` re-declaring keys already in `packages/schema/src/index.ts:220-246`
- The only 2 hooks: `apps/store/src/components/cart-provider.tsx:83` `useCart`, `packages/ui/src/accents/use-in-view.ts:8` `useInView`
- Three copies of the job-lifecycle rule: `apps/admin/src/components/scraper-panel.tsx:363`, `apps/admin/src/lib/scraper-jobs.ts:115-117`, `packages/scraper/src/tui.ts:34-37`

### D-36 · Three units mix fetching, transformation and rendering
§9.4.
- `apps/admin/src/components/scraper-panel.tsx` — all three, plus 45 state hooks
- `apps/store/src/app/checkout/checkout-client.tsx` — 4 fetch sites (`:71,135,167,188`), key derivation (`:98-116`), rendering (`:216-391`)
- `apps/store/src/components/block-renderer.tsx` — rendering-dominant, but fetching at `:410` and URL transforms at `:58-77`

### D-37 · No feature has a root; layer folders hold all feature code
§9.4. In both clients `src/lib/` and `src/components/` are the only place a feature can live, so every per-feature file is filed by layer.
- `apps/store/src/components/` — 35 files, 25 of them single-feature
- `apps/admin/src/components/` — 11 files, 8 single-feature
- `apps/store/src/lib/` — 10 files spanning 7 features; `apps/admin/src/lib/` — 12 files
- `apps/admin/src/lib/actions/catalog.ts:33,177,262` — three features in one file; `content.ts:53,143,244` — three; `settings.ts:13,108` — two
- `apps/store/src/lib/orders.ts` (216 lines) — repository query `:30`, a rule that throws a Persian UI string `:51-60`, sequence generator `:70`, pricing `:48,:87`, four stock services `:138,168,183,196`, event log `:209`; the thrown string becomes the HTTP body at `apps/store/src/app/api/checkout/route.ts:131`
- `apps/store/src/lib/queries.ts` (221 lines) — 6 aggregates + a second settings reader `:218` + a duplicate discount rule `:213`
- No `src/types/`, `src/features/`, `src/hooks/` or `src/state/` in either client

### D-38 · Three of four vendor boundaries have no port, and the one that does is half-built
§2. **0 ports exist to dodge a cycle** — that part of the law holds cleanly.
- Declared: `packages/adapters/src/storage.ts:46-51` `interface Storage`, one implementer `S3Storage:53`
- Not declared: payment `packages/adapters/src/zarinpal.ts:48,77`; SMS `packages/adapters/src/kavenegar.ts:33`; shipping `packages/adapters/src/postex.ts:29`
- `packages/adapters/src/index.ts:1-30` re-exports 7 vendor-named functions and **zero** vendor-neutral names
- 6 of 7 consuming files import a concrete vendor at the import statement: `apps/store/src/app/api/orders/[id]/pay/route.ts:3`, `…/pay/callback/route.ts:3`, `apps/store/src/app/api/checkout/route.ts:9`, `apps/store/src/lib/auth.ts:4`, `apps/store/src/lib/shipping.ts:5`, `apps/store/src/app/checkout/page.tsx:1`
- The one real port is half-built: local disk is re-implemented **inline, once per method** — `apps/admin/src/lib/media.ts:48-54`, `:59-66` plus a second walker at `:67-83`, `:100-106`
- Exemplar, in the scraper: `packages/scraper/src/sources.ts:16-27` `SourceAdapter`, 2 implementers (`:78` datees HTML crawl, `packages/scraper/src/schuffel.ts:303` WordPress JSON API), registry at `:226`

### D-39 · The coupon is normalised in the reader, not at the write path
§10: normalise at **every write path**. It holds only because both read sites sit behind one function.
- Reader: `apps/store/src/lib/discounts.ts:122-123`
- Writer stores it raw: `apps/admin/src/lib/actions/settings.ts:145`
- The kernel schema's `code` field preprocesses only `""` → `undefined`: `packages/schema/src/index.ts:416-419`

### D-40 · The kernel validates content blocks but not domain writes; the scraper has no kernel dependency at all
§10 validation split.
- `packages/db` depends on `@kmodern/schema` (`packages/db/package.json:22`) but uses it for content only — `packages/db/seed/bootstrap.ts:1,333-341`, `packages/db/seed/update-home-deals.ts:6,95-101`. Domain writes go through no schema: `packages/db/seed/seed.ts:192,199`; `catalog.json` prices trusted verbatim
- `packages/scraper/package.json:13-18` — no `@kmodern/schema` dependency, so the shared money function was never reachable there (see C-6)
- `packages/scraper/src/pipeline.ts:474-476` — currency passed through with no enum check; the consumer hardcodes the fallback at `apps/admin/src/lib/scraper-import.ts:69`

### D-41 · A root script and a stale shadcn config, neither wired to anything
§5.5, §11.2.
- `apps/store/components.json:21` registers a `@react-bits` shadcn registry that was never used, and sets `aliases.ui: "@/components/ui"` — a path that does not exist in the store
- `apps/admin` has no `components.json` at all, so the two clients do not agree on whether they have a shadcn surface

---

# Group 3 — Cosmetic (14)

### K-1 · App root entries no rule names (§5.1)
- `apps/store/PRODUCT.md` — a product brief; the only technical statements are `:12` and `:42`
- `apps/store/components.json` (also D-41)
- `apps/store/.impeccable/surfaces/apps-store-src-app-product-slug-page-tsx.md` — 1 file
- `apps/store/tests/manufacturer-marquee.test.ts`, `apps/store/tests/search-endpoint.test.ts`, `apps/admin/tests/security.test.ts`
- No `.env.example` at either app root or the repo root

### K-2 · A stray directory at the repo root, named with a URL scheme intact
Almost certainly a `local://` artifact written to disk.
- `local:/admin-spec.md` — 9,997 bytes, dated Aug 6

### K-3 · A colour literal in a component (§11.1)
- `apps/store/src/components/product-buy-box.tsx:156` — inline `style={{ backgroundColor: variant.colorCode ?? "#d7d7d7" }}`

### K-4 · Six "colour literals" that are domain data, not styling
A ratchet parked at 6 for ever on a number that means nothing unless the scope is narrowed.
- `apps/admin/src/lib/scraper-import.ts:28-33` — a product colour-palette lookup (`black`, `white`, `gray`, `beige`, `silver`, `steel`) with Persian labels
- Token definition files, correctly excluded: `apps/store/src/app/showcase-theme.css` (20 hex), `packages/ui/tailwind.css` (17 hex)

### K-5 · A second stylesheet at a route root, not exempt under the reference config
- `apps/store/src/app/showcase-theme.css` — needs either an allowlist entry or a move; `globals.css` is the only stylesheet the reference exempts

### K-6 · Dead client code on the storefront's critical path
- `apps/store/src/components/reactbits/index.tsx:137-190` `CountUp` and `:283-329` `Magnet` — the only occurrences of either symbol anywhere. The module is `"use client"` at `:1`, so every consumer imports the whole file including both
- `apps/store/src/components/reactbits/index.tsx:149-172` duplicates `packages/ui/src/accents/counter.tsx:12-45`; the observer effect is written out three times at `:28-43`, `:88-107`, `:149-172` while `packages/ui/src/accents/use-in-view.ts:8` exists to hold it
- `packages/ui/src/accents/` — none of `FadeWords`, `SlideWords`, `RiseBlock`, `Counter` is imported by either app

### K-7 · A duplicated utility inside the shared kit itself
The exact artefact a real merge layer would prevent.
- `packages/ui/src/components/section-header.tsx:57` — `motion-reduce:transform-none` twice in one chain

### K-8 · Dead imports and constants
- `packages/adapters/src/storage.ts:8` — `GetObjectCommand` imported, never used
- `packages/db/seed/seed.ts:91` — `IMAGS_BASE`, never read, pointing at the deleted `apps/legacy-store`
- `packages/scraper/src/tui.ts:34-37` / `:419-422` / `:524-527` — a fourth label mirror of the job lifecycle

### K-9 · The root context file still lists a deleted workspace
- `CLAUDE.md` — workspace map names `apps/legacy-store` (Vite legacy) as a third app; `apps/` contains only `store` and `admin`

### K-10 · Build output that is not build output
Flagged by a naive check, and it matters for the ratchet command.
- `packages/scraper/out/` — 5 gitignored JSON/image files of **scrape runtime output** (`raw-scrape.json`, `merge-report.json`, `price-list-report.json`, `catalog.fragment.json`, `images/`). Not a build artifact, so it must not be added to `turbo.json` outputs; but it contains committed-style artefacts referenced by the currency finding (C-6)

### K-11 · The ratchet commands must exclude the blueprint kit itself
`docs/blueprint/reference/.prettierrc`, `docs/blueprint/reference/.prettierignore`, `docs/blueprint/reference/eslint.config.mjs` are the 3 `stray-tool-config` hits. **0 in repo source.** Per §15.3 rule 1 the exclusion belongs in `ratchet.json`, not in prose.

### K-12 · A commit-time rule that would land red
`update-home-deals.ts` and the rest of `seed/` are one-off, so this is noted rather than fixed — but the gate must not encode a rule the scripts cannot satisfy.
- Covered by C-14/C-15; the scripts are manual, and `packages/db/package.json:14-19` exposes each as a named script rather than a `prisma db seed` entry

### K-13 · Client-boundary widening for animations
- `apps/store/src/components/home-hero.tsx:1` and `apps/store/src/components/product-grid.tsx:184` are `"use client"` **solely** to host the animation primitives — widening the client boundary to the whole hero and the whole product grid, while `apps/store/src/components/deal-grid.tsx` and `apps/store/src/components/block-renderer.tsx` consume the same animations as server components

### K-14 · Duplicated text constant on a route
- `apps/store/src/components/order-row.tsx:28-33` `STATUS_CLS` vs the label maps at `apps/store/src/app/order/[orderNumber]/page.tsx:16,26,33` — duplicated again inside the same file at `:156,165`. The same status vocabulary in three shapes (see D-1)

---

## What the register does not cover

- **§15.1 Data, both rows.** `packages/db/prisma/migrations/0001_init/migration.sql` has exactly 1 commit ever (`ca169e3`), so immutability passes by construction with no CI to keep it true; the drift diff needs a live database and was not run.
- **§15.1 Boundaries row 2.** Uncheckable until D-25 is resolved.
- **Anything requiring a build.** C-16's broken utilities and D-28's tolerated type exports were read from source and config, not from an observed `next build`.

## Sequencing note (§17.2 "one structural change per merge request")

If these are worked through, the order the blueprint prescribes for the boolean items is: **C-1 first
(it outranks everything else), then C-2/C-3, then D-6 tooling, then the gates green.** But D-6 before
C-1 would land a red gate, which §16.2 calls the failure mode that teaches everyone to ignore it —
and every gate in D-6 would immediately be red on C-1, D-1 and D-25. The realistic reading is that
D-25 (the rank table) and the two decisions already surfaced — whether §3 rule 1 is adopted, and
whether the UI package is shared or split (D-19, D-20, D-21) — are prerequisites, not Phase 1 work.

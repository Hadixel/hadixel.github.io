# §15.2 judgement invariants — worked by hand

Companion to `phase-0-measurements.md` and `phase-0-mechanical-invariants.md`. Phase 0 (measure)
only; **no repo code changed**. Every item below was read out of the actual files, not inferred from
filenames. §15.2 rules are *reported, never failed* — so this document reports.

**Scoreboard: 2 HOLD, 3 MIXED, 9 VIOLATED.** The two that hold are the port boundary in the scraper
and the primitive token layer; they are also the two rules most people would assume were broken.

---

## 1. Does every folder have one job, or has one become a catch-all? — **VIOLATED**

| Directory | Files | One job? |
|---|---|---|
| `apps/store/src/components/` | **35** | **No** — 25 of 35 belong to exactly one feature; 10 are app-wide |
| `apps/store/src/lib/` | **10** | **No** — 7 features in one folder (`cart`, `orders`, `discounts`, `shipping`, `nav`, `auth`, `settings`), plus `search` as two files, plus `queries.ts` spanning catalogue + blog + CMS + deals + settings |
| `apps/admin/src/lib/actions/` | **8** | **No** — grouped by panel area, and 3 files hold 2–3 features each: `catalog.ts` = products + categories + collections, `content.ts` = pages + blog + nav, `settings.ts` = settings + **discounts** |
| `apps/admin/src/components/` | **11** | **No** — 8 are single-feature |
| `apps/admin/src/lib/` | **12** | **No** — 6 features + 4 app-wide + 4 scraper |
| `apps/store/src/app/api/`, `apps/admin/src/app/api/admin/` | 8 / 5 | **Yes** — pure HTTP boundary |
| `apps/store/src/lib/shipping.ts` | 1 | **Yes** — the one file in either client that is honestly single-purpose |

The two cleanest folders are the API routes, which are the one place the layering is not fighting
anything. Everything else is a layer folder pretending to be a feature tree.

## 2. Is each directory's archetype the right one, or chosen by inertia? — **VIOLATED (2 of 3 packages)**

- **`packages/scraper/src` — 16 top-level files, 0 subdirectories, 3 of them executables.** `cli.ts:1`
  (shebang, `process.exit` at `:89`/`:93`), `price-list-cli.ts:1` and `tui.ts:1` (602 lines) sit as
  flat siblings of 13 library modules. The shared CLI plumbing is a "support folder" of one function
  (`args.ts`, 5 lines) imported by exactly two files (`cli.ts:14`, `price-list-cli.ts:8`). A reader
  cannot tell which files are runnable without checking shebangs. Direction is inconsistent *inside*
  the package: `pipeline.ts:426` dynamic-imports `./price-list` while `index.ts:3` imports it
  statically.
- **`packages/scraper/src/source-options.ts`** is 9 lines of Persian label data consumed by the
  **admin UI** (`apps/admin/src/app/(panel)/scraper/page.tsx:2`), published as its own subpath
  (`packages/scraper/package.json:9`) and absent from `src/index.ts`. A CLI package is now a UI data
  source — the archetype drifted after the fact.
- **`packages/db/src` — correct.** `client.ts` (29 lines, infrastructure) + `index.ts` (4 lines,
  pure barrel), and **no consumer deep-imports**: `@kmodern/db/` and `generated/prisma` return **0
  matches** across both apps, the seeds, the scraper and `scripts/`. All 64 import sites use the bare
  specifier. This is the one place the one-way law is fully respected.
- **`packages/schema/src` — mixed.** `index.ts` is both the definition site (~460 lines of zod) and a
  partial barrel (9-line re-export tail at `:462-470`) that omits `sanitize` and `setting-keys` —
  which is why those two needed subpaths. Inconsistent for one symbol: `toFaDigits` comes from
  `@kmodern/schema/format` in `apps/store/src/components/order-row.tsx:2` but from `@kmodern/schema`
  in `packages/ui/src/showcase.tsx:3`.

## 3. Does every port guard a real swappable boundary? — **MIXED, leaning violated**

Four outbound vendor boundaries, **one** declared port:

| Boundary | Port declared? | Implementers | Consumer coupling |
|---|---|---|---|
| Object storage | **yes** — `interface Storage`, `packages/adapters/src/storage.ts:46-51` | 1 — `S3Storage:53` | 1 of 7 consumers imports the type (`apps/admin/src/lib/media.ts:4`) |
| Payment gateway (Zarinpal) | **no** — free functions `zarinpal.ts:48,77` | — | `pay/route.ts:3`, `callback/route.ts:3`, `checkout/page.tsx:1` |
| SMS (Kavenegar) | **no** — `kavenegar.ts:33` | — | `checkout/route.ts:9`, `lib/auth.ts:4` |
| Shipping (Postex) | **no** — `postex.ts:29` | — | `lib/shipping.ts:5` |

`packages/adapters/src/index.ts:1-30` re-exports **7 vendor-named functions and zero vendor-neutral
names**, so no consumer can import "a payment gateway" — only "Zarinpal". **6 of 7 consuming files
import concrete vendors at the import statement.** Each adapter reads `process.env` inside itself
(`zarinpal.ts:11`, `kavenegar.ts:10`, `postex.ts:10`): there is no composition root and no injection
point, so the boundary is the module edge, not a substitutable object.

The one real port is half-built: `apps/admin/src/lib/media.ts` re-implements local disk **inline,
once per method** — `saveMediaFile:48-54`, `listMedia:59-66` plus a second walker at `:67-83`,
`deleteMediaFile:100-106`. `LocalStorage implements Storage` does not exist. Dead code in the port
module too: `GetObjectCommand` imported at `storage.ts:8`, never used.

**0 ports exist to dodge a cycle** (`packages/adapters/package.json:13-15` depends only on
`@aws-sdk/client-s3`; nothing in adapters imports db, schema or scraper). That part of §2 holds
cleanly.

**The exemplar is in the scraper, not the adapters:** `interface SourceAdapter`
(`packages/scraper/src/sources.ts:16-27`), **2 implementers** — `datees:78` (server-rendered HTML
crawled from `/product_cat/`) and `schuffel` (`schuffel.ts:303`, a WordPress `wp-json/wc/store/v1`
JSON API). Two protocols, two extraction strategies, one interface, a registry at `sources.ts:226`.
That is §2's textbook case, built by the person who was not thinking about §2.

## 4. Is a domain type duplicated in a client instead of read from the kernel? — **VIOLATED**

The kernel is real and well-formed, but five separate types are restated in the clients:

- **Prisma model types** in the presentation layer: `apps/store/src/lib/discounts.ts:69`
  `type DbDiscount = Prisma.DiscountGetPayload<…>`, `apps/admin/src/lib/inventory.ts:11`
  `type InventoryClient = Pick<Prisma.TransactionClient, …>`, plus 4 type-only client imports
  (item #3 in the mechanical pass). A column rename in `schema.prisma` becomes a client compile error.
- **`ActionState`** — the admin's app-wide mutation-result contract — is declared *inside the auth
  feature* at `apps/admin/src/lib/actions/auth.ts:10` and imported by **20 files across 8 other
  features**. The contract every feature depends on lives in one feature's folder.
- **Cart item**: `apps/store/src/lib/cart.ts:9` `CartItemInput` vs the duplicate
  `apps/store/src/components/cart-provider.tsx:7` `CartLine`.
- **Settings schema, three times**: `packages/schema/src/setting-keys.ts` (canonical),
  `apps/admin/src/lib/actions/settings.ts:17-64` (hand-maintained section→field→type map plus
  `ENUM_VALUES:60-62`), and `apps/admin/src/app/(panel)/settings/page.tsx:64` (a second
  `SECTION_DEFS`). Adding one setting key means editing three files.
- **Nav target vocabulary**: `apps/store/src/lib/nav.ts:33-58` resolves the kernel `LinkRef` enum;
  `apps/admin/src/components/nav-editor.tsx:15` re-declares the same union as a client-side
  `TargetType` string union while the action validates with the kernel `menuSchema`.

## 5. Has a feature grown large enough to split? A junk drawer is still a junk drawer. — **VIOLATED**

`apps/store/src/lib/orders.ts` (216 lines) is the archetype: a repository query
(`buildOrderContext:30`), a business rule that throws a Persian UI string as an exception
(`assertStock:51-60`), a sequence generator (`nextOrderNumber:70`), pricing
(`subtotalOf:48`, `computeOrderTotals:87`), four stock-mutation services (`:138,168,183,196`) and an
event-log writer (`:209`) — plus three input types. The layers are already mixed *at runtime*: that
thrown string becomes the HTTP error body at `app/api/checkout/route.ts:131`.

Also: `apps/store/src/lib/queries.ts` (221 lines, 6 aggregates + a second settings reader at `:218` +
a duplicate discount rule at `:213`); `apps/admin/src/lib/actions/catalog.ts` (346 lines, 3 features);
`content.ts` (413 lines, 3 features); `settings.ts` (settings **and** the whole discount write path);
`apps/admin/src/lib/scraper-jobs.ts` (492 lines, 8 concerns); `scraper-panel.tsx` (1475 lines).

Features whose surface says split: store catalogue (17 files / 6 dirs), store orders (9/7), store cart
(9/7), store auth+account (10/5), admin scraper (9/5, ≈2400 lines), admin orders (8/4).

## 6. Does a test reach into another feature's internals rather than its public surface? — **VIOLATED (1 of 3), and all 3 are orphaned**

- `apps/store/tests/manufacturer-marquee.test.ts:3` imports
  `../../../packages/db/seed/iranian-manufacturers` — a relative path that walks out of the
  workspace into a **seed script**, bypassing the declared public export
  `@kmodern/db/manufacturers` (`packages/db/package.json:7`). The public surface exists; the test
  ignores it. It also duplicates the domain rule inside itself (`CATEGORIES:5`, `REMOVED:6-21`), so it
  pins a copy rather than the rule.
- `search-endpoint.test.ts` respects surfaces (mocks `@/lib/queries` at its own entry point), but
  its fixture is fabricated: `:16-30` invents 14 fields then `:31` casts
  `as unknown as Results[number]`, so a change to the real return type still compiles. It pins the
  caller, never the callee.
- `security.test.ts` respects surfaces, but covers three unrelated features under one name —
  sanitisation, discount schema, and pagination clamping.

**None of them can run.** `turbo.json:2-18` declares no `test` task, root `package.json:8-21` has no
`test` script, there is no CI, and **`apps/admin` has no `vitest.config.ts` at all** (the other three
workspaces do), so its suite runs on vitest defaults with no `@` alias. A violating test that cannot
fail a build is worse than an active violation: there is no signal at all.

## 7. Is a controller reaching past its service to the data client? — **VIOLATED (client analogue)**

N/A literally — no gateway, no controllers. The real question is whether HTTP handlers and pages call
`db()` and the adapters directly with business rules inline. They do, everywhere:

- **`apps/store/src/app/api/checkout/route.ts`** — 5 rules inlined: COD-only-for-LOCAL gating
  (`:47-51`), the COD ceiling with a magic `50_000_000` default (`:52-57`), "at most one AWAITING
  order per customer" as an inline `findFirst` (`:59-66`, with the author's own uncertainty left in a
  comment at `:64`), the order create with its initial state machine (`:68-103`), and
  `commitCodStock` defined *inside the route* (`:139`) hard-coding a 48h reservation (`:150`).
- **`api/orders/[id]/pay/route.ts`** — the payment window (`:25-27`) and the TOMAN→Rial factor as a
  bare `order.total * 10` (`:30`).
- **`api/orders/[id]/pay/callback/route.ts`** — the whole settlement state machine, writing
  `paymentStatus` **three separate times with three non-transactional `db().order.update` calls**
  interleaved with three stock mutations. A concurrent duplicate callback can interleave
  `commitStock` and `releaseStock`. The admin's equivalent gets this right with a compare-and-set
  (`lib/actions/orders.ts:48-56`, comment: *"A concurrent duplicate request cannot apply the same
  transition twice"*) — the store has no equivalent, and the difference is invisible from the route
  names.
- **`apps/admin/src/lib/actions/orders.ts:14-27`** — `FULFILLMENT_NEXT` and `PAYMENT_NEXT`, the whole
  order lifecycle, in a form-plumbing module; plus ~10 inline validation rules in
  `createManualOrder` (`:106-121`).
- **`sameOrigin` CSRF check, byte-identical in 4 files**: `api/admin/scraper/import/route.ts:14-25`,
  `api/admin/scraper/route.ts:30-40`, `api/admin/scraper/prices/route.ts:19-29`,
  `api/admin/media/upload/route.ts:21-32`. A security control copy-pasted 4 times.
- **The low-stock predicate, 3 independent copies**: `app/(panel)/inventory/page.tsx:18,41`,
  `app/(panel)/layout.tsx:16-17`, `app/(panel)/page.tsx:17-24` — all reading the same setting key
  with the same default `3`. There is no `getLowStockCount()`.
- **`sameOrigin`'s sibling in spirit**: the audit-write policy "an audit outage must not orphan the
  job" lives in a `catch` at `api/admin/scraper/route.ts:186-189`, repeated at `:216-219` and
  `prices/route.ts:107-109`.

Where it *is* correct: `api/checkout/preview/route.ts:23-24` delegates to `cityBelongsToProvince` from
the kernel; `apps/store/src/lib/queries.ts` is a genuine read facade (10 named `get*` functions, the
subtree expansion at `:44-46`, the pricing workaround documented at `:68-70`); `lib/audit.ts:3-4`
states its own policy ("every sensitive mutation in the panel goes through here").

**The pattern is not "there are no services". Services exist and the happy path uses them. Every
rule discovered while writing a route handler stayed in the route handler.**

## 8. Is each client's rendering dialect documented, and internally consistent with it? — **VIOLATED on the doc, MIXED on the code**

**No document states it.** Exhaustive search of `CONTEXT.md`, `CLAUDE.md`, both ADRs, `PRODUCT.md`
and all four app entry points for `server component|use client|server action|react-query|swr|query
cache|revalidat` returns hits only in `.scratch/` working notes and in source. The ADRs document the
*component stack* in exhaustive detail — including a superseded shadcn decision (ADR-0001:29) and its
HeroUI replacement (ADR-0002:18) — and say nothing about rendering.

- **Store: server-first, HOLDS on shape, VIOLATED on caching.** 12 of 13 pages are async server
  components; data is passed **down** into islands as props (`product/[slug]/page.tsx:38-43` →
  `ProductBuyBox`) — the correct shape. But `revalidatePath|revalidateTag|unstable_cache|cache(` →
  **0 matches anywhere in `apps/`**, and **`export const dynamic = "force-dynamic"` sits on all 13
  public routes** (home, PDP, category, collection, blog, orders, account…). For an SEO audience that
  is not an unimplemented "cached server data" — it is an affirmatively declined one, one route at a
  time, with no ADR. The store also has **zero server actions**; all 13 mutations are hand-rolled
  `fetch` to JSON routes.
- **Admin: internally consistent, but not the table's dialect.** No query-cache library at all —
  `apps/admin/package.json:14-32` has no tanstack, react-query, swr or react-hook-form. Instead: 7
  `"use server"` modules, `useActionState` in 15 components, and **19 identical
  `router.refresh()` invalidation sites**. One mutation path, one result signal, one invalidation
  idiom, one read path (Prisma in the async page) — coherent and uniform across all 24 pages.
  The invalidation is a **whole-tree re-render**, not a cache invalidation, which re-runs the two
  layout counts on every mutation.

**The two clients in one monorepo have opposite mutation idioms and neither is written down.** That
is the §19 cost-4 warning arriving in full.

## 9. Has a client component passed the size ceiling without extracting anything? — **VIOLATED**

The remedy has **never once been applied**: the entire monorepo has **2 custom hooks**
(`useCart` in `cart-provider.tsx:83`, `useInView` in `packages/ui/src/accents/use-in-view.ts:8`) and
**zero `use-<feature>.ts` files**. Only presentational sub-components were ever split out.

| File | Lines | Ceiling | Extracted | Verdict |
|---|---|---|---|---|
| `admin/src/components/scraper-panel.tsx` | **1475** | 3.7× | only the type contract (`lib/scraper-types.ts`) | **VIOLATED** |
| `store/src/components/block-renderer.tsx` | 572 | 1.2× | 5 of 25 block types | **VIOLATED** |
| `admin/src/components/blog-editor.tsx` | 443 | ~1.0× | `MediaPickerButton`; ~105 lines of JSON codec left inline | MIXED |
| `store/src/app/checkout/checkout-client.tsx` | 417 | ~1.0× | **nothing** | **VIOLATED** |
| `admin/src/components/page-builder.tsx` | 398 | under | `MediaPickerButton`; a 103-line config table re-declaring keys already in `packages/schema/src/index.ts:220-246` | MIXED |
| `admin/src/components/nav-editor.tsx` | 381 | under | nothing; 6 near-identical `structuredClone`+path-walk blocks (`:122-200`) | MIXED |

`scraper-panel.tsx` in detail: **45 contiguous `useState` calls** at `:317-361`, a single **828-line**
`ScraperPanel` function (`:316-1143`), 7 local components, 9 pure helpers, its own `fetch`
transport (`:281-301`), its own URL sanitiser, its own generic multi-select widget, 7 label
dictionaries, and **9 distinct feature concerns**. Its lifecycle predicate at `:363` is a third copy
of `scraper-jobs.ts:115-117`, which is itself a fourth of `tui.ts:34-37`.

## 10. Does a client unit still mix heavy fetching, data transformation and rendering? — **VIOLATED (3 units)**

- `scraper-panel.tsx` — fetching (`:281-301, 440-737`), transformation (`:106-146, 265-314, 364-432,
  1370-1397`), rendering (`:743-1475`), plus state and label data.
- `checkout-client.tsx` — 4 hand-rolled `fetch` call sites (`:71,135,167,188`), cart/preview key
  derivation (`:98-116`), rendering (`:216-391`), 17 `useState`.
- `block-renderer.tsx` — rendering-dominant but it **queries the database from inside a component**
  (`db()` at `:410`, plus `getPublishedProducts`/`getActiveDeals`/`getPublishedPosts` imported at
  `:7`), and the same pattern repeats in `components/post-body.tsx:47`. A presentational component
  reaching the database is the sharpest form of this item.

Clean: `admin/src/components/ui.tsx` (primitives), `blog-editor.tsx` and `nav-editor.tsx`
(transformation + rendering, no fetching — they use `useActionState`).

## 11. Is a directory in `src/lib/`, `src/components/` or `src/types/` app-wide, or a feature root filed by layer? — **VIOLATED**

In both clients those folders are the *only* place feature code can live, so every per-feature file is
a feature in the wrong place: **25** single-feature files in `apps/store/src/components/`,
**8** in `apps/admin/src/components/`, and every feature's lib in `src/lib/`.

- **Feature-named directory inside a layer folder: exactly one** —
  `apps/store/src/components/reactbits/` (6 animation primitives in one file, 329 lines). The only
  such directory in either client.
- **`src/types/` does not exist in either client.** Types live beside their consumer, and the one
  app-wide contract (`ActionState`) lives inside the auth feature (item #4).
- There is no `src/features/`, `src/hooks/`, `src/state/` or `src/domain/` anywhere.

## 12. Does every feature have exactly one root? — **VIOLATED, and 9 splits the gate cannot see**

No feature has a root directory in either client; membership is recoverable only from import edges,
and each feature's files are loose siblings across 4–7 directories. Most scattered: store catalogue
(17 files / 6 dirs), store orders (9/7), store cart (9/7), store auth+account (10/5), admin scraper
(9/5).

The mechanical proxy passed (0 duplicate names at depth 1–2) and, as §15.2 warns, **it cannot see a
split feature whose two trees are named differently.** Nine exist:

1. **Order stock lifecycle** — `apps/store/src/lib/orders.ts:138-205` vs
   `apps/admin/src/lib/inventory.ts:40-121`, same four function names, **different guarantees**: the
   store copy runs bare `db().variant.update` with no transaction and no compare-and-set; the admin
   copy wraps each phase in `$transaction` with an `updateMany` stock/reserved guard. The header at
   `inventory.ts:6-7` claims it mirrors the store "so the two apps can never disagree on stock math" —
   they already do.
2. **Order numbering** — `store/lib/orders.ts:70` vs `admin/lib/order-number.ts:7`.
3. **Settings access** — `store/lib/settings.ts:16` vs `store/lib/queries.ts:218` (two readers in one
   client); admin mixes accessor and raw `findMany` (`panel/settings/page.tsx:64`).
4. **Discount money rule** — `store/lib/discounts.ts:71` vs `store/lib/queries.ts:213`.
5. **Persian digits** — `faDigits` in `admin/lib/date.ts:44` vs `admin/components/ui.tsx:306`, with
   2 files importing it from `./ui` and 12 from `@/lib/date`.
6. **Order transition tables** — `admin/lib/actions/orders.ts:14-27` vs
   `admin/app/(panel)/orders/[id]/transitions.tsx:14-28`, byte-identical, one server and one client.
7. **Jalali dates — three implementations**: `admin/lib/date.ts:24-70` (ICU, `Asia/Tehran`) vs
   `admin/app/(panel)/products/page.tsx:127` and 3 store routes all calling bare
   `toLocaleDateString("fa-IR")` in server time.
8. **Session revocation** — `store/lib/auth.ts:68-80` opens a session with no revoke, so
   `app/api/auth/logout/route.ts:12-16` re-implements the token hash and `updateMany` outside the auth
   module. Admin does it in one place.
9. **Nav target enum** — kernel `LinkRef` vs `admin/components/nav-editor.tsx:15`.

**No feature owns its rule, so every rule has a second differently-named home, and no gate — mechanical
or human — can see the pair.**

## 13. Is a repeated utility chain owed a composed class? — **VIOLATED**

Measured across 110 `.tsx` files (static `className="…"` strings; ~60 dynamic sites reported
separately, and they *understate* the repeat rate by 15–20% because admin re-emits every recipe
through constants in its local kit).

- **~700 utility chains** in total. **3 composed classes exist for the whole system**:
  `@utility text-price`, `@utility text-code`, `animate-badge-pop` (`packages/ui/tailwind.css:110-131`).
  No `.text-title`, no `.text-body-bold`, no `.<surface>-card` — §11.1's "look for an existing
  composed class" has nothing to find.
- **0 of the 12 most-repeated chains have a token.** Top offenders: `grid grid-cols-1 gap-4
  md:grid-cols-2` (**12 exact**), `text-sm font-bold text-ink` (**11 exact**),
  `rounded-card bg-red-50 px-3 py-2 text-sm text-red-700` (**10 exact**), and its emerald twin (**6**).
- The strongest candidates are partial repeats that survive chain-length drift: `px-3 py-2 text-sm`
  (**40 exact**), `rounded-card border border-fog px-3 py-2 text-sm` (**11**),
  `mb-4 flex flex-wrap items-end gap-3` (**7** — the admin filter bar, in 7 files).
- **A composed class already exists and is ignored**: `text-price` covers
  `tabular-nums font-semibold`, yet the code writes the pieces inline ~15 times
  (`order-row.tsx:51`, `cart/page.tsx:183`, `checkout-client.tsx:332,354,370`).
- **Two raw arbitrary values repeat where a token documents the value**: `rounded-[30px]` (~30) and
  `text-[11px]` (~20, off-scale next to `text-xs`).
- **Token defect found while comparing the two clients**: `@theme` defines only
  `flame-50/100/200/600/700/800`, but `flame-300/500/900/950` are used — `text-flame-900/950` in the
  c2c payment panel (`order/[orderNumber]/page.tsx:77-78`), `bg-flame-500` in `block-renderer.tsx:273,294`,
  `focus-visible:ring-flame-300` in 6 admin files. **Those utilities compile to nothing**, so the c2c
  payment heading renders in the inherited colour.

## 14. Does the code follow SOLID? — **VIOLATED, concentrated in 4 files**

- **`packages/scraper/src/pipeline.ts:191-441`** — `runPipeline` alone is **251 lines doing 8 jobs**:
  option defaulting, crawl orchestration, error accounting, Datees-Shop price enrichment hard-wired to
  one vendor (`:312`), filter/sort/limit, image download, 3-artefact filesystem emit, price-list apply
  by dynamic import. **≥5 independent reasons to change.**
- **`packages/scraper/src/price-list.ts` (706)** — 23 top-level functions, 5 unrelated concerns; the
  Persian/Bidi model-code alias engine (`:164-292`) is a fourth place brand names are normalised
  (after `sources.ts:226`, `update-home-deals.ts:25`, and the scraper importer).
- **`apps/admin/src/lib/scraper-jobs.ts` (492)** — one class, 16 methods, 8 concerns: fs path
  resolution, MIME typing, endpoint paths, an 84-line JSON normaliser, the job state machine,
  price-list orchestration, the globalThis singleton.
- **`ScraperTui` (`tui.ts:147-592`)** — one class, 602 lines, 8 responsibilities, 0 seams.
- **Interface wider than its consumer needs**: `PipelineOptions` (`pipeline.ts:40-60`) has 15 optional
  members; `imageDir`, `imageMinIntervalMs`, `imageMaxBytes`, `outDir` have **no consumer outside
  `pipeline.ts`**. By contrast `Storage` (`storage.ts:46-51`) and `SourceAdapter` (`sources.ts:16-27`)
  are correctly sized.
- **DRY failures, all machine-checkable**: `faDigits` × 3 byte-identical, `sameOrigin` × 4, the low-stock
  predicate × 3, `FULFILLMENT_NEXT` × 2, `total * 10` × 2, the phone regex × 5 with **0 normalisers**,
  brand canonicalisation × 4.
- **Single-responsibility judgement**: `formatRial` (`packages/schema/src/format.ts:17-20`) has
  **zero call sites**; `normalizeCityName` (`iran.ts:48`) and `formatPrice` (`format.ts:22`) likewise.
  The kernel *declares* the canonical formats; nothing *applies* them.
- **No subclassing anywhere** — 2 classes, 0 inheritance hierarchies (`S3Storage`,
  `ScraperTui`). LSP is not the problem here; SRP is.

---

## Cross-cutting conclusions from the judgement pass

1. **The sharpest single finding is duplicated domain rules, and it is not cosmetic.** The order
   stock lifecycle is implemented twice with *different concurrency guarantees* while a file comment
   asserts they cannot disagree; the payment callback writes `paymentStatus` three times
   non-transactionally while its admin twin uses a compare-and-set; the COD ceiling, the reservation
   window and the TOMAN→Rial factor each exist as a magic literal in 2–3 places. Every one of these
   is a correctness risk, and none is visible to any check that exists today.
2. **The repo has services, and the happy path uses them.** The failure mode is specific and
   nameable: *rules discovered while writing a route handler stayed in the route handler.* That is why
   the good shapes (`lib/queries.ts`, `lib/audit.ts`, `cityBelongsToProvince`, `SourceAdapter`,
   `packages/db`'s single index) sit next to the bad ones without any tension being visible.
3. **Two design systems that do not know about each other.** The primitive token layer is genuinely
   shared (0 divergence) — the thing that blocks a shared component library is not tokens. It is that
   `apps/admin/src/components/ui.tsx` re-implements 15 components with a **non-merging**
   `cn` (`:9`, `filter(Boolean).join(" ")`), the store uses HeroUI, and `packages/ui` is imported by
   admin exactly once (`media-picker-button.tsx:11`). That single import proves the wiring works.
4. **Two clients, two coherent-but-different rendering dialects, zero documentation.** This is §19's
   "per-audience rendering dialects need documentation to survive" arriving exactly as described, and
   it is currently invisible to every reader in the repo.
5. **§10 canonical formats are declared but never applied.** The kernel has the schemas; the write
   paths hand-roll. `Customer.phone` is a unique key (`store/lib/auth.ts:58-61`) reached by a path
   with no normalisation, and `packages/schema` contains **zero** `.transform()` calls.

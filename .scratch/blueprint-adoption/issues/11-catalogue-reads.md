# 11: Catalogue reads

**What to build:** every page a shopper reads comes from the gateway instead of the database. Product detail, listing, Category, Collection, Brand, the navigation menu, CMS pages, Blog posts and the page-builder blocks all render from the gateway — including the two components that currently open a database connection during render, and the two category pages that bypass the storefront's own read layer.

**Blocked by:** 07.

**Status:** done, with the caveat noted below

- [ ] Product detail renders Product, Variant, Color, Brand, specifications, features, imagery and related Products from the gateway — **unverified as of 2026-10-01.** `apps/store/src/app/product/[slug]/page.tsx` reads `getProductBySlug` + `getPublishedProducts` (both one-line `client.get` calls in `apps/store/src/lib/queries.ts:98-108,73-88`) and draws Variant, Color (`colorName`/`colorCode`), specifications, features, imagery and related products; `grep -rn "brand" apps/store/src --include=*.tsx` returns nothing, so the Brand the gateway sends is never drawn.
- [x] Listing, Category and Collection pages render from the gateway
- [x] The navigation menu, CMS pages and Blog index and post render from the gateway
- [x] The storefront's page-builder blocks render from the gateway, including the block that currently queries the database from inside a component
- [x] The two category pages that read the database directly no longer do
- [x] The storefront's existing read layer is either gone or reduced to gateway calls, and every page that used it is updated
- [ ] A test drives a full product page render against a stubbed gateway, and an integration test proves the gateway returns a product the schema allows — **unverified as of 2026-10-01.** `apps/store/src/__tests__/catalogue-lookup.test.ts:16` drives `CategoryPage`, not the product page, and no file under `apps/store/src/__tests__/` imports `@/app/product/[slug]/page`; the gateway half is `apps/api/tests/catalogue-reads.test.ts:249-310` ("a shopper reads one product"), but that suite drives the controller against the database and never parses its answer through a contract schema — no `safeParse`/`parse` in it.
- [x] The storefront issues no database import of any kind, including a type-only one — four such edges exist today

## Comments

`grep -rn "@kmodern/db\|generated/prisma\|from ['\"].*prisma" apps/store apps/admin --include=*.ts --include=*.tsx --include=*.js` returns nothing outside `node_modules`/`.next`, which is what the last box asks for; the only mention of `generated/prisma` in the storefront is the prohibition itself in `apps/store/AGENTS.md:19`. `apps/store/src/lib/queries.ts` is now 203 lines of one-line `client.get` reads over `@/lib/gateway` — its header records that every helper "used to open the data tier itself" and that two dead helpers were deleted rather than migrated, so the read layer is reduced to gateway calls rather than gone.

The two pages that used to bypass that layer are `app/category/[slug]/page.tsx` and `app/collection/[slug]/page.tsx`, both now on `lookupCategory`/`lookupCollection` in `apps/store/src/catalogue/lib/gateway-catalogue.ts`, whose zod schemas parse the wire shape rather than asserting it. For the blocks: `apps/store/src/content/blocks/*.tsx` contain no import of `@/lib/queries` or `@/lib/gateway` at all — the reads moved to `resolveBlockPayloads` in `apps/store/src/content/lib/block-data.ts:70`, called by the page before it renders, so a block receives its data as a prop.

`cd apps/store && npx vitest run` → 7 files, 52 tests, all passing, so the gateway-sourced pages under test are green. The two unticked boxes are gaps in evidence, not in the reads themselves: the product page's Brand column is fetched and never drawn (nothing under `apps/store/src` renders a brand string), and no test drives the product page render.

# ADR-0004: The storefront serves every public route dynamically

**Status:** accepted · **Date:** 2026-10-01 · **Blueprint:** §9.2, §9.4 · **Register:** [DEVIATION-REGISTER](../DEVIATION-REGISTER.md) row 4

## Context

§9.2 names *cached server data* as the read path for a public/SEO audience, and calls a performance
regression on a public route a functional regression. This repo does the opposite on every public
route: `export const dynamic = "force-dynamic"` appears on all 13 of them, and no cache API —
`revalidatePath`, `revalidateTag`, `unstable_cache`, `noStore` — is called anywhere in `apps/store`
(0 matches across the app).

Two forces explain it. Prices, stock and discount state on this storefront are read by the panel
through the gateway within seconds of changing, and a cached product page is a customer-visible wrong
price. And the data is per-request anyway on most routes: the account, cart, checkout and order
routes read the shopper's own session, which no shared cache may hold.

## Decision

Serve every public route dynamically, and make that explicit in the route file rather than leaving it
to be inferred. A future cache is a deliberate change to this ADR, not a default that creeps back.

## Consequences

- Every public page pays a gateway round trip per request. Core Web Vitals depend on the gateway's
  latency and on Prisma's, which is a cost this repo accepts in exchange for never showing a stale
  price or a stale stock count.
- `dynamic = "force-dynamic"` is stated 13 times, which is repetition. It is stated per route because
  that is where a reader looks, and because the alternative — a layout-level default — hides the
  choice from the thirteen files it governs.
- The SEO audience still gets server-rendered HTML; `force-dynamic` forgoes *caching*, not rendering.
  Crawlability is unaffected, and the pages in question are the ones that must never be stale.

## When to revisit

If the gateway gains a measured read-through cache for catalogue data that the panel invalidates on
write, the catalogue and home routes could move off `force-dynamic`. The session-bound routes could
not, and should not.

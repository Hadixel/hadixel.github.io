# Deviation register

The blueprint's §18. A deviation is recorded **in the code, at the violation**, with
`// @boundaries-ignore <rule> - <reason>`; a suppression with no reason cannot be re-evaluated by
anyone later, which is how debt becomes permanent. This file keeps only what a line comment cannot
hold — the standing, repo-wide deviations.

**Suppressions in the code: 0.** Nothing is suppressed, so nothing is recorded below at a violation.

## Standing deviations

| Deviation | Where | Why it exists | May it be copied? |
|---|---|---|---|
| An entry point that carries rules as well as links | the repo root `CLAUDE.md` | It holds repo-wide working rules that have no numbered topic doc to move into yet, so making it *only* an index would delete them | No — the client entry points are the pattern; move each rule into a topic doc as it is next edited |
| The panel is server-rendered, not client-rendered | `apps/admin` | The blueprint's client table says an internal admin should be a client app with a query-cache hook, mutation-plus-cache-invalidation writes and local-state forms. This panel is the opposite: 28 async server components, 23 client components, one server action per feature, no query cache and no cache provider anywhere. The reason is the rule the panel is subject to, not a preference — the operator's session cookie must never be reachable from browser JavaScript, and a client dialect with a query cache reaches for it in exactly the way a session must not. The panel's writes are audited server-side through the gateway, which a client mutation cannot do. | **No.** The panel's dialect is the correct answer to this panel's constraints and the wrong answer for a public app: a server-first storefront is how an internal tool turns a crawlable shop into a client-rendered one by accident. Do not port this shape into `apps/store`, and do not "fix" the panel toward the table without replacing the session rule first. |
| The gateway and the panel each hold a media client | `apps/api/src/media`, `apps/admin/src/lib/scraper-image-upload` | The two have different keys, and the difference is the point. The media library is `media/{year}/{month}/{random}` — immutable, so an upload overwrites nothing — while a scraped product image is `scraper/products/{color}/{sha256}` — content-addressed, so the same photograph arriving on every scrape is stored once. One route cannot mint both without a flag deciding between them, and a flag deciding between two key strategies is the strategy not being decided. | **Yes, with the keys.** If a third kind of image appears, it gets its own route and its own key rule. Copy the shape, not the namespace. |

## A deviation found while doing this work, not yet fixed

Not fixed here because it is scoped work, and §18 says a deviation is never fixed opportunistically
inside an unrelated change.

| Deviation | Where | Why it exists | May it be copied? |
|---|---|---|---|
| `Discount.code` is documented unique and enforced nowhere | `apps/api/prisma/schema.prisma` (`@@index([code])`, no `@unique`), `apps/api/src/checkout/discounts.ts` | The field is commented "COUPON only, unique nullable" and carries an index rather than a constraint. `applyDiscounts` resolves a typed code with `coupons.find(d => d.code?.trim().toLowerCase() === wanted)` over an unordered `findMany`, so two coupons sharing a code — or differing only in case — resolve to whichever row the database returned first. A shopper typing a valid code gets an arbitrary discount, and a "best offer wins" comparison then runs against the wrong one. Fixing it is a migration plus a backfill that checks for existing duplicates, which is its own ticket. | **No.** The comparison is already case-insensitive, so a unique index on `code` alone would still permit `SUMMER` and `summer` as two rows. The fix has to normalise on write *and* constrain. |
| The support folder holds framework-decorated classes, and one of them reaches infrastructure | `apps/api/src/common/guards/origin.guard.ts` imports `apps/api/src/config/config.service.ts` (§7.1) | §7.1's support row reads "pure functions. No module, no dependency injection, no framework decorators", while the paragraph below it sends cross-cutting code owned by no feature — "filters, middleware, shared types, utilities" — to a support folder. A Nest guard is both, so it sits in the right folder under one clause and the wrong one under the other, and the rank table then puts `config/config.service.ts` above the support folder the guard is in. Consequence for the gates: `no-infrastructure-from-support` in `.dependency-cruiser.js` runs at `warn` rather than `error` — the one rule in that file that is not an error — and reports every edge it finds on each run — the guard's, and since P4 also `common/audit.ts`'s type-only read of the data tier — until the owner picks a side. | **No.** Adding a second guard to `common/` on the strength of this row would widen the debt rather than record it. The fix is a choice — admit decorators to the support archetype, or give guards one of their own — and until it is made every new guard is unassigned. |


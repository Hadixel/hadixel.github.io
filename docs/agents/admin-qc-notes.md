# Admin panel QC notes

Date: 2026-09-25

## Fixed in this pass

- Added a responsive RTL shell drawer with Escape handling, focus entry/restoration, active navigation state, and bounded pagination.
- Removed nested interactive CTA markup and added explicit submit types, keyboard-accessible table rows, field grouping, dialog semantics, and live error/status regions.
- Enforced forced-password-change checks at the server-action and route-handler boundaries; password changes now rotate the current session token transactionally.
- Hardened media upload with origin checks, forced-password checks, MIME/signature validation, a 25 MB limit, safe media-key deletion, bounded listing, nosniff/CSP headers, and a real media dialog.
- Added strict HTML sanitization at page save and storefront render boundaries, safe navigation link validation, and backward-compatible resolution of legacy `{type,value}` menu links.
- Made order status changes, manual stock adjustments, and manual-order stock reservations compare-and-set/transactional; COD now creates and commits reservations atomically, and stock cannot be adjusted below reserved quantity.
- Added product/collection child ownership checks, financial/stock/discount validation, strict navigation/menu validation, and bounded customer/discount pagination.
- Added scraper SSRF protections for direct and redirected requests, private/link-local IP blocking, content-type and response-size limits, and retryable scraper status UI.
- Split lightweight schema formatter/setting-key entry points and scraper source metadata from the heavy Zod/crawler barrels, and removed avoidable client-side schema imports from the page builder and scraper screen.
- Upgraded Next.js/Prisma, replaced the vulnerable SheetJS npm artifact with the patched SheetJS release, and added dependency overrides; `pnpm audit --prod` reports zero advisories.

## Verification

- `apps/admin`: typecheck, production build, and security tests pass.
- `apps/store`: typecheck and production build pass.
- `packages/scraper`: 11 tests pass, including price-list and SSRF guard coverage.
- Authenticated smoke requests for all primary admin routes return 200; malformed pagination/status query strings return 200 rather than database errors.
- Impeccable mechanical detector: no findings.

## Deployment follow-up

The scraper still uses an in-process job registry and repository/S3 artifact workflow. That is safe for the current single-process owner workflow, but a multi-instance/serverless deployment must move job leases, locks, and artifacts to Postgres/object storage plus a durable worker before enabling concurrent production instances.

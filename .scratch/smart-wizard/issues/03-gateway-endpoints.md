# 03 — Gateway Endpoints for Universal Crawl & Batch Price Updates

Status: done
Type: task
Blocked by: [01-universal-web-extractor.md, 02-pdf-price-list-parser.md]

## Problem Statement

To support universal URL scraping and batch price updates from the admin wizard while complying with ADR-0003 (all writes through the gateway, no direct DB from admin), the gateway (`apps/api`) needs dedicated endpoints for triggering crawls safely and applying bulk price updates transactionally.

## Solution

In `apps/api`:
1. **Universal Scrape Trigger (`POST /admin/scraper/universal`):**
   - Validates input URL, brand override, and item limit (1 to 50).
   - Validates URL against private IP / SSRF guard.
   - Executes universal extraction via `@kmodern/scraper-core/universal-scraper`.
   - Returns extracted and refined candidate products.
2. **Batch Price Updates (`POST /admin/products/batch-prices`):**
   - DTO: `BatchProductPricesDto` validating an array of `{ model: string, priceToman: number, brand?: string }` or `{ productId: string, variantId?: string, priceToman: number }`.
   - Service: Inside a single Prisma transaction:
     - Updates `price` on `Product` and `Variant` rows.
     - Logs the price change in `AdminAuditLog` (`action: "BATCH_PRICE_UPDATE"`, before/after amounts).
   - Returns `{ ok: true, count: number }`.

## Verification

- Vitest tests in `apps/api/tests/batch-prices.test.ts`:
  - DTO validation rejecting non-positive prices and malformed IDs.
  - Transaction rollback on partial failures.
  - Audit log verification.
- `pnpm --filter @kmodern/api typecheck`

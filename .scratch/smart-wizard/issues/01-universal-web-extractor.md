# 01 — Universal Web Ingestion Engine

Status: done
Type: task
Blocked by: []

## Problem Statement

The scraper currently relies on hardcoded adapters for Datees and Schuffel. When the store operator needs to import products from other manufacturer or distributor websites (e.g., Akhavan, Can, Bimax, or retailer shops), there is no way to enter a URL and extract product details.

## Solution

Implement `packages/scraper-core/src/universal-scraper.ts`:
1. **URL Classifier:** Detects whether a provided URL is a single product page or a listing/category page.
2. **Product Page Extraction:**
   - Evaluates `<script type="application/ld+json">` for `Product` schema (extracts name, SKU, price, brand, image, description).
   - Evaluates OpenGraph and standard meta tags (`og:title`, `og:image`, `product:price:amount`).
   - Evaluates DOM heuristics using Cheerio for WooCommerce, Digikala-like structures, and Persian appliance layouts:
     - Title: `h1.product_title`, `h1.entry-title`, `h1[class*="title"]`.
     - Specs: `table.woocommerce-product-attributes`, `[class*="spec"] table`, alternating `dt`/`dd` or `li`.
     - Images: High-resolution image URLs filtered from galleries.
     - Category Mapping: Persian keyword detection (`فر` ➔ `oven`, `هود` ➔ `hood`, `سینک` ➔ `sink`, `گاز` ➔ `stove`, `شیر` ➔ `faucet`, `مایکروویو` ➔ `microwave`).
     - Model Extraction: Normalizes and extracts alphanumeric model codes (e.g. `DG-598`, `V-16`).
3. **Category / Listing Extraction:**
   - Extracts candidate product links matching common product patterns (`/product/`, `/item/`, `/p/`).
   - Crawls up to a bounded limit (default 10, max 50).
4. **Security & Invariants:**
   - Leverages `fetchHtml` from `./http.ts` with DNS/SSRF checks (`isPrivateIp`).
   - Emits standard `RefinedProduct` objects consumable by the admin staging pipeline.

## Verification

- Vitest unit tests in `packages/scraper-core/tests/universal-scraper.test.ts` covering:
  - JSON-LD parsing
  - DOM heuristic fallback
  - Appliance category normalization
  - Private IP / SSRF rejection
- `pnpm --filter @kmodern/scraper-core test`
- `pnpm --filter @kmodern/scraper-core typecheck`

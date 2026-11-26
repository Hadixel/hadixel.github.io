# Smart Wizard — Automated Catalogue & Dual-Method Price Sync

Status: implemented
Phase: Admin / Scraper

## Problem Statement

The store is operated on-site by the owner's father, who is occupied with daily brick-and-mortar retail operations and customer handling. He lacks the time and technical background to perform manual data entry for new products and price adjustments on the website. 

Currently:
1. The admin scraper only supports two hardcoded source adapters (`datees`, `schuffel`), making it impossible to ingest products from other manufacturer or distributor websites (e.g., Akhavan, Can, Bimax, etc.) without writing bespoke crawler code.
2. Price lists from Iranian manufacturers are frequently distributed as **PDF circulars** (لیست قیمت مصوب), but the system currently only accepts `.xlsx` spreadsheets.
3. The current scraper interface is laden with developer-oriented filters, regex options, and multi-dimensional switches rather than a simple, guided workflow with clear visual confirmation before making changes live.

## Solution

A high-leverage, father-friendly **Smart Wizard (دستیار هوشمند مدیریت محصولات و قیمت‌ها)** in `apps/admin`:
1. **Universal Web Ingestion:** Allows pasting **any website URL** (a single product page or a category listing). The engine automatically extracts product titles, models, high-resolution images, appliance specifications (ابعاد، تعداد شعله، جنس، گارانتی), and prices using JSON-LD, Microdata, OpenGraph, and Persian appliance heuristics.
2. **Dual-Method Price Synchronization:**
   - **Method A (PDF & Excel Price Lists):** An upload area supporting `.pdf` as well as `.xlsx/.csv`. It extracts product models and prices, normalizes Persian/Arabic digits, handles Rial-to-Toman conversions, matches models against store products, and renders an interactive **Old Price ➔ New Price** diff table.
   - **Method B (Website Live Sync):** On-demand price scraping from manufacturer web stores matched by product model.
3. **Mandatory Admin Confirmation:** All extracted products and price updates are staged in a visual review queue. The operator can inspect thumbnails, specs, and price diff badges, adjust values if needed, and confirm the changes with a single click before anything is written to the live store.

---

## User Stories

1. **As the store operator (father)**, I want to paste a link from any manufacturer's website and click one button, so that new products are automatically extracted without manual typing.
2. **As the store operator**, I want the system to extract photos, Persian titles, model codes, and technical specifications, so that product listings look professional and complete.
3. **As the store operator**, I want to drag and drop an official PDF price list received from a manufacturer, so that I don't have to manually look up and re-type hundreds of prices.
4. **As the store operator**, I want the PDF parser to understand Persian numbers and convert Rials to Tomans automatically, so that prices are never off by a factor of 10.
5. **As the store operator**, I want to see a visual price diff table (e.g., `۱۴,۵۰۰,۰۰۰ ➔ ۱۶,۲۰۰,۰۰۰ تومان` with green/red badges), so that I immediately see what changed before approving.
6. **As the store operator**, I want a single "Apply Confirmed Prices" button, so that updating all store prices takes under 10 seconds.
7. **As the store operator**, I want to choose whether new products are imported as `DRAFT` or `PUBLISHED`, so that I have the option to review them at my leisure.
8. **As the store owner**, I want all batch price changes and product imports recorded in `AdminAuditLog`, so that there is full accountability for every catalogue mutation.
9. **As a system administrator**, I want universal URL fetching protected against SSRF and private IP access, so that operators cannot inadvertently probe internal services.

---

## Implementation Decisions

### 1. Universal Web Ingestion Engine (`@kmodern/scraper-core`)
- **Module:** `packages/scraper-core/src/universal-scraper.ts`
- **Extraction Priority:**
  1. **Schema.org / JSON-LD:** `<script type="application/ld+json">` (`Product`, `BreadcrumbList`, `Offer`). Provides clean structured name, SKU, price, brand, image, and description.
  2. **Microdata & Meta Tags:** `meta[property="og:title"]`, `meta[property="og:image"]`, `meta[property="product:price:amount"]`.
  3. **Iranian E-Commerce DOM Heuristics:** Cheerio extraction targeting WooCommerce, Digikala-like structures, and Persian appliance layouts:
     - Title: `h1.product_title`, `h1.entry-title`, `h1[class*="title"]`.
     - Specs: `table.woocommerce-product-attributes`, `[class*="spec"] table`, alternating `dt`/`dd` or `li` spec rows.
     - Images: High-resolution image URLs filtered from galleries (`data-large_image`, `data-src`, `srcset`).
     - Category Mapping: Persian keyword detection (`فر` ➔ `oven`, `هود` ➔ `hood`, `سینک` ➔ `sink`, `گاز` ➔ `stove`, `شیر` ➔ `faucet`, `مایکروویو` ➔ `microwave`).
     - Model Extraction: Reuses `extractModel` regex routines to extract clean alphanumeric model codes (e.g., `DG-598`, `V-16`).
- **Listing Crawler:** When given a category or brand catalog URL, extracts individual product links (matching `/product/`, `/item/`, `/p/`) and crawls up to a user-specified limit (default 10, max 50).
- **Security:** Reuses `http.ts`'s DNS resolution checks (`isPrivateIp`) to reject loopback, RFC1918, link-local, and internal addresses.

### 2. Dual-Method Price Extraction Engine (`@kmodern/scraper-core`)
- **Module:** `packages/scraper-core/src/pdf-price-list.ts`
- **PDF Extraction:**
  - Uses `pdf-parse@1.1.1` (pure JS, zero native C++ binaries, zero canvas dependency) to extract text content per page.
  - Line reconstruction: Normalizes text line-by-line, handling Persian/Arabic digits (`۰-۹` ➔ `0-9`), comma/slash thousands separators, and Persian bidi reversing.
  - Appliance Model Recognition: Matches standard Iranian appliance model formats:
    - English alphanumeric: `DG-\d{2,4}`, `[A-Z]{1,3}[-\s]?\d{2,4}`, `V\d{2}`, `B\d{4}`.
    - Persian model words: `مدل`, `کد`.
  - Price Figure Tokenizer: Finds 7-10 digit numbers on the same line or adjacent cells.
  - Currency Detection: If numbers are consistently > 10,000,000 and average home appliance prices exceed 50,000,000, detects Rials and divides by 10 to obtain Tomans. Provides manual override toggle (`auto` | `toman` | `rial`).
- **Matching Pipeline:** Feeds extracted `{ model, priceToman, sourceName }` rows directly into `applyPriceList` in `packages/scraper-core/src/price-list.ts`.

### 3. Gateway Endpoints (`apps/api`)
- `POST /admin/scraper/universal`: Authenticated admin endpoint executing a universal scrape given a URL and parameters.
- `POST /admin/products/batch-prices`: Accepts `{ updates: Array<{ productId, variantId?, priceToman }> }`, verifies ownership, executes transactional update in Postgres, and writes audit lines via `writeAudit()`.

### 4. Admin Wizard UI (`apps/admin`)
- **Location:** `apps/admin/src/scraper/components/wizard/smart-wizard.tsx`, embedded into `/scraper`.
- **Anatomy:**
  - Top tab strip:
    - 🌐 **استخراج محصول از هر سایت (Smart Product Ingest)**
    - 📄 **به‌روزرسانی قیمت با PDF یا اکسل (PDF / Excel Price List Update)**
    - 🔄 **استعلام آنلاین قیمت‌ها (Website Live Price Sync)**
  - Clean card layouts with Persian typography, step indicators, large file dropzone, and sticky confirmation bars.
  - Price Diff Table with visual indicators:
    - Previous price, New price, Percentage / Absolute change.
    - Status badges: `تطبیق قطعی`, `نیازمند بررسی`, `بدون تغییر`.
    - Checkboxes for selective application + "انتخاب همه".

---

## Testing Decisions

1. **Universal Scraper Tests (`packages/scraper-core/tests/universal-scraper.test.ts`):**
   - Test extraction against mock HTML carrying Schema.org JSON-LD.
   - Test extraction against mock HTML carrying OpenGraph and Microdata.
   - Test fallback parsing of Persian appliance tables and spec attributes.
   - Test SSRF rejection of `http://127.0.0.1` and `http://192.168.1.1`.
2. **PDF Parser Tests (`packages/scraper-core/tests/pdf-price-list.test.ts`):**
   - Test line tokenization with Persian digits (`۱۲,۵۰۰,۰۰۰` ➔ `12500000`).
   - Test Rial-to-Toman conversion.
   - Test model code normalization (`DG 598` / `DG-598` / `۵۹۸-DG`).
3. **Gateway Unit & DTO Tests (`apps/api/tests/batch-prices.test.ts`):**
   - Test `POST /admin/products/batch-prices` payload validation.
   - Verify transaction atomicity and audit logging.
4. **Admin UI Component Tests:**
   - Vitest suite for `SmartWizard` tabs, file selection, and price diff table rendering.
   - Typecheck and `./scripts/audit.sh` execution.

---

## Out of Scope

- OCR for scanned physical paper printouts / image-only PDFs (system requires vector/text PDFs generated from accounting software or Word/InDesign, which is what manufacturers circulate).
- Autonomous headless browser execution (Puppeteer/Playwright) to bypass Cloudflare Captcha (system relies on standard HTTP fetching).
- Direct ERP/Accounting software SQL sync (Sepidar, Holoo, etc.) — file upload is the standard exchange format.

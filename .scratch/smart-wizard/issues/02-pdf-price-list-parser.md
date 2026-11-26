# 02 — PDF Price List Parser & Model Matcher

Status: done
Type: task
Blocked by: []

## Problem Statement

Iranian appliance manufacturers (Datees, Akhavan, Can, etc.) routinely distribute price updates as official PDF circulars rather than Excel files. The admin panel currently only accepts `.xlsx/.csv`, forcing the operator to either manually type hundreds of prices or re-enter them into a spreadsheet.

## Solution

Implement `packages/scraper-core/src/pdf-price-list.ts`:
1. **PDF Text Stream Extraction:**
   - Integrate `pdf-parse@1.1.1` to extract plain text and table records from binary PDF buffers without native C++ compilation or canvas dependencies.
2. **Line Tokenizer & Appliance Recognition:**
   - Normalizes text line-by-line: handles Persian/Arabic digits (`۰-۹` ➔ `0-9`), thousand separators (`،`, `,`, `/`), and Persian bidi characters.
   - Matches Iranian appliance model patterns:
     - English alphanumeric codes: `DG-\d{2,4}`, `[A-Z]{1,3}[-\s]?\d{2,4}`, `V\d{2}`, `B\d{4}`, etc.
     - Persian model keywords: `مدل`, `کد`.
   - Identifies associated price figures (7 to 10 digits).
3. **Currency & Unit Detection:**
   - If numbers consistently exceed 10,000,000 and appliance prices average over 50,000,000, detects Rials and automatically converts to Tomans (dividing by 10).
   - Provides manual unit override (`auto` | `toman` | `rial`).
4. **Integration with `applyPriceList`:**
   - Feeds extracted rows `{ model, priceToman, sourceName }` into the matching engine in `packages/scraper-core/src/price-list.ts`.
   - Emits a `PriceListReport` with matched products, old prices, new prices, and change deltas.

## Verification

- Vitest unit tests in `packages/scraper-core/tests/pdf-price-list.test.ts` covering:
  - Persian digit conversion and separator stripping
  - Rial-to-Toman conversion
  - Appliance model regex matching
  - Handling of reversed and non-standard lines
- `pnpm --filter @kmodern/scraper-core test`
- `pnpm --filter @kmodern/scraper-core typecheck`

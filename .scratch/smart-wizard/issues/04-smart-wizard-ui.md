# 04 — Smart Wizard UI in Admin Panel

Status: done
Type: task
Blocked by: [01-universal-web-extractor.md, 02-pdf-price-list-parser.md, 03-gateway-endpoints.md]

## Problem Statement

The admin panel's current scraper page contains dozens of developer-focused technical controls, making it too complicated for the store operator (the owner's father), who needs to quickly import products or update prices between store tasks.

## Solution

Implement `SmartWizard` in `apps/admin/src/scraper/components/wizard/smart-wizard.tsx`:
1. **Three-Tab Guided Interface:**
   - **Tab 1: 🌐 استخراج محصول از هر وب‌سایت (Smart Product Ingest)**
     - Single URL text input with paste support.
     - Brand select (Datees, Akhavan, Can, etc.) or auto-detect.
     - "استخراج هوشمند" CTA.
     - Staged product cards (image preview, name, specs, price).
     - 1-click confirmation with Draft/Publish toggle.
   - **Tab 2: 📄 به‌روزرسانی قیمت با PDF یا اکسل (PDF / Excel Price Sync)**
     - Drag & drop zone supporting `.pdf, .xlsx, .xls, .csv`.
     - Currency toggle (`تشخیص هوشمند / تومان / ریال`).
     - Visual Price Diff Table:
       - Product Image & Title
       - Model Code
       - Old Store Price ➔ New Price
       - Diff Badge (e.g. `+۱,۵۰۰,۰۰۰ تومان ▲`)
       - Checkbox selection + "انتخاب همه".
     - Sticky action bar: «اعمال قیمت‌های تایید شده در فروشگاه».
   - **Tab 3: 🔄 استعلام آنلاین قیمت‌ها (Website Live Price Sync)**
     - Check live online prices from registered shops/sites and compare against catalog.
2. **Father-Friendly Ergonomics:**
   - Large touch-friendly buttons, clear Persian error explanations, auto-saved review state, and no technical regex jargon.
   - Embed prominently on `/scraper` page as the default landing view.

## Verification

- Vitest unit tests in `apps/admin/src/scraper/components/wizard/smart-wizard.test.tsx` verifying:
  - Tab switching and active states
  - File upload drag & drop and acceptance of `.pdf` and `.xlsx`
  - Price diff table rendering with formatted Persian Tomans
  - Batch action selection and invocation
- `pnpm --filter @kmodern/admin test`
- `pnpm --filter @kmodern/admin typecheck`
- `./scripts/audit.sh`

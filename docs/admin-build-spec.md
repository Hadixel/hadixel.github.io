# Admin app build — @kmodern/admin

Build the COMPLETE admin panel at `apps/admin` for the Kmodern e-commerce monorepo
(`/home/asd/dev/projects/react/E-commerce`). It is a Next.js 16 (App Router) app,
Persian RTL, Tailwind v4. It currently has only a placeholder `/` page, `src/app/layout.tsx`,
`src/app/page.tsx`, `src/app/globals.css`, `next.config.ts`, `tsconfig.json`, `package.json`.

Read these BEFORE coding:
- `tracker/tickets/` — all ticket markdown files (001, 005, 006, 007, 008, 009, 010, 011, 013, 014, 016, 017, 018, 019). Admin rules are in 010 (auth), 017 (settings/IA), 013 (media), 018 (discounts).
- `packages/db/prisma/schema.prisma` — the DB models. THIS IS THE CONTRACT. 30 models.
- `packages/schema/src/index.ts` — zod contracts (pageBlocks, postBody, menu, address, discount, settingKeys, iran data). `packages/schema/src/format.ts`, `src/jalali.ts`.
- `packages/adapters/src/*` — storage.ts (S3), kavenegar.ts (SMS), zarinpal.ts.
- `apps/admin/src/app/layout.tsx` + `globals.css` — existing shell (keep lang="fa" dir="rtl").

## Environment / run books
- All commands via `corepack pnpm` (pnpm 11.20.0). NEVER run `pnpm install` — I handle it.
- Local Postgres is RUNNING: `postgresql://kmodern:kmodern_dev_password@localhost:5432/kmodern?schema=public` (in root `.env`, gitignored). Seeded: 24 products, 32 variants, 12 categories, 21 settings, 3 pages, 3 menus, admin user `owner@kmodern.ir` (password hash prefix `scrypt$`, mustChangePassword true, password was `KmodernOwner#2026` during seed).
- DB access: `import { db } from "@kmodern/db"` — lazy singleton. Prisma 7 + `@prisma/adapter-pg`. Types: `$Enums` for enums.
- Typecheck: `corepack pnpm typecheck` in `apps/admin`. Do NOT run build or install.
- API routes under `src/app/api/...` (Next 16: `params` is a Promise — `const { id } = await params`).

## Must NOT do
- No new dependencies. No installs. No build. No git. No tests.
- Do NOT touch `apps/store`, `packages/*`, `tracker/`.
- Do not create a separate server — admin shares the store's API only via its own routes in this app.

## What to build (all in `apps/admin/src`)

### 1. Auth (010) — server-side Postgres sessions, host-scoped cookie
- `lib/auth.ts`: scrypt password hashing (node:crypto, `scrypt$<salt>$<hash>`, timingSafeEqual), session token = randomBytes(32) hex, store ONLY sha256 hash in `AdminSession`. Cookie `kmodern_admin` httpOnly+secure(sameSite lax), host-scoped: only set when `host === "admin.kmodern.ir"` (or localhost/admin dev). Rate limit: 5 failed logins per email per 15min (track in memory Map is fine, or reuse table if exists). Lockout: 30 min after 10 failures.
- `login()` returns `{ ok, error?, mustChangePassword? }`. Audit log via `AdminAuditLog` (action, actor, ip, meta).
- `requireAdmin()` — reads cookie, loads session (revokedAt null, expiresAt > now, sliding expiry 24h), returns admin or null. Wrap: `export async function requireAdmin(): Promise<AdminUser | null>`.
- After forced password change (`mustChangePassword`), every page except `/change-password` redirects there.
- Pages: `/login` (email+password form, calls `/api/auth/login`), `/logout` (POST `/api/auth/logout`), `/change-password` (current+new+confirm, POST `/api/auth/change-password`).

### 2. Shell + dashboard (017)
- Layout `src/app/(panel)/layout.tsx` (route group): sidebar (right side, RTL) with sections per 017 IA: داشبورد, سفارشها (badge: new orders count), محصولات, موجودی, مشتریان, محتوا (pages/blog/nav/media submenu), تخفیفها, تنظیمات, ممیزی. Topbar: admin name, logout. Mobile: collapsible.
- Dashboard `/` (inside panel group): stat cards (orders today, awaiting payment, low stock count, drafts), recent 8 orders table, low-stock list (stock ≤ threshold setting, default 3), pending reviews. Uses server components + `requireAdmin()`.
- A small `components/ui.tsx` with shared primitives (Button, Input, Select, Table, Card, Badge, Modal, Tabs) styled with Tailwind — do NOT add shadcn or any dependency.

### 3. Catalog CRUD
- `/products` list (search, filter by category/status, paginate 20). `/products/new`, `/products/[id]` edit form: name, slug (auto from name, unique), description, category (tree select), brand, status (draft/published/archived), price, seo fields, images; variants table (each: colorName, colorCode, sku, price, stock, reserved display, allowBackorder, images[] per 013 key pattern `products/{slug}/variant-{color}/img-{index}.jpg`), spec values (dynamic per category spec fields — CategorySpecField list, each ProductSpecValue row).
- `/categories` — tree (2 levels: root + child), each with name, slug, order, weightKg (REQUIRED, per 011), parent. CRUD + reorder.
- `/collections` — CRUD, items = product links with order.
- All via server actions or route handlers `src/app/api/admin/...` (your choice — prefer route handlers + client forms for consistency, or server actions; keep ONE pattern).
- 013 media: `/media` page with S3/本地 storage: upload via `/api/admin/media/upload` → `storage.ts` from @kmodern/adapters (env-gated: if no creds, store into `apps/admin/public/media/` with same key pattern as fallback). Show grid of uploaded files (read from storage listing or folder). Media library used to paste image URLs in content editors.

### 4. Orders + inventory
- `/orders` — filter by status (fulfillment + payment), search orderNumber, sort placedAt desc. Row: orderNumber, customer, total, statuses, placedAt.
- `/orders/[id]` — full detail: items, address snapshot, payments, status timeline (OrderStatusEvent), reservations. Status transitions (buttons, validate matrix from 011/019):
  - FULFILLMENT: PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED. Cancel/refund allowed from PENDING/CONFIRMED (and AWAITING payment).
  - PAYMENT: AWAITING → PAID (mark manually for C2C after checking receiptImageIds; COD commits at place so it's PAID-ish via paymentStatus=COD). C2C flow: show card details settings, upload receipt images, admin marks PAID.
  - On cancel/refund: restock (commitStock/restock + releaseStock logic — reimplement small helpers in `lib/inventory.ts`: restock(orderId), release(orderId), commit(orderId) following `apps/store/src/lib/orders.ts`).
  - Every transition writes OrderStatusEvent (dimension FULFILLMENT|PAYMENT, from, to, actor = admin email, note).
  - For AWAITING ONLINE orders: "لغو و آزادسازی" button → releaseStock + paymentStatus CANCELLED.
  - For AWAITING C2C: "تایید پرداخت" → paymentStatus PAID + commit stock + event.
- `/inventory` — low stock list, all products with stock/reserved, manual adjust (POST adjust: delta, note) writing AuditLog + adjusting Variant.stock.
- Manual order entry (017): `/orders/new` — pick customer (by phone), add items, address form (reuse addressSchema), payment method, place order (reuse order number logic — copy the small jalali counter logic from store: upsert OrderNumberCounter by jalaliYear).

### 5. Content (005/006/007/013)
- `/pages` list; `/pages/[id]` editor: page builder — block list (ordered, add/reorder/remove/edit), blocks from `blockSchema` in @kmodern/schema (23 component types). Render live preview using the component schemas (simple JSON form per block type: each schema → generic form from zod shape). System pages (kind SYSTEM) can't be deleted/renamed but CAN be edited. `draftBlocks`/`publishedBlocks` JSONB + status draft/published. Publishing copies draft→published + updates publishedAt.
- `/blog` list; `/blog/[id]` editor: title, slug, excerpt, cover, tags (BlogTag), status, body = TipTap-style JSON doc per `postBodySchema` (paragraph/heading/bulletList/orderedList/quote/codeBlock/image + embeds productCard/productGrid/imageGallery/video/callout). Store the JSON; embeds as structured nodes. Editor: build a minimal JSON node editor (textarea for JSON with validation against schema + friendly form for embeds) — do NOT add a library.
- `/nav` — menu editor: menus by location (HEADER/FOOTER/MOBILE). MenuItem tree (add/edit/delete/reorder, title, linkRef polymorphic per menuItemSchema: category/product/page/blog/custom), MenuPromo items (image, title, linkRef, mobileVisible default false).
- `/media` — see catalog section.

### 6. Settings + audit (017/016/018)
- `/settings` — form per section using `settingKeys` map (store identity, seo, shipping fees/caps, payment c2c card info, inventory threshold, checkout windows, sms toggles, blog byline). Save via upsert Setting rows. Show current values.
- `/discounts` — CRUD per discountSchema: type (PERCENT/FIXED/FREE_DELIVERY), mode (COUPON/AUTOMATIC), scope (ALL/PRODUCTS/CATEGORIES/COLLECTIONS with ids), value, maxAmount, minOrderSubtotal, date window, maxUsesTotal/PerCustomer, status. List active/inactive.
- `/audit` — AdminAuditLog list (filter by admin, action, date range).
- `/customers` — list + detail (orders, address book). (017 mentions customers section.)

## Quality bar
- Every screen must actually work end-to-end against the seeded DB (forms persist, lists filter).
- Typecheck must pass: `corepack pnpm typecheck` (in `apps/admin`).
- Persian UI strings, fa digits where natural (reuse `toFaDigits`/`formatToman` from @kmodern/schema).
- Reuse `@kmodern/schema` zod schemas for validation on the server where contracts exist (address, blocks, postBody, discount).
- Enums from `$Enums` — NEVER hardcode string unions that drift from schema.
- Keep it clean but pragmatic; this is a production panel — a form must save, a list must filter.

## Acceptance (verify yourself, no build)
1. `corepack pnpm typecheck` passes in apps/admin.
2. Manual code trace of each of the 6 sections — every route exists, every form handler persists, every status transition writes an event.
3. Auth: login → session row in AdminSession, cookie set, audit log entry; wrong password → error; mustChangePassword redirect works.

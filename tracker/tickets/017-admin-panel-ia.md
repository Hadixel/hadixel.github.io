---
title: Design the admin panel information architecture
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: []
---

## Question

/grilling + /prototype session. Every model the admin panel manipulates is now decided — products/variants/categories (004), page-builder (005), navigation (006), blog (007), orders/customers/inventory (009), auth/roles (010) — so the panel's own screen map is finally shapeable. Decide: the top-level navigation of the admin app and how it groups the domains (catalog, content, orders, customers, marketing, settings); the dashboard/landing screen and which queues or metrics it surfaces (new orders, low stock, unpublished drafts); list-vs-detail conventions and where bulk actions live; where **global settings** live (store info, delivery fee, blog default byline, low-stock threshold, menu locations); how the page-builder and the rich-text blog editor are reached and navigated back from; and mobile/tablet expectations for admin use (is order handling expected on a phone?). Output: the admin screen map + navigation structure for the spec.

## Resolution

Admin panel information architecture — decided.

### Top-level navigation (RTL sidebar)

| Group | Screens |
|---|---|
| **داشبورد** | Landing only |
| **سفارش‌ها** | Orders list · Order detail · Manual order · Low-stock |
| **کاتالوگ** | Products · Categories · Collections |
| **محتوا** | Pages · Blog · Navigation · Media |
| **مشتریان** | Customers list · Customer detail |
| **بازاریابی** | Discounts/coupons (shell until 018) |
| **تنظیمات** | Store · Shipping · Payments · Inventory · Notifications · Admin account · Audit log |

Badge counts: **سفارش‌ها** (new / awaiting payment), dashboard + low-stock for inventory.

### Dashboard (`/`)

**Queues (actionable cards → filtered lists):**
1. سفارش‌های جدید — fulfillment `PENDING` and/or payment `AWAITING` (C2C/COD) · count + last 5 rows
2. کم‌موجودی — variants at/under threshold
3. پیش‌نویس‌ها — combined draft products + pages + posts (three deep-links)

**Today strip:** orders placed today · revenue paid today (TOMAN) · open payment holds.

No charts / analytics (fog). Refresh: **on load only**.

### List ↔ detail conventions

- **Lists:** table (cards on narrow), search, filters, pagination, status chips; row → detail.
- **Detail:** full-page route, sticky header with primary actions. **No modals** for primary edit.
- **Create:** `/resource/new` same shell as edit.
- **Bulk:** Products & Posts — publish/archive. Orders — **export only** (no bulk status). No bulk hard-delete of order-linked rows.
- **Delete:** archive when lifecycle exists; hard delete only unreferenced drafts. Always confirm.
- **Nested:** variants inside product detail; category tree = one screen with inline expand + spec-field editor.
- **Heavy editors** (page-builder, blog): full-page only (matches 005/007).

### Settings tabs (`/settings/*`)

| Tab | Contents |
|---|---|
| فروشگاه | Name, logo, tagline, contact, default SEO (014), blog default byline |
| ارسال | Local fee mode/amount, post weight cap, post fallback, max COD total, باربری notes |
| پرداخت | C2C card/holder/bank only — Zarinpal secrets stay in Vercel env (not UI) |
| انبار | Global low-stock threshold |
| اعلان‌ها | SMS provider status + template checklist; `admin.alertMobile` reserved unused |
| حساب ادمین | Password change, sessions list/revoke (010) |
| گزارش حسابرسی | `AdminAuditLog` viewer |

Menu locations stay under **محتوا → ناوبری**, not Settings.

### Page-builder, blog, nav, media entry

| Surface | Route | Behavior |
|---|---|---|
| Pages list | `/pages` | system pages pinned; custom below; status filter |
| Page editor | `/pages/[id]` | structured block list (005) + Preview → storefront draft tab via preview token |
| Blog list | `/blog` | posts table; tags via side link/modal |
| Post editor | `/blog/new` · `/blog/[id]` | TipTap + metadata sidebar (007); same preview token |
| Navigation | `/navigation` | HEADER / FOOTER / MOBILE tree (006); no live canvas |
| Media | `/media` | flat library; entity pickers open as **modal** |

No iframe live-canvas. Unsaved guard (`beforeunload` + in-app). Save ≠ Publish where draft exists.

### Route inventory

```
/                              Dashboard
/orders                        Orders list
/orders/[id]                   Order detail (status, invoice PDF, cancel/refund)
/orders/new                    Manual order entry
/inventory/low-stock           Low-stock queue

/products                      Products list
/products/new | /[id]          Product detail (variants, specs, SEO, media)
/categories                    Category tree + spec fields
/collections                   Collections + product reorder

/pages                         Pages list
/pages/[id]                    Page-builder editor
/blog                          Posts list (+ tags)
/blog/new | /[id]              Post editor
/navigation                    Menus by location
/media                         Media library

/customers                     Customers list
/customers/[id]                Detail (orders, addresses, consent)

/marketing/discounts           Discounts (shell → 018)

/settings/store
/settings/shipping
/settings/payments
/settings/inventory
/settings/notifications
/settings/account
/settings/audit

/login                         Admin auth (outside app shell)
```

### Mobile / tablet

- Admin is **desktop-first** but **responsive enough for order triage on a phone**: sidebar collapses to a drawer; lists become stacked cards; order detail status actions remain thumb-reachable.
- **Not** expected on phone: page-builder, blog TipTap, category tree bulk work, media bulk upload — those show a “بهتر است در دسکتاپ” note if viewport is narrow, still reachable but cramped.
- No separate mobile admin app.

### Prototype

**Skipped.** Editor UX already locked in 005/006/007; this ticket delivers the screen map + conventions. Implement UI from this inventory.

### Hands to
- **018:** fills `/marketing/discounts`.
- Implementers: admin app routes, sidebar, dashboard read-models, settings tabs, shared list/detail shells.

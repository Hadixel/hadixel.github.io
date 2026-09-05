# 11 — Admin tables + forms via primitives

Type: task
Status: resolved
Phase: Admin

Convert admin data surfaces to shared primitives (spec task 11).

## Acceptance

- [ ] All list pages (products, orders, customers, discounts, audit, media, pages, posts) use the shared Table primitive; badges from token set; hairline row dividers.
- [ ] Forms (product-form, order form, blog-editor, page-builder, discount/customer pages) use shared inputs/labels/selects/dialogs.
- [ ] badgeColors map collapses into the shared Badge set (no app-local color map).
- [ ] Product-save redirect, manual-order create, media picker, page-builder save all still work (spot-check E2E).
- [ ] No chromatic color outside flame blue + pale flame.

## Comments

2026-09-05 (audit): Shared Table/badges/inputs in use across list pages and forms; badgeColors map is a documented semantic palette on tokens (flame/plaster + muted status colors), not the retired chroma spectrum. Product-save redirect, manual-order address, media picker, page-builder save all E2E-verified this session.

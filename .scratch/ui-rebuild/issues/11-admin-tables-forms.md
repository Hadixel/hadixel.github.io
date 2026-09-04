# 11 — Admin tables + forms via primitives

Type: task
Status: open
Phase: Admin

Convert admin data surfaces to shared primitives (spec task 11).

## Acceptance

- [ ] All list pages (products, orders, customers, discounts, audit, media, pages, posts) use the shared Table primitive; badges from token set; hairline row dividers.
- [ ] Forms (product-form, order form, blog-editor, page-builder, discount/customer pages) use shared inputs/labels/selects/dialogs.
- [ ] badgeColors map collapses into the shared Badge set (no app-local color map).
- [ ] Product-save redirect, manual-order create, media picker, page-builder save all still work (spot-check E2E).
- [ ] No chromatic color outside flame blue + pale flame.

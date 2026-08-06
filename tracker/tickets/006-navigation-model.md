---
title: Model navigation — navbar items, subcategories, mega menus
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [004-product-model.md]
---

## Question

/domain-modeling session. Admin-managed navbar: custom top-level items, dropdown subcategories, and mega menus (multi-column panels, possibly with images/banners inside). Decide: is navigation its own tree or derived from product categories (or mixed — category-driven items plus free links to custom pages/blog); mega-menu content model (columns, links, images, promo cards); depth limits; where an item can point (category listing, custom page, external URL); mobile menu behavior; ordering. Output: the navigation schema and its admin editing model.

## Resolution

The navigation model, decided field by field:

- **Source: hybrid linked menu.** Navigation is its own admin-built, ordered tree of menu items — **not** auto-derived from the category tree. Each item *links to* a target; categories are curated in, never dumped in. Formalizes replacing the hard-coded Home / All-Products / About / Contact / Orders links in `Navbar.jsx`.
- **Menus are keyed by location.** A `Menu` entity per location: `HEADER`, `FOOTER`, `MOBILE` (location unique). Header is primary; footer reuses the same item model rendered as link columns; **mobile is optional and falls back to the header menu** when absent.
- **Item targets are a polymorphic `LinkRef`.** An item points at exactly one of: category node, custom page, blog index, blog post, collection, external URL — or **nothing** (a group header that only labels / opens a panel). External links carry `newTab`. Targets resolve to an href at render time; a target that is deleted / unpublished / archived makes the item render **empty, not an error** (same fail-safe as the page model in 005).
- **Depth capped at the mega-menu shape (≤ 3 levels):** top item → column (heading / auto-list) → leaf link. Schema validation rejects deeper nesting.
- **Panel presentation is per top-level item:** `DROPDOWN` (one flat link list) or `MEGA` (grouped link columns + optional promo). A MEGA panel may carry one or more **promo slots** — a clickable image/banner with its own `LinkRef` (reuses the clickable-image model from the 008 component catalog). Featured-products-in-menu was declined for now; revisit under marketing.
- **Category links auto-list, per-item toggle.** Every item/column has a `childSource`: `STATIC` (children are explicit menu items) or `CATEGORY` (children are the referenced node's child categories, rendered **live** and kept in sync as the tree grows). The two can be **mixed within one panel** — auto where you want low upkeep, hand-picked where you want control. An auto-list renders only the node's direct children, so it cannot breach the depth cap.
- **Standard item flags mirror page blocks:** `visible` and `mobileVisible`. Ordering via `sortOrder` with drag-reorder in admin — the same pattern already used by `Category.sortOrder` / `CollectionItem.sortOrder`.
- **Mobile:** the header tree renders as a collapsible accordion drawer; group headers become section titles, category auto-lists expand their live children, and **promo media is hidden by default** (`mobileVisible = false` on promos). A distinct `MOBILE` menu can be authored later for a shorter list.
- **Admin editing model:** a "Navigation" screen with a selector per location (Header / Footer / Mobile). Each menu is a **structured, drag-reorderable tree of item cards** — the same structured-list-and-preview philosophy as the page builder (deliberately no live canvas). Item editor: label, target picker (typeahead resolving category / page / collection / blog post, a URL field for external, or "group / no link"), `childSource` toggle (Static vs Auto-list → pick node), display mode (Dropdown / Mega) on top-level items, a promo-slot manager on Mega items, and the visibility toggles. **One Zod schema in `packages/schema`** drives the admin form + API validation + renderer and enforces the depth cap — the single-source-of-truth pattern already established for components. Menus save-and-publish directly with in-editor preview; draft/publish parity is left as optional future work.

Sketch (entities, not final Prisma):

Menu(id, location [HEADER|FOOTER|MOBILE] unique, name, timestamps)
MenuItem(id, menuId, parentId, sortOrder, label, target LinkRef, childSource [STATIC|CATEGORY], categoryId?, display [DROPDOWN|MEGA], visible, mobileVisible)
LinkRef = { type: CATEGORY|PAGE|BLOG_INDEX|BLOG_POST|COLLECTION|EXTERNAL|NONE, targetId?, url?, newTab? }
MenuPromo(id, menuItemId, sortOrder, imageUrl, alt, link LinkRef, heading?, subtext?, mobileVisible=false)

**Deferred (fog):** seasonal/scheduled menu-item visibility folds into the marketing/discounts work already listed on the map; featured-products-in-menu and menu draft/publish parity are noted for later. No new ticket required — navigation surfaced no new decision area beyond the admin-IA and marketing items already on the map.

---
title: Model the product domain (categories, variants, specs, stock)
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: []
---

## Question

/domain-modeling session. What IS a product in this store? Current hard-coded data has: name, description, price, images, category/subcategory, colors, sizes, bestseller flag. Decide: category tree depth and ownership (do navbar subcategories derive from product categories?); variants (is a color a variant with its own price/stock/images — the site already links color choice to its image); spec tables for appliances (dimensions, energy rating, burner count...) — fixed fields or admin-defined per category ("dynamic add-product page"); stock tracking granularity; product statuses (draft/published/archived); SKU/slug rules. Output: the product schema the API and admin forms will implement.

## Resolution

The product domain model, decided field by field:

- **Variants: color = full variant.** A product owns 1..n variants; each variant carries its own price, stock count, SKU, and ordered image set. The storefront color picker switches variant → images + price (formalizing the existing "color links to its image" behavior). Products with a single color still have exactly one variant — no special case.
- **Categories: admin-managed arbitrary-depth tree.** Replaces the hard-coded category/subCategory pair. A product attaches to one category node. Navigation and mega menus (006) may point at any node; listing pages aggregate descendants.
- **Specs: hybrid.** A category defines spec fields (name, type, unit, filterable flag) which the add-product form renders dynamically — this is the "dynamic add-product page". Products may add free-form label/value extras for one-offs. Category-defined + filterable specs power faceted filtering ("all 5-burner cooktops").
- **Stock: tracked per variant** (integer count), with a per-product `allowBackorder` toggle. Storefront blocks out-of-stock variants at checkout; admin gets a low-stock view.
- **Lifecycle: draft → published → archived.** Archived products disappear from the store but persist for order history. No hard delete once referenced by an order.
- **Identity: DB id (cuid) internal; URL slug auto-generated from name, editable until publish; model number ("203") a plain searchable field.** Old `/product/<model>` URLs get redirects at migration time.
- **Merchandising: named collections** (admin-created, manually ordered product lists: "Best Sellers", "New Arrivals"). Homepage/page-builder product grids reference a collection. Replaces the `bestSeller` flag and date-sorted "Latest Models".

Sketch (entities, not final Prisma):

Product(id, slug, name, brand, model, categoryId, description, features[], status, allowBackorder, extraSpecs jsonb, timestamps)
Variant(id, productId, colorName, colorCode, sku, price, stock, images[] ordered)
Category(id, parentId, name, slug, sortOrder) + CategorySpecField(id, categoryId, name, type, unit, filterable, sortOrder)
ProductSpecValue(productId, specFieldId, value)
Collection(id, name, slug) + CollectionItem(collectionId, productId, sortOrder)

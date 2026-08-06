---
title: Model dynamic pages and the component/page-builder system
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [008-component-catalog.md]
---

## Question

/domain-modeling session. The heart of the "set anything dynamic" wish: admin-created pages at custom {slug} URLs, built from ordered, configurable components (hero, banners, sliders, product grids, rich text...). Decide: the Page and PageComponent data model (JSON block list vs rows); which existing hard-coded sections of Home/About/Contact become editable component instances; how component props are defined and validated; how sorting/reordering works; draft vs published pages; whether the Home page itself is "just a page" in this system; how a banner/image links to a URL (the "link color to its image" / clickable-banner ability). Output: the page/component schema plus the editing interaction model for the admin.

## Resolution

The page/page-builder model, decided:

- **Storage: ordered JSONB block list on the Page.** `Page(id, slug, title, kind, status, draftBlocks jsonb, publishedBlocks jsonb, seo{...}, timestamps)`. Each block: `{ id, type, props, visible, mobileVisible, anchorId, padding, background }`. Reorder = rewrite the array; draft/publish = two columns; one query renders a page. Querying "pages using component X" needs a JSON scan — acceptable at this scale.
- **Page kinds: system + custom.** Home, About, Contact are **system pages** (fixed slug, undeletable, fully block-editable — Home *is* just a page). Admin-created pages get custom `{slug}`. Product listing/detail, cart, checkout, and blog stay **coded routes** exposing block-editable **zones** only where useful (e.g. a banner strip above the product grid). Slug uniqueness is validated against category slugs and reserved words.
- **Editor UX: structured list + preview.** Admin edits a vertical list of block cards (add, drag-reorder, expand to edit props, visibility toggle); a Preview button renders the real storefront in draft mode via a preview token. No live-canvas WYSIWYG — deliberately cut as a timeline risk.
- **Props: one Zod schema per component type**, in a shared `packages/schema`. The admin form is generated from the schema, the API validates block props against it on save, and the storefront renderer trusts validated data. Single source of truth; TypeScript types derived from the schemas. Unknown/invalid block types render nothing (fail safe), never crash the page.
- Renders the 23 components from the approved [component catalog](../assets/component-catalog-draft.md). A block referencing deleted content (e.g. a removed collection) renders empty, not an error.

This is the "custom {slug} pages" and "sort any component on any page" capability from the original ask.

---
title: Model the blog — posts, editor, and listing
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: []
---

## Question

/grilling session. Dynamic blog page plus a "full option" add-blog page. Decide: post fields (title, slug, cover, excerpt, tags/categories, author, publish date, status); the editor experience — rich-text (TipTap-style), markdown, or the same block/component system as pages (if so, this may merge with the page-builder model); embedded product cards inside posts; comments (yes/no/later); listing page features (pagination, tag filter, search). Output: blog schema + editor choice.

## Resolution

The blog model, decided:

- **Post is its own entity, not a page-builder page.** Editing is a **prose-first rich-text (TipTap-style) WYSIWYG** — headings, bold/italic, lists, links, inline images — with a `body` stored as validated JSON (a TipTap document). This keeps the blog distinct from the page-builder (005); the two do **not** merge. Long-form buying-guides / how-tos read and edit naturally as prose.
- **Inline structured embeds** can be dropped between paragraphs, each a custom rich-text node that **reuses the component library** from 008/005: **product card / grid** (pick products or a collection — the core blog→shop cross-sell), **image gallery / captioned figure**, **video**, and **callout / quote box** (tip/warning/note + pull-quotes). Each embed node's attrs are validated by the **same Zod schema** as its page-builder counterpart; a server-side renderer maps node type → component; unknown/invalid nodes render empty (fail-safe, matching 005).
- **Video embeds support Aparat and YouTube — with a caveat.** Per the map's Iran-reachability rule, **YouTube is filtered inside Iran and will not load for most customers without a VPN**; Aparat is the reachable equivalent. The admin video-embed UI surfaces this warning and defaults to Aparat; YouTube is allowed for completeness (e.g. diaspora traffic) but flagged as customer-invisible inside Iran.
- **Taxonomy: own lightweight tags.** A `BlogTag(id, name, slug)` list, admin-managed (pick existing or create), many-to-many with posts via a join — separate from the product category tree. Powers tag filtering and `/blog/tag/{slug}` pages; the managed list avoids free-text tag drift.
- **Authorship: single store byline.** A global default byline setting (shop name / owner) with an optional per-post override string. No Author entity.
- **Comments: deferred behind a hook.** No comment system now; each post carries a `commentsEnabled` boolean so it can be switched on later without a migration. (Product reviews are a separate, later concern in the product/orders domain.)
- **Lifecycle mirrors products (004): draft → published → archived**, plus an optional `publishAt` datetime. A post is publicly visible only when `status = PUBLISHED` **and** `publishAt <= now` — enforced by a query filter, no cron needed (ISR / on-demand revalidation refreshes the page). Archived posts leave the listing but keep their URL.
- **Listing / index page:** pagination (or load-more), **tag filter**, a **featured / pinned** hero post (`featured` boolean, pinned above date order), and **keyword search**. Search uses **Postgres full-text search** (a `searchVector` maintained on the post over title/excerpt/body-plaintext) — no third-party search service (also sidesteps sanctions-blocked SaaS like Algolia).
- **Standard post fields:** `title`; auto-generated editable `slug` (validated unique against pages/categories/reserved words, per 005); `excerpt` (explicit field, optional auto-fill from the body, used on cards + meta); `coverImage` (on ArvanCloud, per 003); `tags[]`; byline override; `body` (rich-text JSON); `status`; `publishAt`; `featured`; `commentsEnabled`; and a reserved **`seo` object whose shape ticket 014 will define** (this ticket unblocks 014). Reading-time is derived from body word count.
- **Admin editor UX:** a dedicated "Blog" section — a posts list with status filters, and a post editor pairing the rich-text canvas with a metadata sidebar (slug, excerpt, cover, tags, byline, status, publishAt, featured, commentsEnabled, seo). Draft **preview reuses the same preview-token mechanism** as the page builder (005).

Sketch (entities, not final Prisma):

Post(id, slug, title, excerpt, coverImage, body jsonb, byline?, status [DRAFT|PUBLISHED|ARCHIVED], publishAt?, featured bool, commentsEnabled bool, seo jsonb [shape per 014], searchVector tsvector, timestamps)
BlogTag(id, name, slug, sortOrder) + PostTag(postId, tagId)
Setting: blog.defaultByline (global)

**Unblocks:** ticket 014 (SEO model) — now on the frontier.
**Deferred (fog):** blog comments (a `commentsEnabled` hook exists), an RSS/Atom feed, and blog-specific analytics — noted on the map; no new tickets until they're sharp enough to specify.

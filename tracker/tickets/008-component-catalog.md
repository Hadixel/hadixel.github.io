---
title: Propose the e-commerce component catalog
labels: [wayfinder:prototype]
status: closed
assignee: claude-main
blocked-by: []
---

## Question

The owner asked to be *presented with* a list of useful components for an e-commerce site like this one — hero, banners, sliding/gif strips, product cards, category cards, testimonial/trust sections, USP rows (the existing OurPolicy), newsletter, FAQ, video, countdown/sale blocks, etc. Prototype ticket: draft the catalog as a reviewable document — each component with a sketch/description, its configurable props, and where it would be used — and walk it with the owner, cutting and adding until the v1 catalog is agreed. Output: the agreed component list that the page-builder model (005) will formalize.

## Resolution

Catalog approved as-is by the owner. The agreed v1 component list — 23 components in three tiers — lives in [component-catalog-draft.md](../assets/component-catalog-draft.md):

- **Tier 1 (core, 9):** Hero, Product Grid, Product Slider, Rich Text, Banner, Banner Pair/Trio, USP/Policy Row, Category Tiles, Spacer/Divider — covers everything currently hard-coded (Hero, BestSeller, LatestModels, OurPolicy) plus the owner's banner/slider wishes.
- **Tier 2 (conversion & trust, 8):** Image+Text Split, Sliding Strip (the "sliding gif"), Testimonials, FAQ Accordion, Video (Aparat-friendly), Countdown/Sale Timer, Blog Teaser, Trust Badges.
- **Tier 3 (nice-to-have, 6):** Newsletter/SMS Signup, Stats Row, Comparison Table (auto-driven by category spec fields), Before/After Slider, Map/Showroom (Neshan/Balad), Custom HTML escape hatch.
- **Cut:** Instagram embed (filtered in Iran), live-chat widget (foreign SaaS blocked; revisit separately), popups (hostile UX).
- **Standard props on every component:** anchor id, padding presets, background, visibility toggle, mobile visibility override. Every image prop carries an optional link URL + alt text (the "clickable banner" ability).

The page-builder model (005) formalizes this list; tiers suggest build order but all 23 belong to the spec.

# 03 — Signature shared components

Type: task
Status: resolved
Phase: Foundation

Build the Showcase-specific components both apps reuse (per CONTEXT.md terms).

## Acceptance

- [ ] **Price** — Persian digits, Vazirmatn 600 `tabular-nums`, range support ("X تا Y"), `formatToman` under the hood.
- [ ] **Badge set** — New/نو (flame blue), Sold-out/ناموجود (slate), New Color/رنگ جدید (pale flame) — identical pill anatomy, fill-only differentiation, 12px offset top-right (RTL) on cards.
- [ ] **Color dots** — interactive swatches from variant `colorCode`s; tap live-swaps card image to that variant (no navigation); dots are 20px, ring on active; never renders a count. Matches CONTEXT.md "Color dots" definition exactly.
- [ ] **Section header** — title right, 40x40 arrow buttons (hairline border, 10px radius, ash chevrons), carousel wiring optional prop.
- [ ] **See-all control** — content-column width, hairline, ink text.
- [ ] **Credit mark** — دیتیس 40x40 white thumbnail on product cards (plaster surface, 4px inner radius).
- [ ] Each component exported from `@kmodern/ui` with a one-paragraph usage note.
- [ ] Visual check page (temporary route or story) shows all components side by side in RTL.

## Comments

2026-09-05 (audit): Price (Persian digits, tabular, nowrap), ColorDotSwatches/ColorDots with live image swap, ProductGallery (plinth + hairline tabs), SectionHeader, CreditMark, Badges, RankNumeral shipped and consumed by store surfaces. Card dots sized 24px this session for touch-target compliance (Lighthouse target-size).

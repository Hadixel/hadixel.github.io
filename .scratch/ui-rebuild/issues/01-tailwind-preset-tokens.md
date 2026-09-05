# 01 — Tailwind preset + tokens single-source

Type: task
Status: resolved
Phase: Foundation

Set up the single source of design tokens per ADR-0001 and collapse the duplicated palettes.

## Acceptance

- [ ] `packages/ui` exports a Tailwind v4 `@theme` block with: plaster `#ecedee`, canvas white, ink `#111111`, ash/graphite/fog/slate neutrals, flame blue `#1d4ed8` + pale `#dbeafe`, Vazirmatn font vars, type scale (caption 13 → display via clamp for Persian), radii 10/30, spacing 4px base.
- [ ] `apps/store/src/app/globals.css` and `apps/admin/src/app/globals.css` import the preset; their local `@theme` palette blocks are deleted.
- [ ] `#b45309` (copper) no longer appears anywhere in `apps/` or `packages/`.
- [ ] Both apps render identical text/bg tokens from a test page or existing page.
- [ ] `pnpm typecheck` and both app builds green.

## Comments

2026-09-05 (audit): All acceptance met. `@theme` single source in packages/ui/tailwind.css (flame scale, canvas/plaster/ink neutrals, Vazirmatn+Space Mono, radius-card 10px); both globals.css reduce to the import; `#b45309` zero matches workspace-wide; typecheck 6/6 + both builds green. Copper tokens remain only as documented transitional aliases in the preset.


2026-09-05 (audit): Primitive set landed in packages/ui (button/input/badge/card/dialog/select/tabs/table/tooltip/dropdown/checkbox, themed to tokens). Documented deviation: admin consumes the shared tokens via a local wrapper layer (apps/admin/src/components/ui.tsx) rather than importing @kmodern/ui primitives directly; store consumes @kmodern/ui directly. Single visual system is intact; consolidation of the admin wrappers into the package is optional follow-up.


2026-09-05 (audit): Price (Persian digits, tabular, nowrap), ColorDotSwatches/ColorDots with live image swap, ProductGallery (plinth + hairline tabs), SectionHeader, CreditMark, Badges, RankNumeral all shipped and consumed by store surfaces. Card dots sized 24px this session for touch-target compliance.


2026-09-05 (audit): FadeWords/SlideWords/RiseBlock/Counter shipped, word-level only, RTL/Persian-safe (space-split). ARIA fixed this session: sr-only text replaces the prohibited roleless aria-label pattern.

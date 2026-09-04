# 01 — Tailwind preset + tokens single-source

Type: task
Status: open
Phase: Foundation

Set up the single source of design tokens per ADR-0001 and collapse the duplicated palettes.

## Acceptance

- [ ] `packages/ui` exports a Tailwind v4 `@theme` block with: plaster `#ecedee`, canvas white, ink `#111111`, ash/graphite/fog/slate neutrals, flame blue `#1d4ed8` + pale `#dbeafe`, Vazirmatn font vars, type scale (caption 13 → display via clamp for Persian), radii 10/30, spacing 4px base.
- [ ] `apps/store/src/app/globals.css` and `apps/admin/src/app/globals.css` import the preset; their local `@theme` palette blocks are deleted.
- [ ] `#b45309` (copper) no longer appears anywhere in `apps/` or `packages/`.
- [ ] Both apps render identical text/bg tokens from a test page or existing page.
- [ ] `pnpm typecheck` and both app builds green.

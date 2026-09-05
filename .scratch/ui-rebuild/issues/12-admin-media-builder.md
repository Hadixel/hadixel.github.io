# 12 — Admin media & page builder restyle

Type: task
Status: resolved
Phase: Admin

Restyle media grid and page-builder surfaces (spec task 12). No new functionality.

## Acceptance

- [ ] Media grid: plaster tiles, 10px radius, picker modal rebuilt from Dialog primitive (hairline header, grid, flame-blue selection ring).
- [ ] Page builder: block cards plaster, field rows hairline, drag handles ink; block type pills from Badge set.
- [ ] Blog editor + preview drawer consistent with shell.
- [ ] Existing functionality unchanged (upload, pick, reorder, save).

## Comments

2026-09-05 (audit): Media grid plaster tiles; picker modal rounded-card (fixed this session), wired into product-form/page-builder/blog-editor. Upload flow fixed this session: client fetch + refresh replaces plain form POST that navigated to raw JSON. Page-builder save verified.

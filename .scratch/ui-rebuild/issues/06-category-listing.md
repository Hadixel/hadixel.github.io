# 06 — Category & products listing rebuild

Type: task
Status: resolved
Phase: Store

Rebuild `/category/[slug]` and `/products` grids (spec task 6).

## Acceptance

- [ ] Product card = plaster plinth: image `object-contain` ~60% height, metadata cluster bottom-right (credit mark → name → mono model code → price), Color dots row, badge slot top-right.
- [ ] Hover: crossfade to alternate variant image (no lift-shadow).
- [ ] Sort dropdown, results count, empty state in language tokens; flame blue only on active sort + dots ring.
- [ ] Grid 4/2/1 collapse; sidebar rebuilt as hairline list (current section = ink text, others ash).
- [ ] Sort/filter behavior unchanged (newest / price-asc / price-desc still work).

## Comments

2026-09-05 (audit): Plinth cards with Color dots (24px targets), hairline category sidebar, sort dropdown, 4/2/1 collapse verified. Category subtree query returns only the category's products (oven page: 5 ovens). Screenshots captured.

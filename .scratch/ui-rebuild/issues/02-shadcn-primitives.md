# 02 — shadcn/ui primitives into packages/ui

Type: task
Status: open
Phase: Foundation

Init shadcn/ui against the token preset; theme CSS variables to plaster/ink/flame-blue; add the functional base set.

## Acceptance

- [ ] Components: button, input, label, textarea, select, dialog, sheet, dropdown-menu, tabs, toast/sonner, badge, table, card, skeleton, tooltip, switch, checkbox.
- [ ] All themed via CSS variables (no hardcoded hex in component files); flame blue only on primary button + active/selected states.
- [ ] Button variants map: primary (flame blue fill), ink (ink fill), outline (hairline), ghost. Radius 10px; pill only where semantically a badge.
- [ ] `apps/store` and `apps/admin` import at least one primitive each from `@kmodern/ui` (alias wired in both tsconfigs).
- [ ] RTL sanity: all primitives render correctly under `dir="rtl"` (chevrons, closes, alignment).
- [ ] `pnpm typecheck` and both builds green.

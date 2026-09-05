# 10 — Admin shell + login redesign

Type: task
Status: resolved
Phase: Admin

Rebuild admin shell and auth surfaces (spec task 10).

## Acceptance

- [ ] Sidebar: white surface, hairline right border (RTL), ink section labels, flame-blue active state, ash icons 1.5px stroke.
- [ ] Topbar: hairline bottom border, breadcrumb/prefix title logic preserved.
- [ ] `/login` + `/change-password`: gallery-minimal centered card on canvas (no plaster box-in-box), ink CTA or flame-blue primary.
- [ ] Dark Reader / extension suppression stays (`suppressHydrationWarning` on html).
- [ ] Admin auth flows unchanged (session cookie, audit).

## Comments

2026-09-05 (audit): Sidebar hairline + flame active states, topbar prefix titles on detail routes, login centered card (shadow removed this session). Auth flows unchanged and E2E-verified via direct session row. Known limitation: sidebar not collapsed at 390px (admin is desktop-first; noted for owner).

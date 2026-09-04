# 10 — Admin shell + login redesign

Type: task
Status: open
Phase: Admin

Rebuild admin shell and auth surfaces (spec task 10).

## Acceptance

- [ ] Sidebar: white surface, hairline right border (RTL), ink section labels, flame-blue active state, ash icons 1.5px stroke.
- [ ] Topbar: hairline bottom border, breadcrumb/prefix title logic preserved.
- [ ] `/login` + `/change-password`: gallery-minimal centered card on canvas (no plaster box-in-box), ink CTA or flame-blue primary.
- [ ] Dark Reader / extension suppression stays (`suppressHydrationWarning` on html).
- [ ] Admin auth flows unchanged (session cookie, audit).

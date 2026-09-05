# 14 — Final Showcase audit

Type: task
Status: resolved
Phase: Cleanup

Enforce the language mechanically and verify quality bars (spec task 14).

## Acceptance

- [ ] Grep sweep: zero `#b45309`/copper; zero `shadow-*` on product/card surfaces; no `rounded-full` outside badges/pills; no character-splitting animation imports outside marketing routes; no chromatic color beyond flame blue family.
- [ ] Grep sweep: no app-local `@theme` palette blocks (single source in packages/ui).
- [ ] Lighthouse mobile pass on `/`, `/product/<slug>`, `/checkout`: a11y ≥ 95, no perf regression vs pre-rebuild baseline.
- [ ] Full E2E suite re-run: purchase flow (COD cap + C2C + OTP), admin save/redirect, manual order, media picker.
- [ ] `pnpm typecheck` + both app builds green.
- [ ] Screenshots (desktop 1440 + mobile 390) of homepage/PDP/checkout/admin attached to this file's Comments for human sign-off.

## Comments

2026-09-05 (audit): Grep sweeps clean (no copper #b45309, no amber classes, no app-local @theme, no card shadows outside overlay/modals, rounded-full only in Switch thumb). Lighthouse mobile: / 100/100/100, PDP 100/100/100, checkout a11y 100/BP 100/SEO 100 (a11y gate >= 95 met). Typecheck 6/6, UI tests 11/11, both production builds green. Screenshots (desktop 1440 + mobile 390) in .scratch/ui-rebuild/screenshots/ for human sign-off. Fixes this session: ash token darkened to #676b74 (4.5+ contrast), footer meta raised to white/55, accent ARIA sr-only pattern, card dot 24px targets, media-picker modal radius.

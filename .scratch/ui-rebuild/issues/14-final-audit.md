# 14 — Final Showcase audit

Type: task
Status: open
Phase: Cleanup

Enforce the language mechanically and verify quality bars (spec task 14).

## Acceptance

- [ ] Grep sweep: zero `#b45309`/copper; zero `shadow-*` on product/card surfaces; no `rounded-full` outside badges/pills; no character-splitting animation imports outside marketing routes; no chromatic color beyond flame blue family.
- [ ] Grep sweep: no app-local `@theme` palette blocks (single source in packages/ui).
- [ ] Lighthouse mobile pass on `/`, `/product/<slug>`, `/checkout`: a11y ≥ 95, no perf regression vs pre-rebuild baseline.
- [ ] Full E2E suite re-run: purchase flow (COD cap + C2C + OTP), admin save/redirect, manual order, media picker.
- [ ] `pnpm typecheck` + both app builds green.
- [ ] Screenshots (desktop 1440 + mobile 390) of homepage/PDP/checkout/admin attached to this file's Comments for human sign-off.

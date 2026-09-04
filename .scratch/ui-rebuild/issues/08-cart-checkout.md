# 08 — Cart & checkout rebuild

Type: task
Status: open
Phase: Store

Rebuild `/cart` and `/checkout` (spec task 8). Zero logic changes.

## Acceptance

- [ ] Cart: plaster line-item surfaces, qty stepper hairline, totals block hairline-divided; flame blue on the single checkout CTA.
- [ ] Checkout: stepped sections with numeral markers (۱ آدرس، ۲ پرداخت، ۳ خلاصه); summary card plaster; inputs 10px; province/city selects from primitives.
- [ ] Coupon + preview buttons ghost/outline per token set.
- [ ] Full E2E re-verified: Kerman address → COD rejection at cap → card-to-card order → OTP devCode → order page renders.
- [ ] Cart persistence fix intact (no wipe on hard reload).

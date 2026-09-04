# Map — UI Rebuild (Showcase)

Spec: [spec.md](./spec.md) · ADR: [docs/adr/0001-showcase-design-language.md](../../docs/adr/0001-showcase-design-language.md)

## Notes

- Design language is fully decided and recorded in CONTEXT.md + ADR-0001. No open design questions.
- Reference: Zellerfeld style sheet (Refero a6efcd16) + React Bits (word-level only) + shadcn/Radix base in packages/ui.
- Existing verified behavior that must keep passing: store purchase E2E (COD cap → card-to-card + OTP), admin product-save redirect, manual-order address flow.

## Decisions so far

- (grill 2026-09-04) Scope: store + admin; legacy-store retired. → CONTEXT.md, ADR-0001
- (grill 2026-09-04) Flame blue #1d4ed8 single accent; copper retired. → CONTEXT.md, ADR-0001
- (grill 2026-09-04) Color dots with live swap; count badges banned. → CONTEXT.md
- (grill 2026-09-04) shadcn base + React Bits accents + Refero direction. → ADR-0001

## Fog

- Exact React Bits effect shortlist (task 4 picks 4–6; needs visual trial, not more grilling).
- Whether ranked-numeral treatment needs a font license check for 900 weight rendering (Vazirmatn is OFL — fine; noted so nobody re-asks).

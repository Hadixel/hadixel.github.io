# ADR-0002: HeroUI Component Stack for the Storefront

## Status

Accepted (2026-09-07)

## Context

ADR-0001 pinned the component stack to shadcn/ui + Radix primitives copied into `packages/ui`, and its depth doctrine — "no drop shadows on cards — separation by surface stepping" — produced a deliberately flat storefront. The owner wants the store to read as premium and layered like HeroUI's own site: soft shadows, elevation, hover lift on cards, dropdowns, and modals. Hand-rolled controls also mean every new control re-builds states, overlays, and accessibility one piece at a time.

Constraints that carry over from ADR-0001 unchanged: Persian RTL, Tailwind v4, Flame blue as the single chromatic accent, the 10px/30px radius discipline, Vazirmatn typography, React Bits word-level accents only.

## Decision

1. **`@heroui/react` v3 (React Aria components + Tailwind v4-native CSS) is the storefront's component library.** This supersedes ADR-0001's point-5 component-stack decision ("shadcn/ui + Radix primitives") for `apps/store`. Theming is a CSS-variable bridge (`apps/store/src/app/showcase-theme.css`) mapping Showcase tokens onto HeroUI's semantic roles; the shared `packages/ui` preset remains the token/font source of truth and is imported last. React Aria's `I18nProvider locale="fa"` (in `apps/store/src/app/providers.tsx`) drives RTL behavior including overlay mirroring.
2. **Elevation is part of the language now.** This amends ADR-0001's "no drop shadows on cards" rule: HeroUI's soft surface/overlay shadows and hover lift are ON for cards, popovers, panels, modals, drawers, and dropdowns. Flame blue, the single-spark accent doctrine, radius discipline (10px controls/cards, 30px badge pills), RTL, and typography rules are unchanged.
3. **Light-only.** The store pins `data-theme="light"` on `<html>`; the library's dark palette is unused.
4. **Brand-domain components stay custom** (`Price`, `CreditMark`, `ColorDotSwatches`, `ProductGallery`, the word-level accents in `packages/ui`) — HeroUI doesn't provide them and they carry the Showcase identity. `packages/ui`'s generic shadcn-style primitives are retired from the storefront; the admin panel keeps them until a later decision.

## Consequences

- The storefront gets drawers, modals, popovers, OTP input, selects, badges, and pending states from one maintained library instead of hand-rolled copies; fixes land once.
- `packages/ui` remains the font/token layer and brand-component home for both apps; the storefront imports only domain components from it.
- Reviewer rules from ADR-0001 are amended: soft shadows on cards and hover lift are now correct; every other rule stands.
- The admin panel's future migration can reuse the same theme bridge; the two apps are not forced to move together.
- The previous design ADR stays on record for its still-valid decisions (token palette, RTL rules, legacy retirement); this ADR covers only the component stack and the elevation amendment.

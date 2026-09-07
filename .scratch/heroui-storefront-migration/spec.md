# HeroUI Storefront Migration

Status: ready-for-agent
Phase: Store

## Problem Statement

The storefront's UI is a mix of hand-rolled components and a shadcn/Radix primitive layer, styled under a deliberately flat design language — no shadows, separation only by surface stepping. The owner finds the result visually flat and lacking depth compared to modern component libraries (HeroUI's own site being the reference), and every new control still means hand-building states, overlays, and accessibility one piece at a time. The store should read as premium and layered like the reference, with a real component library underneath — without giving up the brand palette, Persian RTL, or the verified purchase flows.

## Solution

Adopt HeroUI v3 as the storefront's component library, themed to the Showcase design language: Flame blue as the single accent, ink/plaster monochrome surfaces, Vazirmatn typography, 10px control radius and 30px badge pills — with HeroUI's soft-shadow elevation and hover depth turned on for cards, panels, modals, drawers, and dropdowns. Every storefront surface migrates in dependency order (header & search, auth & forms, PDP buy-box, cards & homepage), each phase staying shippable. Brand-specific components that no library provides (Persian-digit price, brand credit mark, color-dot swatches with live image swap, product gallery, word-level text accents) remain custom. The component-stack decision in the design ADR is superseded and the flat-card rule amended by a new ADR; the admin panel and retired legacy app are untouched.

## User Stories

1. As a desktop shopper, I want soft elevation on the search panel, cards, and menus, so that the store feels layered and premium rather than flat.
2. As a desktop shopper, I want cards to lift subtly on hover, so that interactive elements feel alive and inviting.
3. As a Persian-speaking shopper, I want the entire UI to stay right-to-left with correctly mirrored overlays, so that HeroUI components read natively.
4. As a Persian-speaking shopper, I want prices and copy to keep their Vazirmatn typography and Persian-digit formatting, so that the brand voice survives the migration.
5. As a mobile shopper, I want the category menu to slide out as a drawer from the start edge, so that navigation feels like the native apps I know.
6. As a mobile shopper, I want the search card to keep its live results, recents, and promo banner, so that search quality doesn't change while its look improves.
7. As a shopper logging in, I want the login modal to be a proper dialog with focus containment, so that keyboard and screen-reader behavior just work.
8. As a shopper verifying by SMS, I want polished one-time-code boxes with auto-advance, so that entering the code is effortless.
9. As a shopper mid-purchase, I want the add-to-cart button to show a pending state while the cart updates, so that I never double-add.
10. As a shopper comparing variants, I want a real select control for model/variant choice, so that options are readable and accessible.
11. As a shopper browsing the listing, I want status badges as consistent pills, so that sale/status signals are instantly scannable.
12. As a keyboard user, I want Escape, outside-click, and focus trapping on every overlay, so that dismissal and traversal follow platform conventions.
13. As a keyboard user, I want visible focus rings on all controls, so that I always know where I am.
14. As a returning customer, I want my recent searches, cart, and checkout behavior unchanged, so that the redesign is purely visual.
15. As a store owner, I want one component library powering every control, so that fixes and visual upgrades land once instead of per hand-rolled copy.
16. As a store owner, I want the Flame-blue accent to remain the only chroma on the page, so that the brand's single-spark identity survives the migration.
17. As a store owner, I want the search suggestions driven by the real catalog exactly as today, so that the richer panel never shows stale or hand-typed data.
18. As a store owner, I want the purchase and OTP flows untouched end to end, so that revenue-critical paths carry zero migration risk.
19. As a developer, I want the theme defined once as design tokens mapped onto the library's variables, so that palette changes are a one-file edit.
20. As a developer, I want a written decision record for the new component stack, so that future contributors know why HeroUI replaced the previous choice.
21. As a developer, I want the shared package's generic primitives retired from the storefront with no dangling imports, so that there is one way to build a control.
22. As a developer, I want the shared brand components (price, credit mark, color dots, gallery, accents) to survive the migration, so that admin's future migration can reuse them.
23. As a future maintainer, I want the admin panel's eventual migration enabled by this work, so that both apps converge on one stack without being forced to move together.
24. As a shopper on a slow connection, I want the library tree-shaken to only what the storefront uses, so that the redesign doesn't bloat the bundle.

## Implementation Decisions

- **Library and version**: HeroUI v3 (`@heroui/react`, current 3.x) — React Aria components with Tailwind v4-native CSS styling. No theme provider is required; a client `I18nProvider` with the Persian locale wires React Aria's RTL behavior, wrapping the app inside the root layout.
- **Theming by CSS variables**: the app pins the light theme and maps Showcase tokens onto HeroUI's semantic color roles in one dedicated theme stylesheet imported after the library styles — background = white canvas, foreground = ink, surfaces = plaster steps, accent = Flame blue `#1d4ed8` with white accent-foreground, muted = ash, separator = hairline plaster, control radius 10px and badge-pill radius 30px. Exact variable spellings are read from the installed library's default-theme variables file at implementation time (docs name the roles; the package carries the source of truth). The shared workspace preset stays imported last so the Vazirmatn font faces remain authoritative.
- **Depth doctrine**: HeroUI's soft shadows and hover elevation are ON for cards, popovers, panels, modals, drawers, and dropdowns. This amends the "no drop shadows on cards" rule; a new ADR supersedes the previous component-stack decision (shadcn/Radix) for the storefront and records the elevation amendment. Flame blue, radius discipline, RTL, and typography rules carry over unchanged. The library's built-in dark palette is unused — the store is light-only.
- **RTL**: React Aria drives direction from the document plus the locale provider; drawer placement uses the physical side that opens from the start edge in RTL, verified visually during the header phase.
- **Rebuild map (behavior contracts preserved, markup replaced)**: category menu → HeroUI Drawer; desktop search field → HeroUI Input with the existing suggestion panel hosted in a HeroUI Popover (the panel body keeps its live/recents/promo content); suggestion chips and icon triggers → HeroUI Buttons; login modal → HeroUI Modal with native Escape/outside-click (the hand-rolled Escape listener is deleted, not kept alongside); OTP entry → HeroUI InputOTP (controlled, onComplete submits) keeping the existing code-length and verification contract; newsletter → HeroUI Input + pending Button; PDP add-to-cart → pending Button and variant choice → HeroUI Select; status badges → HeroUI Badge pills.
- **Contracts that must not move**: search submit semantics (record the term, re-run the listing when already on it — recently hardened behavior), device-local recent-searches store, cart provider contract, OTP endpoint contract, catalog-driven suggestions.
- **Shared package disposition**: it remains the font/token layer for both apps and keeps the brand components (price, credit mark, color-dot swatches and logic, product gallery, word-level accents). Its generic shadcn-style primitives are retired from the storefront — after the final phase, no storefront file imports them; the shared package itself is not deleted because the admin preset depends on it.
- **Phasing**: foundations (install, theme bridge, locale provider, ADR) → header & search → auth & forms → PDP buy-box → cards/homepage + cutover. Each phase ends with typecheck and the test suite green plus a browser demo. Phases 1–4 touch disjoint surfaces; only the foundation gates the rest.
- **Admin and legacy app**: excluded from this effort (owner decision — storefront first). The spec's cutover check is scoped to storefront imports only.

## Testing Decisions

- Tests assert external behavior only — endpoint JSON and rendered DOM — never component internals. A UI-library migration deliberately replaces markup, so markup-pinning tests would fight the change.
- **Automated seams stay exactly as they are (user-confirmed)**: the search endpoint suite (typed query → slug, nonsense/short → empty, hot mode → published products) and the shared package's pure-logic tests (color-dot logic, price) keep passing untouched, proving the behavior contracts survived the restack.
- **Behavioral net is the browser walkthrough**, run per phase at desktop and mobile widths: elevation shadows present on panel/modal/cards (computed box-shadow), accent renders Flame blue and body renders Vazirmatn (computed-style probes), drawer opens from the start edge in RTL, Escape/outside-click dismiss every overlay, full search walkthrough including the recently fixed behaviors (panel reopen on click-while-focused, same-listing re-run, recents recorded on submit), OTP round-trip through checkout, add-to-cart badge increment.
- Prior art: the header-search spec's browser walkthrough procedure (desktop 1440 / mobile 390, CDP-assisted clicks where React focus quirks interfere) and the purchase flow as the auth regression net.
- **No new seams** (user-confirmed): no component-test harness, no computed-style assertion suite — the walkthrough is the net for this effort.

## Out of Scope

- Admin panel migration — later pass on the same foundation.
- Dark mode — the storefront is light-only.
- The retired legacy app.
- Any behavior change: search logic, cart/checkout logic, OTP backend, recents semantics — this is a visual/stack migration.
- Replacing brand-domain components (price, credit mark, color dots, gallery, accents) with library equivalents — HeroUI doesn't provide them and they carry the Showcase identity.
- New animation systems — existing word-level accents stay as the only motion beyond the library's own.

## Further Notes

- Phase 0 starts with a registry gate: the npm registry was flaky in this environment (connection resets); if it's unreachable the migration blocks at install and reports back rather than substituting a different library.
- The four recent header-search behavior fixes (panel reopen on click-while-focused, same-listing refresh, recents recorded on submit, clear action) are the most likely regression victims of the search-surface rebuild — the walkthrough net explicitly covers each.
- The implementation plan with concrete file anchors and exact API shapes lives in the session planning artifact (`heroui-storefront-migration`); this spec is the durable contract.
- Supersession note: the previous design ADR remains on record for its still-valid decisions (token palette, RTL rules, legacy retirement); the new ADR covers only the component stack and the elevation amendment.

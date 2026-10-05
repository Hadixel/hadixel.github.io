# Storefront redesign — open questions for owner review

_Status: implementation in progress. No blocking questions._

## Assumptions used without pausing

1. Scope is the complete public storefront in `apps/store`; the admin panel, database schema, and commerce APIs remain unchanged.
2. The approved **Burner Ignition** concept is adapted to the existing storefront header rather than replacing or duplicating it.
3. Existing Persian product copy and data are preserved. Empty/error states may receive clearer recovery copy.
4. Existing square product photography is displayed with `object-contain`; photography is not stretched or destructively cropped to imitate a lifestyle image.
5. On desktop, product description and **مشخصات فنی** sit beneath the gallery in the start-side column. On mobile, the compact purchase module follows the gallery, followed by details and a sticky mobile purchase bar.
6. Motion is concentrated on the homepage. Operational screens remain restrained, and all animation has reduced-motion/static fallbacks.
7. Existing cart, checkout, OTP, authentication, payment, and order behavior remains intact; the work targets presentation, layout, accessibility, and interface states.

## Questions to review after implementation

- Should the homepage headline remain **«خانه‌ات را روشن کن»**, or should it use another final marketing line?
- Should the dark `modern_kitchen.jpg` photography be used in the editorial banner, or should that slot use a newly supplied wide lifestyle image?
- Should the newsletter success state remain local-only until a newsletter API exists?
- After visual QA, is the homepage ignition scroll length preferable, or should it be shortened further?

## Notes appended during implementation

- No blocking questions were found during implementation.
- The storefront was verified through a fresh local server at desktop and 390px mobile widths, including home, product listing, PDP, cart, checkout, account, orders, blog, and not-found states.
- The PDP now places the gallery in the start-side column, with description/specifications beneath it on desktop; mobile keeps the purchase module before long details and retains a sticky purchase bar.
- **The hero was replaced again (2026-10-01):** a type + authored-geometry hero (`.home-hero`) — no raster imagery at all. A dark ink panel carries the Persian headline, the two CTAs and the brand strip, backed by a blue radial glow and three ember rings drawn as inline SVG strokes that draw themselves in on load. Zero image bytes, no `<Image>`, no cut-outs; on phones the panel shortens to ~75svh so the page below it starts sooner. Verified desktop + 390px in Chrome.
- `next.config.ts` now allows `localhost` and `127.0.0.1` as development origins so local asset/hydration checks are reliable.
- The newsletter confirmation remains explicitly local-only until a newsletter API is connected.

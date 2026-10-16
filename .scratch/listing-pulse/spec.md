---
Status: ready-for-agent
Labels: [ready-for-agent]
---

# listing-pulse — Make the product listings colorful and live

## Problem Statement

On every product listing (`/products`, `/category/*`, `/collection/*`, search
results) a shopper cannot see the state of the view: the result count is buried
in a sentence, active filters are invisible except as a URL, and sort lives
behind an `onchange` away from the grid. The cards and the empty state read
dry — nothing marks value or position — and the one chromatic accent the design
allows is spent on almost nothing, so the page has no life.

## Solution

A **Listing pulse** (see `GLOSSARY.md`) above the grid: a live count, removable
active-filter chips, a quick sort control, and a sideways category chip rail.
Flame blue appears at activation and value moments only (active chip, active
sort, discounted price, empty state) — never as decoration. The result is one
branded, responsive pulse shared by every listing surface, with its state logic
in a pure unit that can be tested without a browser or a database. Vocabulary
is recorded so “colorful” and “live” cannot be reinterpreted later as a second
accent hue or ambient animation.

## User Stories

1. As a shopper, I want to see how many products the current view holds, so I can judge whether to narrow it.
2. As a shopper, I want the active category and search to be visible, so I can tell why these products are here.
3. As a shopper, I want to remove a single filter with one tap, so I do not have to rebuild the URL.
4. As a shopper, I want to change sort from the toolbar, so ordering feels immediate, not distant.
5. As a shopper, I want a horizontal chip rail of top categories, so I can move sideways on any device.
6. As a phone shopper, I want every control reachable in the horizontal rail, so nothing is desktop-only.
7. As a shopper, I want the active chip to be unmistakable, so I know where I am.
8. As a shopper, I want rise-pressed and hover feedback on chips, so controls feel alive.
9. As a shopper, I want the discounted price to lead and to be in the accent, so the saving is the first thing read.
10. As a shopper who finds nothing, I want a branded empty state with a way back, so “no results” reads as a moment, not a dead end.
11. As a keyboard user, I want focus rings on every chip and link, so I can operate the pulse without a mouse.
12. As a reduced-motion user, I want nothing that moves except what I trigger, so the page never animates for its own sake.
13. As a maintainer, I want the pulse state in one pure unit, so it is testable without a browser.
14. As a designer, I want “colorful” pinned to flame blue on activation surfaces, so palette drift cannot recur.

## Implementation Decisions

- Backend / contract: none new. The pulse derives from data already on
  `ProductListing` — `products`, `categories`, `activeSlug`, `query`, `sort`,
  `action` — so no extra gateway call, consistent with the “the count is the
  same `products.length`” decision recorded in `listing-rail.tsx`.
- Modules modified:
  - `catalogue/components/product-listing.tsx` — renderer: count with a flame
    dot, removable active-filter chips, a quick sort segmented control, and a
    quick category chip rail.
  - A new pure `listingPulse` model — computes the chip list, their
    labels/hrefs, the active sort, and the visible count from the inputs above.
    `ProductListing` becomes a thin renderer of that model.
  - `home/components/showcase-card.tsx` — the discounted `Price` leads in
    `flame-700`.
  - `components/empty-state.tsx` — the icon tile is branded (`bg-flame-50`,
    `text-flame-700`).
  - `GLOSSARY.md` (new at repo root) — defines `Flame blue`, `Showcase`,
    `Listing pulse`, `Live` with `_Avoid_` lines.
- Palette rule preserved: no second hue is introduced; flame stays the single
  accent and only at activation/value moments (ADR-0001, `CONTEXT.md:34`). No
  ADR amendment.
- Mobile keeps `MobileCategoryFilter`; the pulse is additive, not a replacement.
- Sorting hrefs preserve `q` and the base action; clearing a category goes to
  `/products`; a sort link omits the param for the default ordering.

## Testing Decisions

- A good test checks external behaviour of the pure model — which chips exist,
  what they link to, which sort is active, what the count reads — and never
  class strings or markup.
- One module is tested: `listingPulse`. Prior art: `checkout/lib/quote-key.test.ts`
  and `storefront`/catalogue page-gateway tests — pure modules plus a stubbed
  gateway, no DOM harness. No new test harness is added; the single seam (Seam A)
  is the highest, cheapest seam.
- Visual regression is not in scope for this spec: the storefront has no
  screenshot golden pipeline. A future DOM smoke test via
  `renderToStaticMarkup(<ProductListing …/>)` is an option, not required.

## Out of Scope

- Product-detail flame budget (buy box, related grid accent).
- Home-page accent rework beyond its existing `.tile-sheen` and deal grid.
- Ambient animations, parallax, or any motion that is not user-triggered.
- A second accent hue, warm metallics, or a palette change (would be an ADR
  amendment, not a side effect of this work).
- A DOM test harness.
- Admin panel presentation.

## Further Notes

Parts of this landed during this session (the toolbar, chips, price accent,
empty state, and the glossary); the spec is recorded as the intended design for
those, and the remaining product-detail and home surfaces stay on the backlog
listed above. A Migrate or follow-up track owns them once the homeowner asks.

---
title: Make the listing surface more colourful and live (Showcase listing v2)
labels: [wayfinder:task, ready-for-agent]
status: closed
assignee:
blocked-by: []
---

## Problem Statement

The /products page (and its category/collection siblings that share `ProductListing`) reads as a dry, static wall: the count and sort controls sit far from the title, the active filter is buried, the cards arrive on one identical stagger with no emphasis on what is on sale, and there is no press feedback on the new controls. The committed brand language (cool monochrome + flame blue as the sole accent) is being spent too conservatively, so the surface feels lifeless rather than "modern."

## Solution

Spend the brand's flame budget harder while staying strictly inside the committed Showcase world: no new hues, no token amendment. Make the catalogue page's state obvious at a glance (plaster hero band holding count, removable filter chips, and inline sort inside a hero band), let discounts carry real color rhythm across the grid (tinted stage, flame-800 price lead, soft-lit badge), and add moment-to-moment motion (press feedback, smooth disclosure, and the existing crossfade/lift). Drive everything off the backend's existing price-cut data and the shared `ProductListing` so all three listing entry points benefit automatically.

## User Stories

### Discovery and state (products / category / collection)

1. As a shopper on any listing entry point, I want to see the live product count at the top, so I grasp the catalogue size without scanning.
2. As a shopper with a search or active category, I want to see that filter as a removable chip, so I know what is constraining the grid and can clear it in one tap.
3. As a shopper, I want to keep sorting continuity when I clear a filter chip, so my preferred ordering survives the change.
4. As a shopper on desktop, I want quick sort controls in the same band as the count, so I never scroll to a distant rail to change order.
5. As a mobile shopper, I want to switch between grid and rail view as before, with the new chips and count remaining visible, so the listing adapts to my screen.
6. As a shopper who prefers lateral browsing, I want a horizontally scrollable row of top category pills above the grid, so I move between categories in one tap without the sidebar.
7. As a shopper on a category already selected, I want the same pill visually marked as active, so I always know where I am.

### Colour as rhythm (discounts)

8. As a shopper skimming the grid, I want discounted cards to read as sale cards — flame-tinted image stage, flame-800 price leading, struck original beside it — so offers stand out from full-price items without sticker labels.
9. As a shopper with a variant selected on a product card, I want the discount pill to stay consistent with the selection's pricing rule (price lead follows the variant price) so the two never disagree.
10. As a shopper, I want the discount pill's `label` rendered verbatim as the gateway produced it (`۲۰٪` or a Toman amount), so the offer is never re-formatted here.
11. As a shopper landing when discounts are inactive, I want the surface to honestly remain monochrome, so state never looks fabricated.
12. As a shopper, I want strike-through/lead pricing to be tabular and aligned per the `text-price` convention.

### Motion & liveliness

13. As a shopper, I want result chips, sort controls and view toggle to give immediate physical feedback on tap (`active:scale`) so the page feels alive, reduced-motion-exempt.
14. As a cart or header interaction on hover, I want card-level ring/border deepening to accompany the existing image crossfade and card-lift, so hover reads as one motion.
15. As a shopper navigating the filter tree, I want the disclosure expand to animate with grid-template-rows, honouring reduced motion, so hierarchy grows rather than pops.
16. As a motion-sensitive shopper, I want every animation to be `prefers-reduced-motion: reduce` compliant so content is never unreachable.

### Brand & accessibility

17. As an Iranian RTL shopper, I want the entire new chrome (chips, toolbar, hover scale, focus rings) to respect RTL and use logical properties/`ms-/me-` utilities.
18. As a keyboard user, I want the chip links, embedded sort, and tree to expose focused-visible flame ring and tab order matching visual order.
19. As a shopper, I want WCAG-equivalent contrast (4.5:1 body, large text floor) on every new surface.

## Implementation Decisions

- **Surface covered:** a single `ProductListing` server component change reaches all three listing entry points (`/products`, `/category/[slug]`, `/collection/[slug]`). No parallel change sites needed.
- **Colour world stays locked:** white canvas, plaster cards, ink text, flame as the only chromatic signal (~3% total); Positioning and contextual commitments in PRODUCT.md remain intact. No new hue introduced; no `CONTEXT.md` "Design tokens" amendment and no ADR required.
- **Discount colour-as-rhythm:** `ShowcaseCard`'s outer element retains its lifted shadow + hover ring; when the gateway's `discount` is non-null the image stage gets a `bg-flame-50` tint, the discounted-price lead reads in flame-800, and the flame pill keeps its shien via the existing `ShinyText` utility (Latin-safe, Persian-join safe). When discount is null, the card ships strictly monochrome — honest state over fabricated colour.
- **Life level:** three of four candidates chosen — (1) plaster hero band under PageHeader holding live count + removable chips + inline segment-less segmented sort; (2) horizontal snap-scroll category chip row (mirror of home's `section-rail`); (3) reduced-motion-safe `active:scale-*` press feedback + staged reveal already present. Background texture/glows + full-width hero band deferred (conflicts with Showcase "wall, not panel" language).
- **Chips:** each chip is a `Link` (not a button-as-button) pointing at a rebuilt URL with the cleared facet removed; sort state is preserved through the URL builder. Base category clears to `/products`.
- **Motion primitives reused:** `AnimatedContent`, `.tile-sheen`, `.card-lift`, ShinyText, `--color-flame-*` only. No new CSS keyframes beyond those shipped, and no new dependency.
- **Realism check of seed:** verified `/products` zero active FlameBadges right now — the tint behaviour is correct but will only display once the gateway returns `discount`; flagged as "data-driven" rather than fabricated.
- **Seam chosen (one seam):** decision-critical logic extracted to a single pure module holding `discountStageClass`, the discounted-price/strikethrough lead pair, and the chip URL builder — testable via vitest without new dependencies (`quote-key.test.ts` is prior art). No `.test.tsx`/RTL seam added, so rendering stays a manual/browser-verified surface (matching the store repo's no-RTL policy).
- **Accessibility/RTL preserved:** all utilities logical (`ms-/me-/ps-/pe-`, no `ml/mr`), focus rings use the shared `focus-visible:outline-2 … flame-700`, tab order = visual order under `dir="rtl"`.

## Testing Decisions

- Only external behavior/contracts are tested, not rendering. The new pure seam module is the single test surface.
- Good tests assert classification of decisions: given a gateway price-cut record, tint class vs "none"; given price/variant state, which price leads and what is struck; given current URL state, what each chip's `href` clears/preserves. No snapshots.
- Prior art: `apps/store/src/checkout/lib/quote-key.test.ts` and `apps/store/src/__tests__/*-gateway.test.ts` (pure, dependency-free vitest). No component tests will be added.
- Browser verification (layout + theme) per the `impeccable` checklist is conducted as a manual pass against the running dev server and recorded in the ticket's Resolution, not in CI.

## Out of Scope

- No new hues or token amendment (Amendment deferred — CONTEXT.md change + ADR would be needed and was declined).
- Admin authoring of marketing discounts — already modeled by `18-discounts-promotions.md`; not re-specified here.
- Background patterns/textures, hero particle flows, the 4th "more color" lane.
- No component-render RTL test infrastructure and no new npm deps.
- No change to API/gateway; everything reads existing discount fields.
- No collection-specific layout distinct from /products — the shared component covers them uniformly (uniformity is intended).

## Further Notes

- The final surface reuses the entire existing motion language, so the "aliveness" added today (A pass) is diffuse across chips, cards, and press feedback rather than one new effect.
- If the team later wants tile-sheen on discounted pills or a staged glow sheen, it is a one-file `showcase-card.tsx` follow-up; tracked as a candidate, not committed here.
- Note — pitfall: seed DB has no active public discount rows at the moment, so the tint behaviour is genuine-but-dormant on `:3100` until discounts are published in admin.

## Resolution

Shipped, in the shared `ProductListing` so all three listing entry points get it:

- **Listing pulse toolbar** — live count with a flame dot, removable category/query chips that preserve the active sort, and an inline sort control. State logic sits in the pure `listingPulse` unit, covered by `listing-pulse.test.ts` (6 tests; the store suite is 9 files / 62 tests, all green).
- **Category chip rail** — horizontal `snap-x` row over the root categories, active root marked in flame; a descendant's root still reads as active.
- **Discount as the card's one flame moment** — `Price` gained `tone="flame"` for the cut-price lead, and the card's image plate washes to `bg-flame-50` while a cut is live. Both are gated on a single `onSale` name so the wash and the lead cannot drift apart. Monochrome when nothing is discounted — no fabricated colour.
- **Live** — press feedback on chips, sort, chips rail and the mobile view toggle, hover ring on the card, plus the existing crossfade, card-lift and tree disclosure.

Deviations from the spec, recorded rather than papered over:

- The plate wash stayed **inside the card** instead of moving into the pure seam. A function returning `bg-flame-50 | bg-canvas` would assert its own input and tell us nothing; the seam stays where the state logic actually is (chips, sorts, roots, hrefs).
- Press feedback uses `motion-reduce:active:scale-100`, not `motion-reduce:transform-none`: Tailwind v4 emits `scale` as its own property, so `transform:none` never cancelled the press. `transition-[…,scale]` carries it instead of snapping.
- The struck original keeps its own small struck type rather than the `text-price` convention; a 600-weight struck price reads heavier than the lead it sits behind.

Review pass found and fixed: the nav link chain repeated verbatim three times (now one `CATEGORY_NAV_LINK` constant), the rail restated the `--store-header-offset` fallback (dropped — it is declared in `:root`), the price comment paraphrased GLOSSARY.md's flame definition as "value" (now quotes the real rule: activation and current state), and the duplicated `available && discount` test on the card.

Verification: `tsc --noEmit` clean for store and ui, `eslint` clean on the touched trees, prettier clean on every touched file, store suite 62/62. No token change, no new hue, no ADR — flame stays the only chromatic signal.

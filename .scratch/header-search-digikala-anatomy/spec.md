# Header Search — Digikala Anatomy

Status: ready-for-agent
Phase: Store

## Problem Statement

The shipped header centers the brand mark and keeps search as a small field (desktop) or icon (mobile), but the owner wants the familiar Digikala anatomy: a prominent search bar that opens a rich suggestion panel, with the logo sitting at the start of the header (right side in RTL). Additionally, the mobile search trigger is currently imported but never rendered, so phones have no search entry at all, and the login modal added in the header overhaul cannot be dismissed with the keyboard.

## Solution

A Digikala-style header in the Showcase design language: the store logo at the start (right edge, RTL), a prominent search field taking the main header width, and account/cart icon controls at the far end. Focusing the search field opens a suggestion panel that shows recent searches (chips), popular products (trending chips with live data), a promo banner («دنبال تخفیف هستی؟» → all products), and — as the user types — live product results (image, name, price). Typing and pressing Enter goes to the full listing; tapping a result goes to its product page. On mobile a search icon opens an overlay card containing the same suggestion panel. Escape and outside-click close every search surface and the auth modal.

## User Stories

1. As a desktop shopper, I want a prominent search bar in the header, so that search is the primary wayfinding action.
2. As a desktop shopper, I want the suggestion panel to show my recent searches, so that I can repeat a past search in one tap.
3. As a desktop shopper, I want popular products suggested before I type, so that I can discover what's current without knowing what to search.
4. As a desktop shopper, I want a discount promo banner inside the search panel, so that deals surface during a moment of intent.
5. As a desktop shopper, I want live product results as I type, so that I can reach a product without a full page load.
6. As a desktop shopper, I want each live result to show image, name, and price, so that I can recognize the right item before clicking.
7. As a desktop shopper, I want Enter in the search field to open the full results listing, so that I can compare beyond the top suggestions.
8. As a desktop shopper, I want the suggestion panel to close on outside click and Escape, so that I can back out without hunting for a close button.
9. As a desktop shopper, I want the logo at the right edge of the header, so that the layout matches the store conventions I know.
10. As a mobile shopper, I want a search icon in the header that opens a search card, so that I can search one-handed.
11. As a mobile shopper, I want the same suggestion panel (recent, popular, banner, live results) in the mobile search card, so that the experience is identical wherever I search.
12. As a mobile shopper, I want the search card to close on Escape and by tapping outside it, so that dismissal is effortless.
13. As a mobile shopper, I want the compact header row back (no separate search row), so that more content fits above the fold.
14. As a keyboard user, I want the search inputs autofocused when their surface opens, so that I can type immediately.
15. As a keyboard user, I want Escape to close the login/signup modal too, so that every overlay exits the same way.
16. As a returning customer, I want my recent searches stored on my device only, so that suggestions are personal without an account lookup.
17. As a Persian-speaking shopper, I want the search UI fully in Persian RTL with Persian-digit prices, so that it reads natively.
18. As the store owner, I want the suggestion panel driven by real catalog data (published products), so that suggestions are never stale hand-typed lists.
19. As the store owner, I want the popular row to come from the same published-products query, so that unlisted/unpublished items never appear.
20. As a shopper mid-checkout, I want search to never interfere with cart or checkout state, so that browsing back into search is risk-free.

## Implementation Decisions

- **Header anatomy**: logo at the row start (right edge in RTL, no absolute centering), search field occupying the main width (420/480px at md/lg), account and cart icon controls at the far end. Showcase tokens unchanged: 52px row, hairline bottom border, plaster field surface, 10px radius, flame blue only on the cart badge and panel CTA.
- **Shared suggestion panel**: one client component renders the panel body — recent searches (chips, from device-local storage, newest 5), popular products (chips with a trend icon, from a `hot=1` search call), the promo banner, and live results (rows with image/name/price, debounced ~280 ms, stale-response guarded). Both the desktop dropdown and the mobile overlay card render this same component.
- **Search endpoint**: the existing public search endpoint gains a `hot=1` mode returning the newest published products (limit 5) for the popular row; typed queries behave as before (results only at query length ≥ 2, short/missing queries return an empty set with HTTP 200). No new search logic — the panel reuses the published-products listing query, which already filters to published status.
- **Recent searches**: stored under a single localStorage key, capped at 5, deduplicated, written when a search is submitted or a result is tapped. Device-local; no backend.
- **Mobile entry**: the search icon trigger (mobile-only) opens an overlay card with an autofocused input and the shared panel; the card closes on Escape, backdrop tap, and navigation. The mobile trigger must actually be rendered in the header actions group — the in-tree partial left it imported but unused, which is the gap this spec closes.
- **Auth modal keyboard exit**: the login/signup modal gains an Escape keydown listener mirroring the search modal's, so all overlays share one dismissal contract.
- **Error/edge handling**: network failure in the panel shows a "no results" state rather than an error; short queries show the idle (recent/hot/banner) panel.

## Testing Decisions

- Tests assert external behavior only — endpoint JSON and rendered DOM — never component internals.
- **Automatable seam (unchanged from the approved header spec): the search endpoint.** A typed query with a known term returns that product's slug; nonsense returns an empty list with HTTP 200; short/missing queries return an empty list; `hot=1` returns exactly 5 published products.
- **Browser walkthrough** at 1440px and 390px: logo measured at the row start; desktop field opens the panel on focus with hot chips and the banner; typing «فر» yields 5 live rows navigable to a PDP; mobile icon opens the card with the same panel; Escape closes the panel, the mobile card, and the auth modal.
- **Regression net**: checkout, cart, and the OTP backend are untouched, so the existing purchase E2E remains the regression net for auth.

## Out of Scope

- Fuzzy/typo-tolerant ranking or server-side suggestion caching — reuse of the existing containment search only.
- Backend-stored recent searches or per-user personalization — device-local storage only.
- Password/email accounts — phone OTP remains the only identity flow (unchanged from the header spec).
- CMS-manageable promo banner — the banner is a static link to all products until the owner requests otherwise.

## Further Notes

- The working tree already contains a verified partial implementation of this spec (desktop panel live-verified: hot chips render, banner renders, «فر» returns 5 rows). Implementation = finish per the referenced plan: render the missing mobile trigger, add the auth-modal Escape listener, remove the now-dead inline search icon, verify, commit.
- The logo asset remains the owner-supplied circular mark exported earlier; only its position changes (start instead of center).

# Header, Account & Search Overhaul

Status: ready-for-agent
Phase: Store

## Problem Statement

The storefront header works against shoppers instead of for them. On mobile there is no way to search at all (the search field simply doesn't exist on small screens). The store's brand mark is missing — the header shows plain text instead of the owner's logo, and that text sits slightly off-center because the header row is asymmetric. Desktop carries dead weight: a «فروشگاه» pill that duplicates the category row, and a menu button on wide screens that does nothing when clicked. Account access is invisible — a returning customer cannot log in from the header, and the /account page (logged out) offers only an inline form with no discoverable "login or sign up" moment. Cart and account are text links where every familiar store header uses icons.

## Solution

A cleaned, centered, icon-driven header in the existing Showcase design language. The owner's logo (circular «modern home / خانه مدرن» house mark) sits dead-center and links home. The shop pill and the dead desktop menu button are gone. Cart and profile become stroke-style SVG icons consistent with the existing search icon; the cart keeps its flame-blue count badge. On mobile, a search icon opens a card/modal with live results (debounced, tapping a result navigates, Enter opens the full listing). On desktop the inline search input stays as-is. The profile icon opens a login/signup modal (phone + OTP, reusing the existing verification backend unchanged — one flow both registers new customers and logs in returning ones); when already logged in, the icon links straight to the account. The /account page (logged out) opens the same modal from a page-level CTA.

## User Stories

1. As a mobile shopper, I want a search icon in the header that opens a search card, so that I can search without leaving my current page.
2. As a mobile shopper, I want live results as I type, so that I can find a product without waiting for a full page load.
3. As a mobile shopper, I want to tap a result and land on its product page, so that I can buy without extra navigation.
4. As a mobile shopper, I want to press Enter in the search card to see all matches on the listing page, so that I can compare beyond the top few results.
5. As a mobile shopper, I want the search card to close when I tap outside it, so that I can return to browsing instantly.
6. As a mobile shopper, I want a clear message when my search has no matches, so that I know the search worked but found nothing.
7. As a mobile shopper, I want the header to stay one compact row (no separate search row), so that more product content fits above the fold.
8. As a first-time visitor, I want the store logo centered at the top of every page, so that I immediately know which store I'm in.
9. As a first-time visitor, I want a recognizable profile icon in the header, so that I can discover that accounts exist.
10. As a first-time visitor, I want the profile icon to open a login/signup modal, so that I can create an account without hunting for a login page.
11. As a first-time visitor, I want the modal to explain that one phone number both signs me up and logs me in, so that I'm not confused by the absence of separate buttons.
12. As a returning customer, I want to log in with my phone + verification code from any page via the header icon, so that I don't need to start a checkout just to authenticate.
13. As a returning customer, I want the profile icon to take me to my account when already logged in, so that I can reach my orders in one click.
14. As a returning customer, I want the login verification to be the same code-entry flow I saw at checkout, so that I only ever learn one pattern.
15. As a desktop shopper, I want the search input inline in the header, so that I can search without opening a modal.
16. As a desktop shopper, I want a header without a redundant «فروشگاه» pill, so that navigation is less cluttered — the category row below it already covers shopping entry.
17. As a desktop shopper, I want no menu button on wide screens, so that I never click something that does nothing.
18. As a keyboard user, I want the search modal's input focused automatically on open, so that I can type immediately.
19. As a keyboard user, I want Escape to close the search and login modals, so that I can back out without the mouse.
20. As a screen-reader user, I want every icon-only header control to carry a Persian accessible label, so that I know what each icon does.
21. As a screen-reader user, I want the logo image to carry the store name as its alt text, so that the brand is announced.
22. As a shopper on a slow connection, I want search requests debounced while I type, so that the network isn't flooded and results stay stable.
23. As a shopper, I want the cart icon to show a live count badge, so that I can trust items were actually added.
24. As a shopper, I want the cart control to be a recognizable cart icon, so that I find it at a glance without reading labels.
25. As a shopper mid-checkout, I want header login to use the same verification machinery as checkout, so that my session carries over and I'm never verified twice.
26. As a shopper, I want search results to show each product's image, name, and price, so that I can recognize the right item before clicking.
27. As a Persian-speaking shopper, I want all new header/modal copy in natural Persian with RTL layout, so that the experience stays coherent.
28. As the store owner, I want the header to display my supplied logo, so that the storefront matches my brand materials.
29. As the store owner, I want the login modal to reuse the existing verification backend, so that no new account system needs maintenance.
30. As the store owner, I want search to surface only published, purchasable products, so that customers never tap into something they can't buy.

## Implementation Decisions

- **Brand mark**: the owner-supplied circular logo replaces the text wordmark entirely (the art already contains the name). The header row centers it with absolute centering so it stays visually centered regardless of how wide the flanking control groups are — flex-only centering is what makes it drift today. The logo links to the home page and its alt text comes from the store-name setting.
- **Header cleanup**: the «فروشگاه» pill and the desktop-only grid menu button (which has no click handler — it is dead UI) are deleted outright. The mobile drawer trigger remains the only menu control and stays mobile-only.
- **Icon set**: cart and profile become inline stroke SVG icon components matching the existing search/grid icon style (1.5 stroke, currentColor). Cart keeps the flame-blue pill count badge overlaid on the icon and still links to the cart page. Both controls are icon-only on all screen sizes.
- **Auth state at header level**: the header server component resolves the customer session once and passes it down. Logged in → profile icon renders as a link to /account. Logged out → a small client island renders the same icon as a button that opens the shared auth modal.
- **Auth modal**: one shared client component used by both the header and /account. Two steps: phone entry (validated to the Iranian mobile pattern, 11 digits starting 09) then the existing OTP verification component rendered inside it. Copy is framed as a unified «ورود / ثبت‌نام» because the backend auto-registers a customer on first successful verification — there is deliberately no separate signup data flow. Successful verification closes the modal and refreshes server state so the header immediately flips to the logged-in link. Rate limiting, devCode display, resend cooldown: all inherited from the existing OTP component, unchanged.
- **/account logged-out view**: replaces its current inline form with the same shared modal behind a page-level «ورود / ثبت‌نام» CTA; the logged-in account view is untouched.
- **Search endpoint (the one new seam)**: a new public JSON endpoint wrapping the existing published-products query with a search term and a small limit (≈6). Returns slug, name, price, optional max price, and image per result. Missing or very short queries return an empty result set rather than an error. No new query logic, no auth.
- **Mobile search modal**: a search icon (mobile only) opens an overlay card — plaster surface, 10px radius, hairline border — with an autofocused input. Typing debounces (~250–300 ms) into the search endpoint; results render as tappable rows (image, name, price). Enter navigates to the full listing page with the query string. Backdrop click and Escape close it. Loading and no-results states are explicit.
- **Desktop search**: unchanged — the existing inline input form and its GET-to-listing behavior stay exactly as they are.
- **Design language**: 10px card radius, hairline borders, plaster/canvas surfaces, flame blue reserved for the cart count badge and the modal's primary CTA; overlay cards follow the existing modal anatomy (scrim + shadow is established for overlays). All new strings in Persian, RTL throughout.

## Testing Decisions

- Tests assert external behavior only — endpoint JSON and rendered DOM — never component internals.
- **New automatable seam — the search endpoint** (curl against a running dev server): a query containing a known product term (e.g. «فر») returns that product's slug among the results; a nonsense term returns an empty list with HTTP 200; a missing/one-character query returns an empty list without hitting the database search path. This is the only new machine-checkable seam; everything else is browser-verified.
- **Browser behavioral walkthrough** (prior art: the repo's established headless-browser verification workflow) at desktop 1440px and mobile 390px: logo visually centered and linking home; shop pill absent; desktop grid button absent; cart/profile render as SVG icons; mobile search icon opens the modal and typed input yields live results that navigate; profile icon opens the auth modal; the OTP devCode round-trip logs in, closes the modal, and flips the header to the logged-in link; cart badge increments after add-to-cart; Escape closes both modals.
- **Regression net**: the OTP backend and checkout flow are untouched, so the existing checkout OTP end-to-end behavior doubles as the regression check for the auth modal. The desktop inline search form is untouched, so the existing search journey is unchanged by construction.

## Out of Scope

- Live-search modal on desktop (desktop keeps the inline input by explicit decision).
- Password or email accounts, or any separate signup data model — phone OTP remains the only identity flow.
- Any change to the verification backend, cart, checkout, or product page.
- Fuzzy/typo-tolerant search ranking — the endpoint reuses the existing containment search.
- CMS-managed logo — the logo is a static asset; swapping it later is a file replacement, not a feature.

## Further Notes

- **Logo asset**: the art is the owner-supplied circular «modern home / خانه مدرن» mark (black on white, 1024×1024). The binary must be exported from this conversation's attachment into the storefront's public icons directory (suggested name `logo.png`) before implementation starts; if the file is missing at execution time, block and ask the owner to drop it in rather than substituting a placeholder. Displayed at roughly 40px height inside the 52px header row.
- The store-name setting stays in metadata and the footer; only the header wordmark is replaced (the logo art already carries the name, so keeping both would duplicate it).
- The search modal replaces the mobile inline search row added earlier this cycle — that row is removed as part of the clean cutover, so mobile has exactly one search entry point.

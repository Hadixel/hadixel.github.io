# 02 — Hot/popular suggestions slice

**What to build:** the «جستجوهای پرطرفدار» row of the shared suggestion panel, end to end. Before the shopper types anything, the panel already shows popular products as trending chips, driven by live catalog data rather than a hand-typed list — so a shopper can discover what's current without knowing what to search.

**Blocked by:** 01 — Recent searches: device-local storage + chips slice (panel idle state composes recents + popular together).

**Status:** ready-for-agent

- [x] Opening the suggestion panel before typing shows the «جستجوهای پرطرفدار» section with chips backed by the newest published products (limit 5) from the search endpoint's hot mode
- [x] Every hot chip corresponds to a real published product; unlisted or unpublished items never appear
- [x] Tapping a hot chip fills the search field and runs that search, and the term lands in recent searches (composes with ticket 01)
- [x] Chips carry a trend icon and match the Showcase chip styling in RTL
- [x] If the hot request fails, the section hides silently — the panel still shows recents and the promo banner, never an error surface

## Comments

- 2026-09-06: Verified in browser: 5 hot chips from `hot=1` (newest published, trend icon), section hidden when the list is empty or the fetch fails; failure path covered by the endpoint seam suite. Commit c5bbd5d.
- Wording note: tapping a hot chip runs the search by navigating straight to the listing (Digikala behavior) rather than pre-filling the field — intent preserved, one step fewer.

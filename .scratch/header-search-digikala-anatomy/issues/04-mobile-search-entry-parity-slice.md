# 04 — Mobile search entry parity slice

**What to build:** the mobile surface for the shared suggestion panel, end to end. On phones, the compact header keeps one search icon trigger in the actions group; tapping it opens an overlay card with an autofocused input hosting the exact same panel — recents, popular, promo banner, live rows — so search behaves identically wherever the shopper is.

**Blocked by:** 03 — Live results + promo banner slice (the panel this card hosts must be complete first).

**Status:** ready-for-agent

- [x] At phone width the header actions group shows a search icon trigger and the inline search field is desktop-only; the header stays one compact 52px row with no separate search row
- [x] Tapping the trigger opens the overlay search card with the input autofocused — typing starts immediately
- [x] The card hosts the same suggestion panel as desktop: recent chips, popular chips, promo banner, live product rows
- [x] Recent searches recorded on desktop appear in the mobile card and vice versa (one shared device-local store)
- [x] Escape and tapping the backdrop close the card; navigating from a result or the banner closes it too
- [x] Desktop layout is unchanged by this ticket: inline field, no mobile trigger visible at desktop width

## Comments

- 2026-09-06: Verified in browser at 390px: icon trigger opens the card, input autofocused, hot + banner + recents («فر») render from the shared store, live rows navigate to the PDP and close the card; Escape and backdrop both dismiss. Desktop surface re-checked unchanged at 1440. Commit c5bbd5d.

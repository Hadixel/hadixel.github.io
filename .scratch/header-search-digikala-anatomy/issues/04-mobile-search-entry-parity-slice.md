# 04 — Mobile search entry parity slice

**What to build:** the mobile surface for the shared suggestion panel, end to end. On phones, the compact header keeps one search icon trigger in the actions group; tapping it opens an overlay card with an autofocused input hosting the exact same panel — recents, popular, promo banner, live rows — so search behaves identically wherever the shopper is.

**Blocked by:** 03 — Live results + promo banner slice (the panel this card hosts must be complete first).

**Status:** ready-for-agent

- [ ] At phone width the header actions group shows a search icon trigger and the inline search field is desktop-only; the header stays one compact 52px row with no separate search row
- [ ] Tapping the trigger opens the overlay search card with the input autofocused — typing starts immediately
- [ ] The card hosts the same suggestion panel as desktop: recent chips, popular chips, promo banner, live product rows
- [ ] Recent searches recorded on desktop appear in the mobile card and vice versa (one shared device-local store)
- [ ] Escape and tapping the backdrop close the card; navigating from a result or the banner closes it too
- [ ] Desktop layout is unchanged by this ticket: inline field, no mobile trigger visible at desktop width

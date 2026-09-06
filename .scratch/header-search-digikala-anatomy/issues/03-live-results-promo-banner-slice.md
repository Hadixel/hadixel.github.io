# 03 — Live results + promo banner slice

**What to build:** the typing experience of the shared suggestion panel, end to end. As the shopper types, the panel swaps to live product rows — image, name, price — each navigable to its product page; pressing Enter goes to the full listing. The «دنبال تخفیف هستی؟» promo banner rides along in the panel, surfacing deals at the moment of search intent.

**Blocked by:** 01 — Recent searches: device-local storage + chips slice; 02 — Hot/popular suggestions slice (live results replace the idle state those tickets build).

**Status:** ready-for-agent

- [ ] Typing a query of 2+ characters shows live product rows with image, name, and Persian-digit price; tapping a row navigates to that product's page
- [ ] Results are debounced (≈280 ms) and stale-response guarded — fast typing never renders an older query's rows
- [ ] Queries shorter than 2 characters show the idle panel (recents, popular, banner), never partial or empty-looking rows
- [ ] Pressing Enter navigates to the full results listing for the query, and the term is recorded as a recent search
- [ ] The «دنبال تخفیف هستی؟» banner is present in the panel and links to the all-products listing
- [ ] A network failure while typing shows the no-results state — never an error message
- [ ] The panel closes on Escape and on outside click

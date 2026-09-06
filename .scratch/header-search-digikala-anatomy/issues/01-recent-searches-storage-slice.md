# 01 — Recent searches: device-local storage + chips slice

**What to build:** the recent-searches seam of the shared suggestion panel, end to end. A shopper who searches a term (by submitting the field or tapping a live result) finds that term waiting as a tappable chip the next time they open the panel — on any surface that hosts the panel. Recents are device-local: nothing leaves the browser.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Focusing the header search field opens the suggestion panel showing up to 5 recent searches as tappable chips, newest first
- [ ] Submitting a query or tapping a live result adds that term to recents; a repeat search moves the term to the front instead of duplicating it
- [ ] Recents are capped at 5 — the oldest falls off
- [ ] The panel's «پاک کردن» action clears all recents and the panel falls back to the idle (popular + promo) state
- [ ] Recents survive a page reload and persist on the device only (no network write, no account lookup)
- [ ] With no recents stored, the recent-searches section renders nothing at all

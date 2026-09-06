# 01 — Recent searches: device-local storage + chips slice

**What to build:** the recent-searches seam of the shared suggestion panel, end to end. A shopper who searches a term (by submitting the field or tapping a live result) finds that term waiting as a tappable chip the next time they open the panel — on any surface that hosts the panel. Recents are device-local: nothing leaves the browser.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] Focusing the header search field opens the suggestion panel showing up to 5 recent searches as tappable chips, newest first
- [x] Submitting a query or tapping a live result adds that term to recents; a repeat search moves the term to the front instead of duplicating it
- [x] Recents are capped at 5 — the oldest falls off
- [x] The panel's «پاک کردن» action clears all recents and the panel falls back to the idle (popular + promo) state
- [x] Recents survive a page reload and persist on the device only (no network write, no account lookup)
- [x] With no recents stored, the recent-searches section renders nothing at all

## Comments

- 2026-09-06: Verified in browser (desktop 1440 + mobile 390): chip recorded on submit and on result tap, survives reload, renders on both surfaces from one localStorage key; «پاک کردن» empties storage and the panel falls back to popular + banner. Idle-panel fallback on short queries exercised via the endpoint seam suite. Commit c5bbd5d.

# 05 — Homepage rebuild

Type: task
Status: resolved
Phase: Store

Rebuild `/` in Showcase language (spec task 5). Block-renderer blocks restyled in place; React Bits accents live here.

## Acceptance

- [ ] Announcement strip: ink surface, ash text, flame-blue spark on one phrase only.
- [ ] Sticky nav: grid icon / shop pill (hairline, active = flame blue) / wordmark / search / account / cart — 48-56px, hairline bottom border.
- [ ] Hero: full-bleed image, bottom-third overlay stack (badge → display headline → subhead) + floating buy-card (white, 14.4px radius, flame-blue CTA), RTL-mirrored to bottom-right.
- [ ] Category tiles as plinth cards; ranked پرفروش‌ترین row with giant translucent Persian numeral watermarks (۱ ۲ ۳ ۴).
- [ ] Trust bar: ink full-bleed, logos/mark text at 60% opacity.
- [ ] ≥1 React Bits accent (word-level reveal on hero headline); no per-char splitting.
- [ ] Flame blue ≤3% of viewport; no shadows on any card; radii 10/30 only.
- [ ] Mobile 390px pass; desktop 1440 rail pass.

## Comments

2026-09-05 (audit): Verified in browser at 1440 and 390. Announcement strip, sticky single-row nav with working search, full-bleed hero + floating buy-card, plinth category tiles, ranked row with numeral watermarks, ink trust bar, FadeWords hero reveal. Flame accent within budget; no card shadows. Screenshots in .scratch/ui-rebuild/screenshots/.

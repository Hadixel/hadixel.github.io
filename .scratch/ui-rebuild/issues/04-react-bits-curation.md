# 04 — React Bits curation (RTL/Persian adaptations)

Type: task
Status: resolved
Phase: Foundation

Pick and adapt 4–6 React Bits effects for marketing surfaces only.

## Acceptance

- [ ] Shortlist documented in `packages/ui/src/accents/README.md` with: effect, surface, why safe for Persian.
- [ ] All text effects are word/line-level — zero character-splitting on Persian strings (Latin-only strings may split; e.g. model codes).
- [ ] Persian digit counters (stats) use Vazirmatn tabular figures.
- [ ] GSAP/Framer Motion deps are added to `apps/store` only (marketing routes); nothing animation-heavy imports into PDP/checkout routes.
- [ ] Each effect exported from `@kmodern/ui/accents` with usage notes and a reduced-motion fallback.

## Comments

2026-09-05 (audit): FadeWords/SlideWords/RiseBlock/Counter shipped, word-level only, RTL/Persian-safe (space-split, letter-joining preserved). ARIA fixed this session: sr-only text replaces the prohibited roleless aria-label pattern. No per-char splitting anywhere.

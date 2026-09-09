# ADR-0001: Showcase Design Language & UI Component Strategy

## Status

Accepted (2026-09-04, pre-launch)

## Context

The workspace grew from a pre-built codebase and carries three divergent UI surfaces — `apps/store`, `apps/admin`, and `apps/legacy-store` — with **no shared component library** (`packages/ui` contained only a `cn()` helper). Store and admin each hand-roll their own components; the legacy Vite SPA duplicates the storefront with a third look. The result is visual inconsistency everywhere and triple maintenance.

The brand positions itself as a premium boutique (Showcase / نمای ویژه), not a bargain retailer: product qualities must be *shown*, not labeled with retail badges. The site is not yet published, so wholesale visual rework is possible without shippability constraints.

Hard constraints shaped the choice:

- **Persian RTL throughout.** Joining script breaks under negative letter-spacing; no lowercase conceits exist; text-splitting animations must operate on words/lines, never characters.
- **Appliance photography** (steel/glass/black renders on plain backgrounds) is the dominant visual.
- **Tailwind v4** is already the styling engine in both Next.js apps.

Rejected alternatives: MUI and Ant Design (bring their own styling engines and design languages — adopting them means fighting them everywhere, and their look is the opposite of one-of-a-kind); keeping hand-rolled components (the status quo that produced the mess); a big-bang rewrite including data/logic (the flows — cart, checkout, OTP, admin actions — are verified and stay).

## Decision

**One design language — Showcase — implemented once, consumed by both Next apps:**

1. **Zellerfeld-derived monochrome skeleton** (per styles.refero.design Zellerfeld reference): white canvas, plaster `#ecedee` card surfaces stepping above the canvas, ink `#111111` text, hairline borders, 10px radius (30px pills only for badges), no drop shadows on cards — separation by surface stepping.
2. **Flame blue as the single chromatic accent** (`#1d4ed8`, pale sibling `#dbeafe`): product-native (a working gas flame), reserved for activation moments — status badges, active navigation, primary CTA, current-state indicators — no more than ~3% of any screen. All warm metallics (copper/gold) are retired: they read traditional, not modern-kitchen.
3. **Vazirmatn sculpted by weight, not tracking**: 400 body → 800/900 display. No negative letter-spacing anywhere Persian renders. Latin technical strings (model codes, SKUs) may use a monospace; Persian-digit prices use Vazirmatn 600 with `tabular-nums`.
4. **Color dots as the variation treatment**: interactive swatches per Color on Product Cards; tapping live-swaps the card's imagery to that Variant. Variation is shown, never counted in a badge.
5. **Component stack**: shadcn/ui + Radix primitives as the functional base, copied into `packages/ui` and themed to the language; both apps consume them. React Bits components appear only as curated animation accents on marketing surfaces (homepage, category banners, hero) — word-level animation only, no character-splitting on Persian; GSAP/Framer Motion ship only on those surfaces.

Clarification (2026-09-04): the 10/30px radius rule governs *containers* — cards, buttons, inputs, images, panels. Sub-element glyphs inside controls (a 16px checkbox box, a switch thumb) are exempt; forcing 10px onto a 16px glyph produces a circle.

Clarification (2026-09-04): "30px only for badges" means *status badges and swatch dots*. CTA buttons are containers — always 10px.
6. **Zellerfeld component anatomy as the pattern library**: plinth product cards with داتیس credit mark, giant translucent Persian-numeral ranked cards, floating hero buy-card, announcement strip, press-style trust bar.
7. **Legacy-store is retired**; `apps/store` is the single Storefront (see `CONTEXT.md`). Anything worth keeping ports over before deletion.

## Consequences

- One Tailwind v4 preset in `packages/ui` becomes the single source of tokens — the currently duplicated palettes in the two apps' `globals.css` collapse into it.
- `packages/ui` becomes a real library: store and admin stop hand-rolling primitives; fixes land once.
- Bundle discipline: animation dependencies are confined to marketing routes; PDP/checkout stay lean.
- The legacy Vite app and its dependencies leave the workspace — one less build, one less surface to keep consistent.
- Rules that reviewers should enforce: no shadows on cards, no radius outside 10px/30px, no chromatic color except Flame blue, no per-character text animation, RTL mirrored layouts (metadata anchors right).
- Reopening triggers: if Flame blue ever fails contrast or brand-recognition testing, the accent swaps but the single-spark doctrine does not.

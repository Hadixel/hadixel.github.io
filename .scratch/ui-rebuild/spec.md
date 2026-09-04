# UI Rebuild — Showcase Design Language

Rebuild the presentation layer of `apps/store` and `apps/admin` in the Showcase design language (ADR-0001). All routes, data flows, and business logic are preserved. Pre-launch: layouts may be reworked wholesale, but behavior must keep passing its existing checks (cart/checkout/OTP E2E, admin save/redirect flows).

## Goals

- One shared component library (`packages/ui`) themed to the language, consumed by both apps.
- Zero visual inconsistency between pages: every surface derives from the same tokens.
- A distinctly premium, one-of-a-kind Persian retail experience — not a generic e-commerce skin.

## Non-goals

- No changes to routes, Prisma schema, server actions, cart/checkout/OTP logic.
- No new content or features; presentation only.
- Legacy-store migration of content (only salvage-if-trivial; the app is deleted).

## Constraints (from ADR-0001 — reviewers enforce these)

- Palette: white canvas / plaster `#ecedee` cards / ink `#111111`; Flame blue `#1d4ed8` (+ `#dbeafe`) is the ONLY chromatic color, ≤3% of any screen, activation moments only.
- Radius: 10px everywhere; 30px only for pill badges. No drop shadows on cards.
- Typography: Vazirmatn 400→900 by role; NO negative tracking on Persian; prices in Persian digits, Vazirmatn 600 `tabular-nums`; mono only for Latin model codes/SKUs.
- Animation: React Bits only on marketing surfaces; word/line-level only — never per-character on Persian.
- RTL: metadata anchors right; carousels/steppers mirrored.

## Phases

### Phase 1 — Foundation
1. **Tailwind preset + tokens** — `packages/ui/tailwind.preset.css` (or equivalent `@theme` import): plaster/ink/flame-blue palette, type scale, radii; both apps' `globals.css` reduce to importing it. Verify: duplicated palette blocks deleted from both apps; hex #b45309 absent from workspace.
2. **shadcn/ui into packages/ui** — init, theme to tokens (CSS variables), add primitives: button, input, label, select, dialog, sheet, dropdown, tabs, toast, badge, table, card, skeleton, tooltip. Both apps alias `@kmodern/ui`. Verify: build passes consuming primitives from both apps.
3. **Shared utility components** — price display (Persian digits, tabular), badge set (Plaster/Flame-blue system), Color dots (interactive swatch + live image swap — the signature), section header, see-all control.
4. **React Bits curation** — pick 4–6 effects (word-level reveals, counters); adapt for RTL/Persian; document each as a `packages/ui` export with usage notes.

### Phase 2 — Store (page by page, logic untouched)
5. **Homepage** — announcement strip (flame-blue accent), sticky nav (grid icon / shop pill / wordmark / search / account / cart), full-bleed hero with floating buy-card (flame-blue CTA), plinth category tiles, ranked "پرفروش‌ترین" row with giant Persian numerals (۱ ۲ ۳ …), trust bar in ink. React Bits accents live here.
6. **Category & products listing** — plinth card grid (4/2/1 collapse), Color dots on every card, hover crossfade to alternate variant image, metadata anchored bottom-right, no shadows.
7. **PDP** — gallery keeps tabs (10px), buy-card floats on desktop; variant picker = Color dots; specs table → hairline-divided list; Persian numerals for capacity/power; flame blue only on CTA + active states.
8. **Cart & checkout** — plaster line-item surfaces, stepped sections with numeral markers (۱ ۲ ۳), flame-blue primary button, everything mirrored RTL. Verify: full purchase E2E still passes (COD cap rejection + card-to-card order + OTP devCode).
9. **Order status, account, blog, static pages** — same language; footer rebuilt (ink surface, hairline columns, دیتیس credit).

### Phase 3 — Admin
10. **Shell** — sidebar/topbar in monochrome + flame-blue active states; login screen redesigned (gallery-minimal, centered card).
11. **Data tables** — shared Table primitive; badges from the token set; forms from shared inputs; dialogs/sheets from primitives.
12. **Media & page builder** — picker modal, builder cards restyled; no new functionality.

### Phase 4 — Cleanup
13. **Retire legacy-store** — port anything trivially worth keeping; delete `apps/legacy-store`, drop it from `pnpm-workspace.yaml` and turbo pipeline; prune dead deps (react-router-dom, react-toastify, vite).
14. **Final audit** — grep-enforce: no `#b45309`/copper refs, no `shadow-*` on cards, no `rounded-full` outside badges, no per-char animation imports outside marketing routes; Lighthouse pass on mobile; full typecheck + builds green.

## Acceptance

- Every store/admin page derives its surface, text, radius, and accent from the shared preset — grep shows no app-local token definitions.
- Product Cards show Color dots with live image swap; no "4 رنگ" count badges anywhere.
- Persian renders: no broken letter-joining, no negative tracking, weight hierarchy visible side-by-side.
- Full purchase flow E2E passes post-rebuild; admin product-save and manual-order flows pass.
- `apps/legacy-store` deleted; workspace builds green; typecheck green.

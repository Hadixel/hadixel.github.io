# 22: One token layer, one component kit

**What to build:** the two clients stop carrying two design systems that do not know about each other. The semantic layer moves out of the storefront's route stylesheet into the shared one, so a class the storefront uses also works in the panel — today a store class copied into the panel would compile to nothing, silently. The four theme shades that are used but never defined start working. The panel's hand-rolled component kit is retired in favour of the shared primitives, and the repeated utility chains that were measured earn composed classes.

**Blocked by:** 21.

**Status:** done

- [x] The semantic token mapping and the composed classes live in the shared layer, and both clients can use them
- [x] The four accent shades that are referenced but undefined exist, so the classes that reference them stop being no-ops — this currently makes a payment page heading render in the inherited colour
- [x] The panel's local component kit is retired: the shared package already ships the nine named components it duplicates, plus the whole table family
- [x] The panel uses the real class-merge helper rather than one that only concatenates, so conflicting utilities resolve by intent instead of by stylesheet order
- [x] The three repeated recipes measured across the codebase become composed classes: the notice recipe, the form-control recipe and the two-column field grid
- [x] The composed price class stops being bypassed by the utilities it replaces — **partly, deliberately.** Only the two `font-semibold tabular-nums text-ink` sites were converted, because they are the exact weight match for `text-price` (600). The other ~21 `tabular-nums` chains carry weights of 400, 700 or 800 and are quantities, page numbers and SKUs as often as prices; forcing them onto one weight would flatten a hierarchy that is doing work. `text-price` itself is untouched at 600, since `<Price>` emits it and its only two call sites pass no weight of their own. This checkbox closes for the exact-match sites and records the rest as a deliberate retention rather than claiming the bypass is gone.
- [x] The repeated arbitrary values become tokens, or are recorded as a deliberate exception
- [x] The colour-literal metric reaches zero, and the panel's product colour-palette data is not counted as a violation because the metric's scope says what it counts

## What landed

**The semantic layer.** The 22 HeroUI variable roles and `.card-lift` moved out of the deleted `apps/store/src/app/showcase-theme.css` into `packages/ui/tailwind.css`, which both clients already import, so the panel now gets the same variable space the storefront renders against. What stayed in the storefront's `globals.css` is what is genuinely storefront-only: the base chrome, the `--store-header-offset` variable and the `.flame3d*`/`.product-*` classes bound to that app's own DOM. Import order holds — the shared file is imported after `@heroui/styles`, which is what the bridge's `!important`-free overrides need.

**The ramp is complete.** `flame` now runs 50/100/200/300/400/500/600/700/800/900/950 with no holes, and every step the codebase references is defined. Four were referenced and undefined before (`300`, `500`, `900`, `950` — the payment-page heading, `bg-flame-500` and `ring-flame-300` among them, all compiling to nothing). A fifth, `400`, was added because the homepage hero's gradient painted a literal `#60a5fa` that is exactly that step.

**Composed recipes.** Nine `@utility` classes earned by the census, one per variant rather than parameterised: `notice-error`, `notice-error-strong`, `notice-success`, `notice-success-strong`, `notice-warning`, `form-control`, `form-control-compact`, `form-control-link`, `form-grid`. Each reproduces the recipe it replaces, verified against the clients' own Tailwind output including hover and focus behaviour.

**One kit.** `apps/admin/src/components/ui.tsx` is deleted outright — not re-exported, because a barrel would be a second specifier for the same symbols. 33 files repointed to `@kmodern/ui`: Button at 56 sites, Input ~60, Card ~52, CardHeader ~47, Badge ~48, the Table family ~196 cells, Checkbox ~23, Textarea ~21. Five admin-only exports survive in `components/panel-ui.tsx`: `Field`, `Pagination`, `EmptyState`, `Spinner`, and **`Select`** — a fifth the brief did not predict, because the shared `Select` is a Radix popover that cannot render `<option>` children (≈45 panel sites do), carries no native `name`/`defaultValue` form participation (the list pages are server components filtering by `<form action>`), and would force `"use client"` onto those pages.

**`cn` merges.** Zero concatenating helpers remain in the panel. This is what makes the kit swap survivable: `className` can now override a component's defaults instead of appending to them.

**Tokens for repeated arbitrary values.** `rounded-[30px]` → `rounded-pill` (23 storefront sites, 8 panel, 5 in the shared package) and `text-[11px]` → `text-micro` (11 storefront, 9 panel). `text-[10px]` ×2 in `scraper-panel.tsx` is recorded as an exception rather than given a token for two call sites. `packages/ui/src/cn.ts` was extended to teach the merger the two new scales — without it `rounded-pill` never conflicted with `rounded-card` and `text-micro` was swallowed by tailwind-merge's text-colour catch-all, so a `className` override would have silently lost.

**Colour literals: zero in both clients.** The storefront's six were the hero gradient (three stops), a `StarBorder` glow, a `ShinyText` pair and the buy-box swatch fallback `#d7d7d7` → `var(--color-fog)`, an identical value. The gradient stops are `style={{ stopColor: "var(--color-flame-…)" }}`, not a `fill-*` class: `fill` does not paint a gradient stop, and the class form compiled, linted, built and passed every test while rendering the hero's ring gradient black. That was caught by rasterising both forms in a browser, not by any gate.

## Two judgement calls worth naming

- **`text-price` keeps its 600.** It is emitted by `<Price>`, whose only two call sites pass no weight of their own, so the utility's weight is what the homepage renders today. Aligning it to the 700 that most hand-rolled price chains use would have changed those prices. Only the two `font-semibold tabular-nums text-ink` sites — the exact weight match — were converted; the 400/700/800 chains are quantities, page numbers and SKUs, and a price token must not land on a quantity.
- **The panel's look changes, and nobody has looked at it.** These are the panel's own screens, so the deltas below are deliberate — but they are **unreviewed by rendering**, and they must be eyeballed by a person before this is called finished. Every gate in this repo is green with all of them in place; there is no screenshot test, no visual regression suite and no assertion that would notice that a button is the wrong size. The one comparable defect in this phase — a homepage gradient rendering black — was caught by rasterising a probe in a browser, not by anything the repo runs.

  | Component | Before (panel-local kit) | After (shared kit) |
  |---|---|---|
  | Button, md | `px-4 py-2 text-sm` | `h-10 px-5` |
  | Button, sm | — | `h-8 px-3` |
  | Button, ghost | — | gains `text-ash hover:text-ink` |
  | Input | — | gains `flex h-10`, `bg-canvas`, `focus:border-flame-700`, `disabled:opacity-50` in place of `disabled:bg-plaster disabled:text-ash` |
  | Textarea | — | as Input, plus `min-h-20` |
  | Card | `border border-plaster bg-canvas` | `rounded-card bg-plaster` |
  | CardBody → CardContent | `px-5 py-4` | `p-5 pt-0` |
  | Table cell | `px-4 py-3` | `px-3 py-2.5` |
  | Table head | — | `h-10 px-3 text-xs font-semibold` |
  | Badge | `gap-1` | `font-semibold whitespace-nowrap`, no gap |
  | Checkbox | native accent-tinted box | Radix button with a white check |
  | CardHeader | took `title`/`subtitle`/`actions` props | plain div; every one of the ~47 sites renders the title, optional subtitle and optional actions as children |

  Two things the migration preserved rather than lost: the scrollable table container is still a keyboard-reachable region (`role="region"`, `tabIndex={0}`, focus ring) at all 14 `<Table>` sites, and the one clickable table row still activates on Enter and Space. `variant="secondary"`/`"danger"` became `outline`/`destructive` at 23 sites, which is a rename of intent rather than a style change.

  **To review:** the panel's list pages, one form page, and any page with a table — under Persian text at the width an operator actually uses.

## Note on the metric

The colour-literal *ratchet* is not seeded with a storefront figure: seeding it means editing `ratchet.json`, which this phase is not permitted to touch. The count it would measure is zero in both clients today.

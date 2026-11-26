# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience (inferred from catalog, copy, and checkout integrations; confirm with
the owner): Persian-speaking shoppers in Iran, mostly on phones, who are furnishing or
renovating a kitchen and buying mid-to-high-end built-in appliances — ovens, gas cooktops,
hoods, sinks, air fryers. Secondary: the store's staff, who run the same catalogue through
`apps/admin`. The public storefront is the surface this record covers.

## Product Purpose

خانه مدرن ("Modern Home") is the storefront for the Datees appliance line and partner
brands (ALTON, BIMAX, SCHUFFLE, کن, اخوان, استیل البرز). It exists to sell kitchen
appliances online in Persian with local infrastructure: RTL Persian UI, Jalali dates,
Toman prices, Zarinpal payment, Kavenegar SMS, Postex shipping. Success means a shopper
finds the right appliance quickly, trusts it is genuine with real after-sales support,
and completes checkout without leaving Persian.

## Positioning

The single storefront carrying Datees' full built-in kitchen line (ovens, cooktops,
hoods, sinks) with the local checkout stack (Zarinpal, Kavenegar, Postex) a global
storefront cannot offer. (Brand-exclusive claim inferred from copy and the six-brand
lineup; verify exclusivity language before publishing it.)

## Operating Context

- Persian RTL, mobile-first traffic assumed (phone layouts are the tuned ones in the CSS).
- Every public route renders dynamically (ADR-0004); store and admin are HTTP clients of
  the `apps/api` gateway and never touch the database (ADR-0003).
- Shoppers arrive from the blog content (buying guides) and category pages; the home page
  is the entry wall.

## Capabilities and Constraints

- Next.js 16 + React 19, server-first rendering with client islands; HeroUI v3 on the
  storefront (admin runs a different stack over the same token layer, DEVIATION-REGISTER
  row 6).
- All reads/writes flow through `@kmodern/transport` to the NestJS gateway; money,
  dates, and Persian digits are formatted by `@kmodern/contracts`, never inline.
- Constraints future work must preserve: no `@kmodern/db`/Prisma reach from apps; design
  tokens live in `@kmodern/ui/tailwind.css`; logical properties (`ms/me/ps/pe`) only —
  RTL is the default writing direction, not a mirror.
- Undecided: whether the storefront hero may carry photography at all is being decided in
  the current redesign round (the incumbent hero is imagery-free by deliberate choice).

## Brand Commitments

- Name: خانه مدرن, with the "modern home خانه مدرن" house logo (see store header).
- Voice: Persian, warm-professional, plain; prices in Toman, dates in Jalali.
- Brands carried: DATEES (lead), ALTON, BIMAX, SCHUFFLE, کن, اخوان, استیل البرز.
- Colors/type: the token layer in `@kmodern/ui/tailwind.css` (flame blue `--color-flame-*`
  is the brand accent; `--font-display` Farhang) — user-pinned in the redesign brief as
  the tokens to keep.

## Evidence on Hand

- Real product photography and cut-outs already in the repo: `apps/store/public/editorial/`
  (hero-obj-hood.png, hero-obj-oven-v2.png, hero-obj-cooktop.png, banner-kitchen.jpg,
  blog covers) and `apps/store/public/products/**` (per-product variant images), plus
  `apps/api/seed/catalog.json` for real names/models/prices.
- Real blog content: `content/blog/*.json` (Persian buying guides).
- Home page CMS blocks with authored Persian copy (titles, subtitles, testimonials).
- Verified absences: no customer counts, ratings, press, or sales figures exist yet —
  do not fabricate them in any surface.

## Product Principles

1. Persian-first, always — copy, numerals, direction, and local payment/shipping are the
   product, not a localization layer.
2. The catalogue is the store: get a shopper to the right appliance in as few steps as
   the home page can manage.
3. Trust is shown, not claimed — genuine products, real warranty/returns, local support.
4. Gateway-only data access and contracts-validated writes keep one source of truth.

## Accessibility & Inclusion

- RTL and Persian are first-class; reduced-motion is honored site-wide (the incumbent
  hero already does).
- No WCAG level was stated by the owner; treat contrast (4.5:1 body), focus visibility,
  and reduced motion as the working floor.

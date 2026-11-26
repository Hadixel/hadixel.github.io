# Shared-behaviour index

§11.3: *keep one table in the docs mapping need → canonical implementation … consult it before
writing a hook or helper. This index is the cheapest duplication-prevention mechanism available.*

If the thing you are about to write has a row, the row is the implementation. If the row you need
does not exist, you are the first caller of a shared behaviour — write it where the rules put it,
and add the row when a second caller makes it canonical. A row marked **none** is honest: the need
exists, no canonical implementation does, and the first second caller earns one. It is not an
invitation to hand-roll a variant in the meantime.

| Need | Canonical implementation | Notes |
|---|---|---|
| HTTP call to the gateway (browser) | `createApiClient` from `@kmodern/transport`; the app instance is `<app>/src/lib/gateway.ts` | One factory owns base URL, auth header, encoding, empty responses and the typed `GatewayError`. No component hand-rolls a request |
| HTTP call to the gateway (server) | `@kmodern/transport/next` | Credentials come from the request context rather than browser storage — the one legitimate duplication (§10) |
| Persian digits | `toFaDigits` from `@kmodern/contracts` | Digits always render Persian, including inside components that format numbers themselves |
| Money display | `formatToman` from `@kmodern/contracts`, and the `Price` component from `@kmodern/ui` | A product read carries `discount.label` already formatted by the gateway — render it as it arrives, and never recompute the saving |
| Money input | **none yet** | The panel's product form edits a variant's price with a plain number `Input`. The first second caller earns a canonical money input with one parse rule |
| Dates (Jalali) | `formatJalali`, `formatJalaliDateTime`, `formatJalaliLong`, `tehranTime` from `@kmodern/contracts` | No component formats a date inline; the server owns `tehranTime` |
| Domain rules and predicates | `@kmodern/contracts` | Phone and postal-code normalisation (`normalizeIranPhone`, `normalizePostalCode`, …), order status, setting keys, sanitisation, slugs. A rule both tiers need lives here so it cannot diverge |
| Slug | `@kmodern/contracts/slug` | Four implementations existed once, and a product created in the panel could not be reached at the address the scraper would have given it. One canonicalisation, bounded and transliterated |
| Toasts | **none** | Rejected on purpose where it was last considered: a failed price range must still be wrong on a reload (`price-watch`). Toast state is local state |
| Breakpoints | Tailwind's responsive utilities; no JS measurement | A viewport-measuring script costs a hydration mismatch and a layout shift (§9.5) |
| Debounce | **none shared** | Two hand-rolled `setTimeout` sites today — the storefront's search suggestions and the checkout preview. The first second caller earns a hook |
| Outside-click and dismiss | The Radix primitives in `@kmodern/ui` (`Dialog`, `DropdownMenu`, …) | A hand-rolled outside-click listener is a worse version of a primitive that already handles it |
| Class merging | `cn` from `@kmodern/ui` | `clsx` plus `tailwind-merge`, taught this repo's token scales. A local concatenation helper does not merge |

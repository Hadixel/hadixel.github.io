# 14: Dissolve the adapter package; move the scraper to `apps/scraper`

**What to build:** the adapter package stops being a package, because by now only the gateway uses it — which is exactly the condition under which a package should not exist. Payment, SMS, shipping and object storage become gateway infrastructure. The scraper moves out of `packages/`, because three executables, a README, an output directory and a test suite is an application, and it keeps its one hard property: it touches no database.

**Blocked by:** 09, 10, 12.

**Status:** in-progress — seven of eight, and the eighth is the one that says whether it worked

- [x] Payment, SMS, shipping and storage are gateway infrastructure modules, not a shared package
- [x] The local-disk storage implementation exists as a real implementation of the storage contract; today the admin panel re-implements it inline, once per method, in three places
- [x] The unused import in the storage adapter is gone
- [x] The scraper is an application, sitting alongside the other three, with its entry points distinguishable from its library code — today three executables sit as flat siblings of thirteen library modules
- [x] The scraper still declares no dependency on the data layer, and its output files are read by the gateway's data scripts
- [x] The Persian brand-name data the scraper exports stops being a published entry point consumed by the admin UI
- [x] Nothing imports the scraper's internals by deep path
- [ ] The gateway builds and its suite is green with the adapter package gone

## What is left, and why it is not a cleanup

`packages/adapters` is a forwarding barrel. The gateway is off it — `storage/`, `payments/`, `sms/`
and `shipping/` are imported in-process, and the panel is off it too, since the media library and the
scraped product images both go through the gateway now.

**The storefront is what still holds it**, in four files:

- `apps/store/src/lib/shipping.ts` — a second quote engine, calling Postex itself and applying its own
  destination and weight rules, while the gateway computes the same quote through
  `POST /checkout/quote`. This is the pattern the whole phase exists to remove: one rule, two
  strengths, and the shopper shown a number the order may not be charged.
- `apps/store/src/app/api/orders/[id]/pay/route.ts` and its `callback/` — the card-to-card provider
  call, with the merchant credentials in the storefront's environment. A merchant credential in two
  processes is the same class of problem as the media root, and it is the one that costs money.
- `apps/store/src/app/checkout/page.tsx` — reads the provider config to render the card details.

None of these is a rewire. Each is a gateway route plus its service method plus tests, and doing them
without room to verify is how the adapters package ended up as a barrel in the first place.

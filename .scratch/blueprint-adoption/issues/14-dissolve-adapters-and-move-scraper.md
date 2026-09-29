# 14: Dissolve the adapter package; move the scraper to `apps/scraper`

**What to build:** the adapter package stops being a package, because by now only the gateway uses it — which is exactly the condition under which a package should not exist. Payment, SMS, shipping and object storage become gateway infrastructure. The scraper moves out of `packages/`, because three executables, a README, an output directory and a test suite is an application, and it keeps its one hard property: it touches no database.

**Blocked by:** 09, 10, 12.

**Status:** done

- [x] Payment, SMS, shipping and storage are gateway infrastructure modules, not a shared package
- [x] The local-disk storage implementation exists as a real implementation of the storage contract; today the admin panel re-implements it inline, once per method, in three places
- [x] The unused import in the storage adapter is gone
- [x] The scraper is an application, sitting alongside the other three, with its entry points distinguishable from its library code — today three executables sit as flat siblings of thirteen library modules
- [x] The scraper still declares no dependency on the data layer, and its output files are read by the gateway's data scripts
- [x] The Persian brand-name data the scraper exports stops being a published entry point consumed by the admin UI
- [x] Nothing imports the scraper's internals by deep path
- [x] The gateway builds and its suite is green with the adapter package gone

## What closing it turned up

The package was not held by anything complicated. Three of the four things holding it were smaller
than the reasoning around them:

- **`apps/store/src/lib/shipping.ts` had no callers at all.** A second quote engine, character for
  character the gateway's, that the storefront had stopped calling and nobody deleted. The checkout
  page gets its delivery fee from the gateway's quote; this file was a copy left behind.
- **"It holds the merchant credentials, so calling the provider is its job"** was the stated reason the
  two card-to-card routes kept their own provider calls. It is a description of where the credentials
  ended up rather than an argument for it: two processes holding one merchant's credentials is how the
  checkout page and the process that has to honour the payment get configured to disagree, and a shopper
  who chose online payment is told to try again.
- **The callback verified against a total it had fetched, then settled through a different route.**
  Two requests and two numbers, with nothing tying the amount verified to the amount the order records.

So `POST /shopper/orders/:id/payment-start` and `.../payment-verify` now hold the window, the provider
call, the amount and the settlement in one place, and `GET /settings/public` answers whether online
payment is available — computed by the gateway from the configuration it actually has, rather than read
out of a second environment by the storefront.

One more thing the deletion turned up, and it is a consequence rather than a bug: `scripts/
gateway-dist-manifest.mjs` listed `adapters` among the workspace packages it stubs into `dist`, so the
gateway's build failed the moment the package was gone. That helper is mine, not one of the four
frozen gate scripts, and it now stubs only `schema`.

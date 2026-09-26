# 14: Dissolve the adapter package; move the scraper to `apps/scraper`

**What to build:** the adapter package stops being a package, because by now only the gateway uses it — which is exactly the condition under which a package should not exist. Payment, SMS, shipping and object storage become gateway infrastructure. The scraper moves out of `packages/`, because three executables, a README, an output directory and a test suite is an application, and it keeps its one hard property: it touches no database.

**Blocked by:** 09, 10, 12.

**Status:** ready-for-agent

- [ ] Payment, SMS, shipping and storage are gateway infrastructure modules, not a shared package
- [ ] The local-disk storage implementation exists as a real implementation of the storage contract; today the admin panel re-implements it inline, once per method, in three places
- [ ] The unused import in the storage adapter is gone
- [ ] The scraper is an application, sitting alongside the other three, with its entry points distinguishable from its library code — today three executables sit as flat siblings of thirteen library modules
- [ ] The scraper still declares no dependency on the data layer, and its output files are read by the gateway's data scripts
- [ ] The Persian brand-name data the scraper exports stops being a published entry point consumed by the admin UI
- [ ] Nothing imports the scraper's internals by deep path
- [ ] The gateway builds and its suite is green with the adapter package gone

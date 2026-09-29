# 13: `packages/transport` and the storefront's hand-rolled requests

**What to build:** the two clients talk to the gateway through one typed client factory instead of a dozen ad-hoc fetches. The package earns its place only once it has two consumers, which is what this slice creates: a browser-side client that attaches credentials from browser storage, and a server-side read helper that takes them from the request. The duplication between those two is the one the blueprint explicitly permits.

**Blocked by:** 08.

**Status:** done

- [x] A `packages/transport` workspace exports one factory that owns base-URL resolution, the authentication header, JSON encoding, empty responses and a typed error carrying a status code and Persian message
- [x] The storefront's thirteen hand-written request sites are replaced by the factory, including checkout preview, checkout, OTP and cart enrichment
- [x] The admin panel's remaining direct requests are callers of the factory, not a second factory
- [x] The server-side read helper exists for the panel's server modules and reads credentials from the request rather than browser storage
- [x] The package's version of the transport is used for the media upload and the scraper endpoints, which need larger or streamed bodies
- [x] The package has a consumer-facing contract test, and the base URL it resolves is declared as a build input so the task cache keys on it
- [x] No client constructs a request to the gateway by hand

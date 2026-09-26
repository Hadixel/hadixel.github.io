# 07: The gateway's composition root, auth, and the storefront's first read

**What to build:** the gateway boots for real, and proves the whole shape end to end with one vertical slice. A shopper opening the storefront's home page gets their content from the gateway, over HTTP, with credentials — and the gateway validates every inbound field, strips unknown ones, and returns one error shape for everything that fails. The tracer bullet that every later resource slice copies.

**Blocked by:** 06.

**Status:** ready-for-agent

- [ ] The gateway boots with an explicit, ordered composition root: configuration, the data client, the app-wide global validation pipe, feature modules, health checks, the error filter, shutdown hooks — each appearing exactly once
- [ ] The app module declares its imports and nothing else; all construction happens at the wiring layer
- [ ] Every inbound request has its body validated by one global pipe that both rejects unknown fields and strips the ones that are only for forms
- [ ] Every failure returns one envelope carrying a status code, a human-readable Persian message and a timestamp
- [ ] The gateway refuses to serve its own documentation routes in production
- [ ] Cross-origin access is restricted to an explicit allowlist, not a wildcard
- [ ] Security headers are set on every route, not only on media paths
- [ ] The storefront's home page renders its content from the gateway, including its featured deals, and the page still works with the gateway stopped only in the sense that it reports failure — it never reads the database itself
- [ ] A test drives the storefront's request path against a stubbed gateway, and an integration test drives the gateway against a disposable database

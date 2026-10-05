# 07: The gateway's composition root, auth, and the storefront's first read

**What to build:** the gateway boots for real, and proves the whole shape end to end with one vertical slice. A shopper opening the storefront's home page gets their content from the gateway, over HTTP, with credentials — and the gateway validates every inbound field, strips unknown ones, and returns one error shape for everything that fails. The tracer bullet that every later resource slice copies.

**Blocked by:** 06.

**Status:** done

- [x] The gateway boots with an explicit, ordered composition root: configuration, the data client, the app-wide global validation pipe, feature modules, health checks, the error filter, shutdown hooks — each appearing exactly once
- [x] The app module declares its imports and nothing else; all construction happens at the wiring layer
- [x] Every inbound request has its body validated by one global pipe that both rejects unknown fields and strips the ones that are only for forms
- [x] Every failure returns one envelope carrying a status code, a human-readable Persian message and a timestamp
- [x] The gateway refuses to serve its own documentation routes in production
- [x] Cross-origin access is restricted to an explicit allowlist, not a wildcard
- [x] Security headers are set on every route, not only on media paths
- [x] The storefront's home page renders its content from the gateway, including its featured deals, and the page still works with the gateway stopped only in the sense that it reports failure — it never reads the database itself
- [x] A test drives the storefront's request path against a stubbed gateway, and an integration test drives the gateway against a disposable database

## Comments

- Composition root: `grep -c` over `apps/api/src/main.ts` returns exactly 1 for each of
  `useGlobalPipes`, `useGlobalFilters`, `useGlobalGuards`, `enableShutdownHooks`, `helmet()` and
  `enableCors`; `NestFactory.create` is called once and the `SwaggerModule` block is the only
  documentation registration. The data client is constructed in `DataModule`'s `useFactory` and
  `HealthModule` is imported once in `app.module.ts`.
- App module declares imports only: `grep -n "providers\|controllers" apps/api/src/app.module.ts`
  returns one hit, and it is inside a comment saying there are none.
- Validation: `VALIDATION_PIPE_OPTIONS` in `apps/api/src/common/validation.ts` sets
  `whitelist: true` and `forbidNonWhitelisted: true`, and `main.ts` builds the single global pipe
  from that exported object rather than a copy.
- Error envelope: `apps/api/src/common/filters/gateway-exception.filter.ts` builds
  `{ statusCode, message, timestamp }`, with `message` Persian for a `GatewayException` or a
  per-status copy otherwise, and is registered as the one `@Catch()` global filter.
- CORS: `config.service.ts` splits `CORS_ORIGINS` into a list and throws when it resolves empty, so
  a wildcard is not reachable from configuration; `apps/api/.env.example` shows the two explicit
  localhost origins.
- Storefront half: `apps/store/src/app/page.tsx` calls `loadHome()` and returns the `role="alert"`
  failure branch when the gateway is unreachable; `grep` for `generated/prisma`, `@kmodern/db` and
  `@/db` across `apps/store/src` returns nothing, so the failure cannot be papered over by a local
  read. `npx vitest run src/__tests__/home-gateway.test.ts` in `apps/store` → 1 file, 6 tests
  passed, asserting the home read against a stubbed gateway including its `deals` field.
  Note for the record: the home page resolves `deals` and ships it, and the deals section itself is
  drawn by the `dealGrid` block (`apps/store/src/content/blocks/deal-grid.tsx` →
  `apps/store/src/home/components/deal-grid.tsx`), whose payload also comes from the gateway —
  `page.tsx` contains no deals markup of its own.
- Gateway integration half: `apps/api/vitest.config.ts` wires `tests/setup.ts`, which refuses to
  run unless `TEST_DATABASE_URL` names the database `kmodern_test`, and `scripts/test-db.sh` boots
  that disposable database; the suites drive real services and controllers over the real client
  (`apps/api/tests/harness.ts` truncates between tests). Not executed during this reconciliation —
  the gateway suite needs a running disposable database.

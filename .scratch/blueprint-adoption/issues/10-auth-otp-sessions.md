# 10: Auth, OTP and sessions, end to end

**What to build:** a shopper signs in with their phone number, receives a one-time code, signs in, browses their account and signs out — and the admin operator does the same, over one session implementation. Today the customer phone number is a unique key reached by a write path with no normalisation, so two spellings of one number can create two customers, and the storefront's logout route re-implements revocation that its own auth module does not expose.

**Blocked by:** 05, 07.

**Status:** done, with the caveat noted below

- [x] A shopper requests a one-time code, receives it, and signs in; the code is verified, consumed and rate-limited
- [x] The phone number is normalised by the shared contract at every write path, so one human cannot become two customers
- [ ] The client-side input handling cannot produce a value the server's contract would reject — today it can, by truncating a number that already carries a country code — **unverified as of 2026-10-01.** `apps/store/src/account/components/auth-modal.tsx:150` still reads `.replace(/\D/g, "").slice(0, 11)` and gates on `const PHONE_RE = /^09\d{9}$/` (line 8), the exact truncating handler; `apps/store/src/checkout/components/checkout-client.tsx:243` does the same for `recipientPhone`. A normalising handler exists only as a local helper inside `apps/api/tests/normalization.test.ts:66-72`, and `grep -rn "normalizeIranPhone|digitsOnly|slice(-10)" apps/store/src apps/admin/src` returns no production use. The `/api/otp` route's own comment (`apps/store/src/app/api/otp/route.ts:16`) claims the client no longer rejects `+989121234567`, but the modal's `PHONE_RE` still does.
- [ ] The code is sent through the SMS provider as one gateway service; the number reaches the provider in the provider's expected format — **unverified as of 2026-10-01.** The first half holds: `grep -rn sendLookup apps/api/src` shows one adapter (`apps/api/src/sms/kavenegar.ts:37`) with one caller (`apps/api/src/auth/otp.service.ts:143`). The second half does not: `apps/api/src/sms/kavenegar.ts:39` passes `receptor: p.phone` — the stored `09…` spelling — with no conversion, while the module header in `apps/api/src/auth/otp.service.ts:15` asserts "The number reaches the provider in the provider's format, which is not the format it is stored in". No conversion function exists anywhere under `apps/api/src/sms/`.
- [x] Session creation and session revocation are both reachable from one session implementation
- [x] The admin panel's own authentication, including the seeded operator account, uses the same gateway session contract
- [ ] The stored customer address is normalised through the shared contract — **unverified as of 2026-10-01.** `packages/contracts/src/index.ts:397-412` has `postalCodeSchema` and `addressSchema`, which normalise, and `apps/api/tests/normalization.test.ts:104-121` asserts that — but the gateway's write path is `apps/api/src/checkout/dto/checkout.dto.ts:47,62`, a class-validator `AddressDto` using `@Matches(/^09\d{9}$/)` and `@Matches(/^\d{10}$/)`. That rejects `+98…` and Persian-digit postal codes instead of normalising them, and its own comment (`checkout.dto.ts:35-39`) says the zod schema was dropped on purpose. `grep -rn "addressSchema" apps/api/src` returns nothing.
- [x] The storefront and the panel hold no credential material beyond what the gateway issues them

## Comments

The OTP lifecycle is the strongest evidence in this ticket: `apps/api/src/auth/otp.service.ts` stores
the code as `hashOtp(code)` (line 79), supersedes every live code before issuing a new one
(`updateMany … usedAt: now`, line 74), counts failed attempts on the code row (`attempts: { increment: 1 }`,
line 122, against `OTP_MAX_ATTEMPTS = 5`) and rate-limits requests per number over
`OTP_REQUEST_COOLDOWN_MS = 60_000` (line 62). Verification is wired end to end at
`apps/api/src/auth/auth.controller.ts:123,139` (`POST /auth/otp`, `POST /auth/otp/verify`).

Phone normalisation is one function on one path: `canonicalPhone` (`apps/api/src/auth/session.ts:208`)
delegates to `normalizeIranPhone` from `@kmodern/contracts` (`packages/contracts/src/normalize.ts:58`), and
`grep -rn "customer.create|customer.upsert|customer.update" apps/api/src` shows the only two customer
writes — `apps/api/src/auth/otp.service.ts:125` and `apps/api/src/auth/auth.service.ts:136` — both after a
`canonicalPhone` call, with `phone` `@unique` in the schema (`apps/api/prisma/schema.prisma:262`).

Sessions are one implementation: `openCustomerSession` / `openAdminSession` and
`revokeCustomerSession` / `revokeAdminSession` all live in `apps/api/src/auth/session.ts:76-135`,
and `apps/store/src/app/api/auth/logout/route.ts` no longer hashes anything itself — it calls
`signOut()`, which posts to `/auth/sign-out` and lets the gateway revoke by token hash. The panel's
`login()` (`apps/admin/src/auth/lib/auth.ts:66`) posts to `/auth/admin`, and the seeded operator
(`apps/api/seed/bootstrap.ts:395-411`) is an `adminUser` row whose password comes from the same
`hashPassword`, so sign-in goes through `signInAdmin`'s lockout and audit.

The three caveats are real gaps in the code, not missing evidence. The client-side input handler still
truncates and validates against `^09\d{9}$`; the SMS adapter passes the stored spelling to Kavenegar
with no provider-format conversion despite the comment saying otherwise; and the checkout address DTO
uses class-validator regexes instead of the shared `addressSchema`, so a `+98…` delivery address is
rejected rather than normalised. I left the code alone per the reconciliation scope.

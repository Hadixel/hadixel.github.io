---
title: Decide admin authentication, roles, and security model
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [001-backend-stack.md]
---

## Question

/grilling session. The admin app controls the whole store — production-level security is required. Decide: auth mechanism (sessions vs JWT, library vs hand-rolled — hand-rolled auth is a known foot-gun for a custom build); single admin vs roles (owner, content editor, order manager); 2FA; rate limiting and brute-force protection; how customer auth (from the orders ticket) shares or separates from admin auth; secret management. Output: the auth/security section of the spec.

## Resolution

The admin auth & security model, decided.

### Mechanism
- **A vetted auth library, not hand-rolled.** Use a maintained Next.js auth library (Auth.js/NextAuth, better-auth, or Lucia-style session utilities) so password hashing, CSRF, and session rotation are configured rather than invented — the ticket's flagged foot-gun is explicitly avoided.
- **Server-side sessions in Postgres**, referenced by an **httpOnly + Secure + SameSite** cookie — chosen over stateless JWT specifically for **instant revocation**: a compromised admin session can be killed server-side immediately, with no refresh-token juggling. Session rows carry issued-at, last-seen, IP/user-agent, and expiry; sessions rotate on login and are invalidated on password change.

### Realms
- **Admin and customer auth are fully separate realms.** Distinct tables (`AdminUser` vs the `Customer` from 009), distinct login flows (admin = email + password on the admin subdomain; customer = phone OTP on the storefront), and **separate session cookies scoped to their own hosts**. There is deliberately **no privilege path from a customer session to admin capability** — no shared table, no `isAdmin` flag to mis-evaluate. Admin cookies are host-scoped to the admin subdomain (not domain-wide) so a storefront XSS cannot reach them.

### Roles
- **Single admin role for this build.** Everyone who signs in to the admin app is a full admin. A **`role` field is included from day one** (defaulting to `OWNER`) and all capability checks route through **one central policy helper** rather than scattered inline conditionals — so the previously-sketched Owner / Content Editor / Order Manager split can be introduced later by populating the enum and the helper, with **no schema migration and no call-site rewrite**. Chosen on the basis that only the owner will log in initially; revisit before delegating any admin work.

### Hardening
- **Rate limiting + temporary lockout** — throttled per IP **and** per account, with a cool-off lockout after N consecutive failures, on the login and password-reset endpoints. Lockout is time-boxed (not permanent) so the owner can't be locked out indefinitely.
- **Admin audit log** — `AdminAuditLog(id, adminUserId, action, entityType, entityId?, ip, userAgent, at, meta jsonb)` recording sign-ins, sign-in failures, and sensitive mutations (price/stock edits, order status changes, refunds, publishing, admin-user changes). Complements the per-order `OrderStatusEvent` timeline from 009 — that one is order-scoped and customer-visible, this one is system-wide and admin-only.
- **Strong-password policy** — minimum length with a breached-password check at set-time, hashed with the library's modern KDF (argon2id/bcrypt at a sane cost).
- Standard transport/headers posture: HTTPS-only, HSTS, secure cookie flags, CSRF protection on mutating admin requests, and no admin routes reachable without a valid session (enforced in middleware, re-checked server-side per action — never client-side only).

### Explicitly declined (recorded, with consequences)
- **2FA declined** — the admin panel is password-only in this build. ⚠️ **This is the largest residual security gap in the spec**: a single phished, reused, or leaked password grants full control of products, orders, customer data, and payment settings, with the audit log recording the damage rather than preventing it. Mitigations above reduce brute-force risk but not credential theft. The `AdminUser` schema is therefore left **TOTP-ready** (nullable `totpSecret`, `totpEnabledAt`, `recoveryCodes`) so authenticator-app 2FA can be enabled later **without a migration** — recommended before the store handles real orders or any second person gets access.
- **Captcha on repeated failures** declined — rate limiting + lockout carry the brute-force load alone.
- **Optional IP allowlist** declined — consistent with dynamic Iranian home/mobile IPs and the lockout-safety concern.

### Secrets (boundary with 012)
- Auth-scoped secrets — session/cookie signing secret, database URL, and the initial admin bootstrap credential — live in **Vercel encrypted environment variables**, per-environment, never in the repo. The first admin user is created by a seed/bootstrap script that forces a password change on first login rather than shipping a default credential. The **full secret inventory, per-environment separation, and rotation policy are ticket 012's** (deployment & environments); this ticket only fixes what auth requires.

Sketch (entities, not final Prisma):

AdminUser(id, email unique, passwordHash, name, role [OWNER|EDITOR|ORDER_MANAGER] default OWNER, isActive, totpSecret?, totpEnabledAt?, recoveryCodes?, lastLoginAt?, failedAttempts, lockedUntil?, mustChangePassword, timestamps)
AdminSession(id, adminUserId, tokenHash, ip, userAgent, issuedAt, lastSeenAt, expiresAt, revokedAt?)
AdminAuditLog(id, adminUserId, action, entityType, entityId?, ip, userAgent, meta jsonb, at)

**Relationship to 009:** customer identity/auth (phone-first, OTP-primary + optional password) stays entirely in the customer realm; this ticket supplies the session pattern both realms follow, but not a shared identity.
**Deferred to 012:** full secret inventory, per-environment separation, rotation.

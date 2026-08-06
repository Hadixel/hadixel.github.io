---
title: Define deployment, domains, and environments
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: []
---

## Question

/grilling session. The stack is locked (Next.js store+API and Next.js admin on Vercel, monorepo, Neon Postgres, ArvanCloud media, owner's custom domain). Decide the concrete deployment picture: domain/subdomain layout (store at apex? `admin.` and `api.` or API under the store app?); environments (production + preview/staging? separate staging DB?); secret management (Vercel env vars — which secrets exist: DB URL, Zarinpal merchant ID, ArvanCloud keys, auth secrets); Shaparak domain registration timing (gateway is bound to ONE domain — which exact hostname gets registered); retirement of the gh-pages deploy; backups for Postgres and media. Output: the deployment/environments section of the spec.

## Resolution

Deployment, domains, and environments — decided. **Amends** media provider from [Research media storage…](003-research-media-storage.md) / [Choose the backend stack…](001-backend-stack.md): **ParsPack** free-tier object storage replaces **ArvanCloud** for now (S3-compatible; portable adapter).

### Production hostnames (`kmodern.ir`)
- **`kmodern.ir`** — storefront + public API (Next.js route handlers, same origin). Canonical customer host.
- **`www.kmodern.ir`** — **301 →** `kmodern.ir`.
- **`admin.kmodern.ir`** — admin app only; admin session cookie **host-scoped** to this hostname (per [admin auth](010-admin-auth.md)). Security is isolation + 010 controls, not hostname obscurity.
- **No `api.` subdomain** — API lives on the store app.
- Media public URLs stay on the **ParsPack** (provider) hostnames, not under `kmodern.ir` (optional `cdn.` CNAME later — not required).

### Staging hostnames
- **`staging.kmodern.ir`** — staging store + API.
- **`admin.staging.kmodern.ir`** — staging admin (cookie host = full hostname).
- PR previews remain on `*.vercel.app`; **admin** previews use Vercel **Deployment Protection**.

### Environments
- **Production** + **staging** long-lived; **PR previews** are ephemeral and share **staging** data/secrets posture — **never** production DB or live payment/SMS.
- Staging is the stable rehearsal surface for checkout/OTP/shipping before cutover.

### Vercel + monorepo
- **Two Vercel projects** from the same monorepo: **`kmodern-store`** (`apps/store`) and **`kmodern-admin`** (`apps/admin`).
- Independent domains, env scopes, and deploys; shared `packages/*`.

### Postgres (Neon)
- **One Neon project**, two long-lived branches: **`production`** and **`staging`**.
- Store + admin Production env → production branch URL; Preview/Development + staging hosts → staging branch URL only.

### Secret inventory (Vercel encrypted env; never in repo)
| Secret | Store | Admin | Prod | Staging / Preview |
|--------|-------|-------|------|-------------------|
| `DATABASE_URL` | ✓ | ✓ | production branch | staging branch |
| Customer session / auth secret | ✓ | — | unique | **different** |
| Admin session / auth secret | — | ✓ | unique | **different** |
| `ZARINPAL_MERCHANT_ID` (کد درگاه) + live/sandbox mode | ✓ | — | **live at cutover** | **sandbox** |
| Kavenegar API key + template names | ✓ | optional later | live | test/disabled or separate |
| Postex API key | ✓ | — | live | test or careful shared |
| ParsPack S3: endpoint, access key, secret, bucket/prefix | ✓ as needed | ✓ uploads | **prod** bucket/prefix | **staging** bucket/prefix |
| `CRON_SECRET` (Zarinpal reconcile job) | ✓ | — | ✓ | different |
| Admin bootstrap / seed | — | local/CI once | not runtime default password | optional |

Card-to-card display details live in DB Settings (not env). Rotate by reissuing provider keys + updating Vercel; rotating session secrets logs everyone out (acceptable).

### Shaparak / Zarinpal domain timing
- Registered gateway hostname: **`kmodern.ir` only** (not `www`, not `admin.*`, not `staging.*`, not `*.vercel.app`).
- **Bind domain + switch to live کد درگاه at production cutover** — not early. Until then staging/previews use **sandbox**.
- Cutover checklist includes: DNS/HTTPS on apex, sandbox path proven, then Production env → live merchant id, one real small payment smoke, then open checkout.

### gh-pages retirement
- **Hard cut at go-live:** production traffic only on `kmodern.ir`; remove `gh-pages` deploy scripts/deps from the new stack; disable **this app’s** GitHub Pages deploy.
- Do not run two live shops. If `hadixel.github.io` hosts other projects, only retire this app’s Pages path.

### Media provider (amend)
- **ParsPack** free-tier object storage (Iran-reachable, S3-compatible, Rial/free tier) — chosen over ArvanCloud for cost-now.
- Admin uploads via S3 SDK; image derivatives via **`sharp` at upload** (portable across Iranian S3 providers).
- Implement behind a thin storage adapter (endpoint + credentials) so a later move to Liara/Arvan/paid tier is config, not rewrite.
- **Prod vs staging** separate bucket or prefix.

### Backups
- **Postgres:** Neon **PITR / history on `production`** (target ≥7 days retention; 14–30 if cheap). No mandatory off-Neon `pg_dump` for v1. Staging: no backup SLA.
- **Media:** **immutable object keys** (never overwrite; new upload = new key); soft-delete is DB-side. Free-tier versioning not relied on.
- **Before go-live:** one Neon restore-to-branch drill; confirm kept object keys still serve after a logical “delete.”
- Out of scope: multi-region DR, tape, marketed RPO/RTO.

### Explicit non-goals here
- Implementing the monorepo/Vercel wiring (build effort).
- Re-litigating Vercel-vs-Iranian-PaaS (still accepted risk from 001).

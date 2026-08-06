---
title: Choose the backend stack and database
labels: [wayfinder:grilling]
status: closed
assignee: claude-main
blocked-by: [002-research-iran-payments.md, 003-research-media-storage.md]
---

## Question

Fully-custom build is locked; the store and separate admin app share one API. Which backend does that API run on — Node/Express, Next.js API routes, NestJS, or something else — which database (Postgres, MongoDB, ...), which ORM, and where does it deploy given the Vercel-or-similar constraint? Must weigh: serverless vs long-running server, compatibility with the chosen Iranian payment gateway callbacks (see research), and media storage findings. Owner is learning — developer-experience and ecosystem tutorials matter.

**Update from media-storage research (closed):** the same sanctions dynamics that ruled out foreign CDNs likely apply to Vercel itself — Vercel offers OFAC-country firewall blocking and Iranian visitor reachability to Vercel-hosted sites is questionable. This ticket must now also re-examine the hosting assumption: verify whether a Vercel-hosted storefront/API is reliably reachable from inside Iran, and weigh Iranian hosts (ArvanCloud PaaS, Liara, ParsPack) as first-class alternatives. See [research-media-storage.md](../assets/research-media-storage.md).

## Resolution

**Everything on Vercel, behind the owner's custom domain.** The stack:

- **Framework: Next.js** — one project serves the store frontend *and* the API (route handlers). This gives SSR/SEO for dynamic {slug} pages and blog posts, which a client-only Vite app cannot. The existing Vite store migrates to Next.js as part of the build.
- **Admin: a second Next.js app** (e.g. `admin.<domain>`), per the earlier separate-app decision — one framework everywhere, server actions for admin screens.
- **Repo layout: monorepo** (pnpm workspaces / Turborepo): `apps/store`, `apps/admin`, `packages/db` (Prisma schema + client), `packages/ui`. Both Vercel projects deploy from it.
- **Database: Postgres (Neon / Vercel Postgres) + Prisma.** Relational fits products→variants→stock, orders→items, and the category/nav trees; page-builder component lists live in JSONB columns.
- **Payment consequence, accepted knowingly:** hosting the API on Vercel means the gateway is **locked to Zarinpal**, the only gateway with a documented pattern for foreign-hosted servers (see the payments research). If Zarinpal's pattern fails in practice, the fallback is a small Iran-hosted payment relay — noted, not planned.
- Media: originally **ArvanCloud** per the media-storage research; **amended in [Define deployment, domains, and environments](012-deployment-environments.md) to ParsPack free-tier S3** (same S3-style API from the app). The API talks to object storage S3-style either way.

Risk accepted by the owner: Vercel may tighten OFAC geo-blocking of Iranian visitors; if that happens, the monorepo + standard Node/Postgres stack ports to an Iranian PaaS (Liara/ArvanCloud) without redesign.

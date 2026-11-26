# This repo's instance of the blueprint

§13: *this blueprint is prescriptive and portable; the numbered docs are descriptive and specific.*
This is the companion the blueprint asks for — the concrete choices this repo made when it
instantiated [`blueprint/ARCHITECTURE-BLUEPRINT.md`](blueprint/ARCHITECTURE-BLUEPRINT.md), written
down so a reader meets them without deriving them from the enforcement. Each row links to the home
of the choice; nothing here is a second copy of a rule that already has one.

## Ports

§5.1 assigns each app one fixed port, never reused.

| Surface | Port | Where it is declared |
|---|---|---|
| Storefront | 3100 | `apps/store/package.json` — `next dev -p 3100` |
| Admin panel | 3101 | `apps/admin/package.json` — `next dev -p 3101` |
| Gateway | 3102 | `apps/api/.env.example` — `PORT`; `apps/api/scripts/dev.mjs` defaults to it |
| Disposable Postgres (test and shadow databases) | 5433 | `scripts/test-db.sh`; `TEST_DATABASE_URL` and `SHADOW_DATABASE_URL` in `apps/api/.env.example` |

`scripts/predev-ports.sh` refuses a dev start when one of the three app ports is already held, and
reads the ports from the manifests rather than restating them.

## The workspace list

Nine workspaces, every one ranked — the table, with what each may depend on and which rule enforces
it, lives in [`RANKS.md`](RANKS.md): four apps (`api`, `store`, `admin`, `scraper`), three packages
(`transport`, `ui`, `scraper-core`), the kernel (`contracts`), and one build-only workspace
(`config`). Internal links use pnpm's `workspace:*` protocol; `packageManager` is `pnpm@11.20.0` and
the `engines` floor is `node >=24.0.0`, both declared at the root only.

## The gateway's archetype assignment

§7.1: every top-level directory under `apps/api/src` is exactly one archetype. The assignment is
written out in `scripts/gateway-archetypes.js` — the one table both the structure gate and the
dependency rules read, so a directory nobody named fails the audit rather than joining the graph
unassigned. Reproduced here for a reader who should not have to open the script:

| Archetype | Directories |
|---|---|
| Support (pure, owned by no feature) | `common` |
| Infrastructure (module + port/adapter, no controller) | `config`, `prisma`, `payments`, `shipping`, `sms`, `storage` |
| Feature (module + controller(s) + service(s)) | `audit`, `auth`, `catalogue`, `categories`, `checkout`, `collections`, `content`, `customers`, `dashboard`, `discounts`, `health`, `inventory`, `media`, `nav`, `orders`, `pages`, `posts`, `price-watch`, `products`, `scraper`, `settings`, `shopper`, `stock-levels`, `storefront` |
| Generated (the ORM's output) | `generated` |

The `src` root itself holds two files: `main.ts` (the process entry) and `app.module.ts` (the
composition module, `imports` only).

## Design tokens

The token values and the design language they express are recorded in
[ADR-0001](adr/0001-showcase-design-language.md) and defined in `packages/ui`'s stylesheet. They
are not restated here: a second copy of a token value is exactly the drift §11.1 exists to prevent.
[`shared-behaviour.md`](shared-behaviour.md) names the canonical formatters and components that
consume them.

## Rendering dialects

Chosen per audience and written down before the first page of each:
[ADR-0006](adr/0006-rendering-dialects.md) for both clients, and
[ADR-0004](adr/0004-storefront-dynamic-rendering.md) for the storefront's decision to serve every
public route dynamically.

## Configuration tiers

The root [`.env.example`](../.env.example) documents every variable this repo reads and the tier it
belongs to — local secret (runtime, never at build), public (inlined at build, part of the cache
key), CI-only — and each app carries its own `.env.example` beside it. §12: a secret that reaches a
build is no longer a secret.

## The pipeline

Which branches run the gates, and what a merge request therefore does not verify, is recorded in
[ADR-0005](adr/0005-pipeline-triggers.md). The audit itself is a command, not a document:
`pnpm run audit`.

## The docs system

Exactly one entry point per surface — the repo root's `CLAUDE.md` and `apps/api`,
`apps/store`, `apps/admin`, `apps/scraper` each carrying an `AGENTS.md` — enforced by
`scripts/audit-docs-index.js`. [`index.md`](index.md) names every document under `docs/`, and every
document has that index as one of its routes in.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below this line is hand-written. The block above is re-written by `next dev` on
     every run; this index is the part that answers "where do I start". §13: exactly one entry
     point per surface, and it is only an index. -->

# `apps/admin` — the operator panel

The internal face of خانه مدرن: Persian, RTL, for staff. Like the storefront it is a *client* of the
gateway — HTTP through `@kmodern/transport`, never the database. Reaching for `@kmodern/db`,
`apps/api` or `generated/prisma` from here fails the audit.

## Read this first

- [Rendering dialect](../../docs/adr/0006-rendering-dialects.md) — server shell around a client feature
  tree; writes travel through server actions and revalidate with `router.refresh()`.
- [ADR-0003](../../docs/adr/0003-admin-writes-through-the-gateway.md) — why the panel's writes go
  through the gateway rather than to the database.
- [Rank table](../../docs/RANKS.md) — where this app sits and what it may import.
- [DEVIATION-REGISTER](../../docs/DEVIATION-REGISTER.md) row 6 — this panel and the storefront
  deliberately run different component stacks over one token layer.

## Shape of the tree

```
src/
├── app/          # routing only, plus the (panel) route group that carries auth and layout
├── <feature>/    # one root per feature: auth, catalogue, content, discounts, inventory, media,
│                 # orders, scraper, settings. Each holds lib/ (including its server actions),
│                 # components/, hooks/, state, types.ts.
├── components/   # app-wide shared components only
├── lib/          # app-wide helpers, the transport instance, and the three modules every action
│                 # shares: actions/ctx.ts, actions/result.ts, actions/form-helpers.ts
└── types/        # app-level types
```

A feature belongs to exactly one root. Its server actions live in that feature's `lib/` — a `"use
server"` module in a layer folder is a feature's write path filed in the wrong place, and it is how
one feature ends up reaching into another for a write it owns.

## Where things live

- Server actions: `<feature>/lib/<feature>-actions.ts`, or a plain module beside them. Every action
  returns `ActionResult` from `src/lib/actions/result.ts` — a discriminated union, so a failure cannot
  arrive without a message. Do not throw across the boundary.
- Form helpers: `src/lib/actions/form-helpers.ts` (`field`, `intField`, `jsonParse`).
- Per-request context: `actionContext()` from `src/lib/actions/ctx.ts` — the admin, session, IP and
  user agent for *this* request.
- Formatting and validation: `@kmodern/contracts`. `toFaDigits`, `formatToman`, `formatJalali`,
  `formatJalaliDateTime`, `tehranTime`. Validation happens at the gateway with those schemas, so the
  rule cannot exist twice.
- Components and tokens: `@kmodern/ui`. `cn` merges; a local concatenation helper does not.

## Commands

```bash
pnpm --filter @kmodern/admin dev          # development server
npx vitest run                           # from apps/admin — the suite needs no database
npx tsc -p apps/admin/tsconfig.json --noEmit
cd apps/admin && npx next build
```

The repo-wide gates are `npx turbo run typecheck lint test audit build` from the root; run
`pnpm run audit` (not `pnpm audit`, which is pnpm's own vulnerability scan).

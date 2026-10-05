<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- Everything below this line is hand-written. The block above is re-written by `next dev` on
     every run; this index is the part that answers "where do I start". §13: exactly one entry
     point per surface, and it is only an index. -->

# `apps/store` — the storefront

The public face of خانه مدرن: Persian, RTL, server-first. It is a *client* of the gateway — it speaks
HTTP to `apps/api` through `@kmodern/transport` and never touches the database. Reaching for
`@kmodern/db`, `apps/api` or `generated/prisma` from here fails the audit.

## Read this first

- [Rendering dialect](../../docs/adr/0006-rendering-dialects.md) — server-first with islands; how reads and
  writes travel here, and what must not drift.
- [ADR-0004](../../docs/adr/0004-storefront-dynamic-rendering.md) — every public route is served
  dynamically, on purpose.
- [ADR-0001](../../docs/adr/0001-showcase-design-language.md) / [ADR-0002](../../docs/adr/0002-heroui-component-stack.md)
  — the design language and why this surface runs on HeroUI.
- [Rank table](../../docs/RANKS.md) — where this app sits and what it may import.

## Shape of the tree

```
src/
├── app/          # routing only. A route directory holds page/layout/route/loading/error/
│                 # not-found/template and framework metadata, nothing else.
├── <feature>/    # one root per feature: account, cart, catalogue, checkout, content, home,
│                 # orders, search. Each holds lib/, components/, hooks/, state, types.ts.
├── components/   # app-wide shared components only
├── lib/          # app-wide helpers, and the transport instance
└── types/        # app-level types
```

A feature belongs to exactly one root directory, and `src/components`, `src/lib` and `src/types` hold
only code that serves the whole app. A feature file filed in one of those three is a violation even
when it is that feature's only home.

## Where things live

- Gateway calls: the feature's own `lib/` (`catalogue/lib/`, `orders/lib/`, …). The shared HTTP
  instance is `src/lib/gateway.ts`.
- Formatting and domain rules: `@kmodern/contracts`. Persian digits (`toFaDigits`), money
  (`formatToman`), Jalali dates (`formatJalali`, `formatJalaliDateTime`). No component formats a date
  or a price inline.
- Discount labels: a product read carries `discount.label`, already formatted by the gateway
  (`۲۰٪` or a Toman amount). Render it as it arrives. No component appends `%` or `٪` to it, and the
  saving is never recomputed here: the discounted price the gateway sent leads, the original is
  struck beside it.
- Design tokens and composed classes: `@kmodern/ui/tailwind.css`, imported once by
  `src/app/globals.css`. Use `notice-error`, `form-control`, `form-grid`, `text-price` rather than
  repeating the chain.
- Tokens are RTL: use logical properties and `ms-`/`me-`/`ps-`/`pe-` utilities, not `ml`/`mr`.

## Commands

```bash
pnpm --filter @kmodern/store dev          # development server
cd apps/store
npx vitest run                           # the suite needs no database
npx tsc -p tsconfig.json --noEmit         # add `rm -f tsconfig.tsbuildinfo` first for a cold check
npx next build                           # proves the routes still prerender
```

Repo-wide, from the root, `npx turbo run typecheck lint build` run as-is. **`test` and `audit` need a
database**: the gateway's suite is destructive and boots a disposable one through
`scripts/test-db.sh`, and the migration and data-path checks inside the audit do the same. Without
`TEST_DATABASE_URL` exported they fail with a message that says so — that is the environment, not your
change. Run `pnpm run audit` for this repo's audit, never `pnpm audit`: that is pnpm's own
vulnerability scan and answers a different question.

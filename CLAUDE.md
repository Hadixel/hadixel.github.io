# CLAUDE.md

Persian RTL e-commerce monorepo (خانه مدرن — multi-brand home-appliance retailer; Datees and Schuffle
are carried brands). pnpm + Turbobuild workspaces, nine of them, each ranked — see
[`docs/RANKS.md`](docs/RANKS.md).

**Start at [`docs/index.md`](docs/index.md).** It names every document in `docs/`. What follows is the
map that document does not carry.

## The workspaces

| Workspace | What it is |
|---|---|
| `apps/api` | The gateway. The only process that touches the database, so Prisma, the migrations, the generated client and the seed scripts live here. Every write in the system goes through it |
| `apps/store` | The public storefront. Next.js, server-first with islands. Its own entry point is [`apps/store/AGENTS.md`](apps/store/AGENTS.md) |
| `apps/admin` | The operator panel. Next.js, server shell plus a client feature tree. Its own entry point is [`apps/admin/AGENTS.md`](apps/admin/AGENTS.md) |
| `apps/scraper` | The catalogue scraper. Three executables; touches no database — it writes `catalog.json`, which the gateway's seed reads |
| `packages/contracts` | The kernel. Zod contracts plus the canonical formatters (Persian digits, money, Jalali dates) and the Iranian locale data |
| `packages/transport` | `createApiClient(tokenName)` — the one HTTP client both apps use to reach the gateway |
| `packages/ui` | Shared design tokens, composed classes and primitives. Its stylesheet is the single source of the design language |
| `packages/scraper-core` | The scraper's ports and source types, shared with the gateway |
| `packages/config` | Compiler presets only. Build-time; no source imports it |

**No client imports the data tier.** Store and admin speak HTTP to the gateway; `@kmodern/db` and
`generated/prisma` are off limits to them, and the audit fails the attempt.

## Agent skills

### Issue tracker

Local markdown — issues live as files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
`wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Working rules

- **One home per rule.** A behaviour implemented twice is two implementations free to disagree. When
  you find a second copy, delete it and point both call sites at the one that stays.
- **Normalise at the write path**, not in the reader, and not in two places.
- **One root per feature.** `src/lib`, `src/components` and `src/types` hold app-wide code only; a
  feature lives in its own directory under the app's `src`.
- **The gates are commands, not documents.** `npx turbo run audit` answers every mechanical invariant;
  prose restating what it checks drifts within a month. `pnpm run audit` is this repo's script —
  `pnpm audit` is pnpm's own vulnerability scan and answers a different question.
- **Deliberate departures go in [`docs/DEVIATION-REGISTER.md`](docs/DEVIATION-REGISTER.md)** with a
  reason and an answer about whether another repo may copy them.

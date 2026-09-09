# CLAUDE.md

Persian RTL e-commerce monorepo (خانه مدرن — multi-brand home-appliance retailer; Datees and Schuffle are carried brands). pnpm + Turbobuild workspaces: `apps/store` (Next.js storefront), `apps/admin` (Next.js panel), `apps/legacy-store` (Vite legacy), `packages/db` (Prisma/Postgres), `packages/schema` (zod contracts), `packages/adapters`, `packages/ui`.

## Agent skills

### Issue tracker

Local markdown — issues live as files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles used as-is (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

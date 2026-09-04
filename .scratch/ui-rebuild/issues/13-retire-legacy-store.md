# 13 — Retire legacy-store

Type: task
Status: open
Phase: Cleanup

Delete `apps/legacy-store` and absorb anything trivially worth keeping (spec task 13; ADR-0001 decision 7).

## Acceptance

- [ ] Sweep for unique content/patterns worth porting (pages, copy, assets) — port or explicitly discard, noted in this file's Comments.
- [ ] `apps/legacy-store` deleted; removed from `pnpm-workspace.yaml` and `turbo.json` task graph.
- [ ] Dead deps pruned from workspace lockfile (`react-router-dom`, `react-toastify`, vite tooling) — `pnpm install` clean.
- [ ] CONTEXT.md "Storefront" definition stands as the only retail surface.
- [ ] `pnpm build` + `pnpm typecheck` green across remaining workspace.

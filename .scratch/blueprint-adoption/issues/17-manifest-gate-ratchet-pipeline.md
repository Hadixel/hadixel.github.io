# 17: The manifest gate, the ratchet, and the pipeline

**What to build:** the manifest rules become a command too, the metrics that must not go backwards are pinned at today's values so they can only fall, and one pipeline runs every job and blocks. The pipeline is the only place the blueprint stops being a document.

**Blocked by:** 16.

**Status:** done, with the caveat noted below

- [x] A manifest check enforces one version per tool, a root manifest with no runtime dependency, and a peer dependency that also appears as a development dependency
- [x] A ratchet file records each metric with today's value and its target, and each command carries its own exclusions — including the vendored blueprint kit, which would otherwise count as three stray configuration files for ever
- [ ] The colour-literal metric's scope is decided and written down: counted over component source it starts at one for the storefront and zero for the panel, because the six hex values in the panel are a product colour-palette lookup, not styling — **unverified as of 2026-10-01.** `ratchet.json` now carries both `colour-literal-store` and `colour-literal-admin` (each seed 0), which closes the "no metric entry at all" half of the original gap: the scope is recorded where the metric is read, and the command is the metric per §15.3 rule 1. What keeps this box unticked is its first figure — it says the metric "starts at one for the storefront", and it measures **0**, so the claim is false and a tick would certify it as verified. The reason the figure is wrong matters: an earlier note in this ticket claimed the cited `apps/store/src/components/product-buy-box.tsx` "no longer exists", which was false — it moved to `apps/store/src/catalogue/components/product-buy-box.tsx` when the catalogue feature got its root, and its line 48 still hardcodes a client-side low-stock threshold (`stock - reserved <= 3`). A moved path was never evidence that the metric had dropped, and the box turns on the count, not on where a file lives. The count is **0 on both sides**: `grep -rEoh "#[0-9a-fA-F]{3,8}" --include='*.ts' --include='*.tsx' apps/store/src` and the same over `apps/admin/src` each return nothing, and over *all* extensions the storefront returns exactly 1 (`app/globals.css`, excluded by the `--include` filters) while the panel returns 0 — the six product-palette values the box names are gone from `apps/admin/src` entirely, not merely relocated within it. So the panel/store split this box describes is true today by measurement rather than by decision, which is why the box stays unticked: a number that reached 0 because its subject was deleted is not a scope anybody recorded. The scope itself is now written down in this ticket's Comments, moved here from the disposable adoption plan rather than deleted with it.
- [x] The route-directory and app-root metrics are seeded at the values measured today, so the shape phase has a number to drive to zero
- [x] The metrics that must not return are recorded: no stray lint or format configuration outside the root, and no suppression
- [x] The suppression metric has no entry to hide behind, and a suppression carrying a reason still counts
- [x] One pipeline runs install, typecheck, lint, test, audit and build, and every job blocks
- [ ] The gateway's suite runs in its own job against a disposable database pinned to the production major version — **unverified as of 2026-10-01.** The `test` job in `.gitlab-ci.yml` is its own job with a disposable `postgres:$POSTGRES_MAJOR` service (`POSTGRES_MAJOR: "16"`), so the disposable half holds; the pin is not the *production* major. `docs/adr/0005-pipeline-triggers.md:25-30` records it as a guess — "§16.2 asks for the *production* major version. This repo documents no production version anywhere" — and no doc, env example or compose file names one (`grep -rni postgres docs README.md` returns no production version).
- [x] The pipeline's trigger branches are decided and recorded in an architecture decision record

## Comments

`scripts/audit.sh` is the manifest gate: lines 107-110 loop `typescript` and `vitest` over
`$MANIFESTS` and fail if a workspace declares them (0 workspace manifests declare `typescript` today),
lines 116-118 run `node -e 'process.exit(m.dependencies?1:0)'` against the root manifest, and line 218
runs `npx manypkg check`, whose `INVALID_DEV_AND_PEER_DEPENDENCY_RELATIONSHIP` rule
(`@manypkg/cli@0.25.1/dist/manypkg-cli.js:198`) is the peer-plus-devDependency half of that box — and it
is live here: `packages/transport` (`next`) and `packages/ui` (`react`, `react-dom`) each declare the
same package as a peer and a development dependency.

`node scripts/audit-ratchet.mjs` exits 0 with all 7 metrics at their seeds, including
`client-route-files-only` and `app-root-stray-entry` (both printed `0` by their `--metric` modes), which
is the seed-at-today's-value claim. `stray-tool-config`'s command excludes `docs/blueprint` and
`.claude/worktrees`, and `suppression`'s command has no path exclusion at all — a suppression with a
trailing reason is still counted, because the grep matches `boundaries-ignore` wherever it appears.

`.gitlab-ci.yml` declares the six stages in blueprint order with no `allow_failure` anywhere in the file.
ADR-0005 decides the branches (platform default: merge requests plus the default branch).

The two unticked boxes are both about decisions the tree cannot back. The colour-literal scope was
never written into `ratchet.json`, so the metric's reach is defined by its command's `--include`
filters rather than by a decision anyone recorded — and the decision it implies (the storefront's
literals belong in the token layer, the panel's six are a product palette) is true today only
because both counts happen to read 0. The pipeline's Postgres pin is 16 because the repo's own
tooling is built on 16, which ADR-0005 itself calls a guess.

**Update (2026-10-01).** The colour-literal half of that paragraph is now fixed rather than
reported: `ratchet.json` carries `colour-literal-store` as well as `colour-literal-admin`, so the
scope is written where the metric is read, and the correction block below carries the decision. What
remains unticked is narrower than "the scope was never recorded" — it is that **the box's own figure
is wrong**, and a box whose stated number is false does not get ticked by fixing everything around
it. The box says the metric "starts at one for the storefront"; it measures 0, and it measures 0
because the literals moved to the token layer rather than because a component was deleted. Ticking
it would record that claim as verified. The Postgres pin remains a genuine documentation gap and
was left alone: ADR-0005 calls its own number a guess, and the production version is a decision the
repo cannot make for itself.

**Correction (2026-10-01).** An earlier version of this ticket's colour-literal note said
`apps/store/src/components/product-buy-box.tsx` "no longer exists". That was wrong: the file moved to
`apps/store/src/catalogue/components/product-buy-box.tsx` during P5, and line 48 still hardcodes the
`<= 3` low-stock threshold. The storefront's colour-literal count is 0 because the literals moved to
the token layer, not because the component was deleted. The scope decision has been moved here from
the disposable adoption plan, which this phase deletes:

> **Colour-literal scope.** The metric counts hex colour literals in TypeScript source under each
> client app, and nothing else: `grep -rEoh "#[0-9a-fA-F]{3,8}" --include='*.ts' --include='*.tsx'
> <app>/src`. It deliberately does **not** count `globals.css` or any other stylesheet, because §11.1's
> one token layer is where a colour is allowed to be written down — a literal in a stylesheet is the
> token layer doing its job, and counting it would fail the gate for obeying the rule. Measured
> 2026-10-01: the panel reads **0** over every extension under `apps/admin/src`, and the storefront
> reads **0** over `.ts`/`.tsx` and **1** over all files — that one hit being
> `apps/store/src/app/globals.css`, which the `--include` filters exclude by construction. So both
> apps now read 0 and both ratchet seeds sit at their true measured value.
>
> The panel's seed was originally justified by a judgement that is now **historical, not current**:
> the six hex values that were in `apps/admin/src` were a product colour-palette lookup rather than
> styling, so `colour-literal-admin` was seeded at 0 with that judgement recorded here instead of
> encoded as an allowlist — an allowlist of hex values being a list nobody re-reads. That palette
> lookup no longer exists under any colour-named module in `apps/admin/src`, so the count reached 0
> on its own rather than by an allowance absorbing it. The judgement is kept because it is the
> reason a zero seed was defensible at the time, and because the same question returns the moment a
> product colour is written down again.
>
> `colour-literal-store` exists now, seeded at 0 — its absence was the gap this box named, closed
> 2026-10-01 alongside the scope decision being recorded here. It measures the same command over
> `apps/store/src`, so the two clients are compared by one rule rather than by one having a metric
> and the other not. An earlier version of this note proposed seeding it at **1**, "so the number
> has to be argued down rather than discovered"; that is wrong and has been corrected, because
> `scripts/audit-ratchet.mjs` states that seeds "are measured, not aspirational, so a clean run is a
> fact" and treats a measurement below its seed as `fell` with an instruction to lower the seed in
> the same commit. A seed above the measured count is a ratchet pre-failed by construction: it
> reports a fall that never happened. The storefront's literals live in `packages/ui` — three accent
> components (`accents/shiny-text.tsx`, `accents/star-border.tsx`) and their README — and in the
> token layer, not in app source, which is exactly where §11.1 puts them, so 0 is the honest
> baseline and the argument happens when a literal first appears under `apps/store/src`.

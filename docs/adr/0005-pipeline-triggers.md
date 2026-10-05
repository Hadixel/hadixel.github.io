# ADR-0005: What the pipeline runs, and when

**Status:** accepted · **Date:** 2026-10-01 · **Blueprint:** §16.2 · **Register:** [DEVIATION-REGISTER](../DEVIATION-REGISTER.md) row 6

## Context

§16.2 puts the whole enforcement layer in one pipeline, in the order the blueprint names —
`install → typecheck → lint → test → audit → build` — and states that every job blocks. The blueprint
also says which branches run it is a decision an ADR must make, and that landing a gate red is what
makes people ignore gates, so the ordering only works because the violations were fixed before the
gates landed.

`.gitlab-ci.yml` already declares the six stages and blocks them in order. Two things it deliberately
did not decide are recorded here.

## Decision

**Branches: the platform default.** Merge requests and the default branch. No bespoke list, no
skip-if-draft, no path filters. The default is chosen over an explicit list because an explicit list
is one more thing that goes stale: a new long-lived branch would silently stop being covered, and the
failure mode of that is a gate nobody runs. The cost is that every merge request pays for the gateway
suite's disposable database, which is why the suite is its own job with its own service image rather
than part of the unit-test job.

**Postgres: pinned to major 16, and that pin is a guess.** §16.2 asks for the *production* major
version. This repo documents no production version anywhere — no doc, no env example, no compose file
names one — so the image is pinned to `postgres:16`, the major this repo's own tooling is built on
(`PGBIN=/usr/lib/postgresql/16/bin` in `scripts/test-db.sh` and `scripts/check-migrations.sh`). If
production is not 16, that number changes in three places and this ADR changes with it. It is recorded
here as an open item rather than presented as a decision that was made.

## Consequences

- A merge request is blocked by the gateway suite, which needs its disposable database to boot. That
  is seconds, not minutes, and it is the only job that can touch a database.
- Every job regenerates the Prisma client before reading gateway source, because
  `apps/api/src/generated` is gitignored and a fresh checkout has nothing there.
- pnpm comes from the root `packageManager` through corepack rather than a second pin in CI, so the
  two cannot drift. `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` is set because corepack's first-run prompt
  would hang a non-interactive job.

## When to revisit

When the production Postgres version is documented, this ADR's version line becomes a decision rather
than a mirror of the local tooling.

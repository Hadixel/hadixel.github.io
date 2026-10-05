# Tier ranks

§4: *an unranked workspace is where a second architecture grows.* This is the rank table, written
once, beside the configuration that enforces it — `turbo.json`'s `boundaries` block, which reads the
same ranks from each workspace's own `turbo.json` `tags` and fails on an edge they do not allow.

Every workspace is ranked. There are nine: four apps, three packages, the kernel, and one
build-only workspace that holds JSON.

| Rank | Tier | Workspace | Name | May depend on | Enforced by |
|---|---|---|---|---|---|
| 4 | kernel | `packages/contracts` | `@kmodern/contracts` | nothing in the workspace | `turbo boundaries` (`kernel.dependencies: []`) + `no-kernel-dependency` in `.dependency-cruiser.js` |
| 3 | package | `packages/transport` | `@kmodern/transport` | the kernel | `turbo boundaries` (`pkg.dependencies: ["kernel"]`) |
| 3 | package | `packages/ui` | `@kmodern/ui` | the kernel | same |
| 3 | package | `packages/scraper-core` | `@kmodern/scraper-core` | nothing in the workspace | same — it declares no `@kmodern` dependency, and the rule permits it |
| 2 | application | `apps/api` | `@kmodern/api` | packages | `turbo boundaries` (`app.dependencies`) + `no-{app}-imports-another-app` per app |
| 2 | application | `apps/store` | `@kmodern/store` | packages | same, + `no-client-to-data-tier` |
| 2 | application | `apps/scraper` | `@kmodern/scraper` | packages | same |
| 2 | application | `apps/admin` | `@kmodern/admin` | packages | same |

## Reading the table

Rank 1 is the kernel: pure domain contracts with no dependency on anything. Its one recorded exception
is its `zod` and `sanitize-html` runtime dependency, encoded as a rule that can still fire — see
[DEVIATION-REGISTER](DEVIATION-REGISTER.md) row 3.

Rank 2 is a package: it may sit on the kernel and on nothing else. A package that imports an app is an
app wearing a package's name, which is why `no-tier2-to-app` is a separate error rule from the turbo
boundary — the turbo rule reasons about package names, the cruiser rule reasons about file paths, and
either one alone misses edges the other sees.

Rank 3 is an application: it may sit on packages and on nothing else. `app.dependents` is empty
because §5.1 gives an app no `exports` field — nothing imports an app — and a cycle needs two edges,
so both directions are named.

`packages/config` sits off the graph: it holds compiler JSON, is used by the build only, and no source
imports it.

## Why the rank lives next to the enforcement

§4's warning is that an unranked workspace is where a second architecture grows. A table in a
document cannot stop that, because nothing checks it. This one is not prose: `turbo boundaries` reads
the tags, so adding a workspace without a rank fails the audit rather than joining the graph
unranked.

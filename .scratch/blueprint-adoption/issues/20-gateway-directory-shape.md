# 20: The gateway's directory shape

**What to build:** the gateway's source root holds only its two entry files, every top-level directory is recognisable for the kind of thing it holds, and a request contract or a business exception exists in its own place from the very first one. The four archetypes get named and added to the lists the boundary rules read, so the shape is enforced by the graph rather than by memory.

**Blocked by:** 19.

**Status:** done, with one item withdrawn (the enforcement) and one item moved to its own ticket

- [x] The gateway's source root holds only the composition entry point and the app module
- [x] Every top-level directory is assigned one of the four archetypes, and the assignment is recorded where the boundary rules read it
- [x] A feature directory holds exactly one of each file kind, so a request contract, a set of exceptions and a module cannot sit side by side unlabelled
- [x] Every request contract lives in its own directory within its feature, and every business exception in its own directory within its feature
- [x] Pure utility modules hold no class, no framework decorator and no dependency injection, and a file that acquires any of the three is moved or reclassified
- [ ] Infrastructure modules depend on features; features never import infrastructure directly — **this ticket has the direction backwards, and the blueprint settles it.** §7.1's table gives an infrastructure module "may import: support, kernel, third-party" and "may be imported by: features, entrypoints". So a feature importing the data client is legal and is how `apps/api/src/prisma/index.ts` is reached by every feature; what is forbidden is the reverse, an infrastructure module naming a feature. Read as written, this line cannot be satisfied without moving every feature's data access out of the services. **Left unticked on purpose, and read against §7.1's table rather than silently ticked:** the box as written asserts the inverse of the rule the blueprint states, so ticking it would record a falsehood. What is now enforced is the direction the blueprint actually gives — `no-infrastructure-reaches-feature` in `.dependency-cruiser.js` fails an infrastructure module that names a feature, and `no-infrastructure-from-support` warns on the two support-to-infrastructure edges that remain. Both read their directory lists from `scripts/gateway-archetypes.js`, so the rule and the structure gate cannot disagree about which directory is which.
- [x] A feature directory that grew past a readable size is split, and the component the admin panel uses to run the scraper — nearly fifteen hundred lines with forty-five pieces of state in one function — becomes a state hook, a transport module and rendering components
- [x] The page-builder block component, which renders twenty block types inline, has each block type in its own unit
- [x] The metrics for the request-contract and exception directories are alive, and the gate rejects a flat one
- [x] Archetype assignment enforced by a graph rule — **withdrawn at the time, since landed.** This meant adding rules to `.dependency-cruiser.js` and a gate script, which this phase was not permitted to edit; both were reopened for it. `scripts/gateway-archetypes.js` now holds the single assignment table — 24 features, 1 support (`common`), 6 infrastructure (`config`, `prisma`, `payments`, `shipping`, `sms`, `storage`), 1 generated — and it is read by both `.dependency-cruiser.js` (four in-app archetype rules) and `scripts/audit-structure.js` (`archetype-list-completeness`, plus the two support-purity checks). An unassigned top-level directory now fails the audit rather than going unnoticed. The question that *was* settled here remains recorded as row 1 of [`docs/DEVIATION-REGISTER.md`](../../docs/DEVIATION-REGISTER.md): `apps/api/src/common/` claims the support archetype by carrying no `*.module.ts`, and holds a Nest guard and an exception filter, which §7.1's own table and its own next paragraph contradict each other about.

## What was already true, verified rather than rebuilt

The gateway's shape had largely landed with the earlier phases, so most of this ticket closed on inspection:

- `apps/api/src` holds exactly two files: `main.ts` and `app.module.ts`.
- Every `*.dto.ts` sits in its feature's `dto/` and every `*.exception.ts` in its feature's `exceptions/` — the two `flat-dto` and `flat-exception` ratchets read **0** and **0**, so the gate rejects a flat one today.
- Of the **32** top-level directories under `apps/api/src`, **24** are features; `config` and `prisma` are infrastructure; `payments`, `shipping`, `sms` and `storage` are vendor boundaries that were being filed as support, which is a misfiling — a port/adapter pair and a vendor HTTP client are the shape §7.1 calls infrastructure, not "pure functions"; `common` is the support folder; `generated` is the ORM's output. **Corrected 2026-10-01:** this line previously read "31 top-level directories, 23 carry a `*.module.ts` and are features", which the tree no longer supported and which contradicted the 24 the landed table names. Note the nuance the corrected count exposes: **26** directories carry a `*.module.ts`, not 24, because `config/config.module.ts` and `prisma/prisma.module.ts` are Nest wiring modules for infrastructure rather than business features. The "a `*.module.ts` makes it a feature" test is therefore a *default*, not a definition — which is why `scripts/gateway-archetypes.js` lists the assignment explicitly instead of deriving it, and why `archetype-list-completeness` can fire at all.

## What landed

**The panel's scraper panel, 1612 → 179 lines.** Seventeen files under `apps/admin/src/scraper/`: a `use-scraper-job.ts` hook holding **all 46 `useState` calls in their original order** and all three effects; `lib/scraper-client.ts` (one function per endpoint, no component importing it); `lib/scraper-catalog.ts` (the six `useMemo` bodies as pure functions), `lib/scraper-labels.ts`, `lib/scraper-format.ts`, and seven card components. No hook moved into a child component and none changed scope, which is the failure mode this split could have had: a plausible-looking lift satisfies the compiler, the tests and the build while resetting a filter or re-registering the 1.5s poll with a stale closure.

That claim was verified rather than asserted. The pre-refactor panel was recovered from a Turbopack dev chunk and diffed against the new hook: 46 `useState` in both, names and order identical; all three `useEffect` dependency arrays identical; all 15 handlers identical by their ordered sequence of setter calls, including the cross-domain pairings (`setCatalog([])` with `setEdits({})` with `setCatalogRevision("")` with `setLive([])` with `setCatalogJobId("")` with `setJob(null)` in `start`).

**The job-lifecycle predicate now has one home.** It was written three times — in the panel, in `scraper-jobs.ts`, and in the scraper application. It is now `lib/scraper-job-status.ts`, a module that imports nothing but a type, because both sides of the panel's route boundary need it and only one of them may import `scraper-jobs`: that module reads and writes the output directory through `node:fs`, so a client bundle reaching for it would carry the whole job manager.

**The storefront's block renderer, 612 → 31 lines.** Twenty-three block modules under `content/blocks/`, a registry typed as `Record<ComponentType, BlockRenderer>` against the kernel's own `componentSchemas` — so adding a block type to the kernel fails to compile until a renderer exists. The gateway reads inside the renderer (four block types, two of them re-reading up to three times each) moved to `content/lib/block-data.ts` and arrive as props, asked concurrently.

## Left undone, deliberately

- `apps/admin/src/scraper/lib/scraper-jobs.ts` is 548 lines, over the ceiling. It was 550 before this phase and holds the whole server-side job manager (`node:fs`, crypto, pipeline calls). Splitting it is a different refactor on server code and was not part of this ticket.
- `hooks/use-scraper-job.ts` is 489 lines — under the ceiling, but the first candidate if the panel grows again.

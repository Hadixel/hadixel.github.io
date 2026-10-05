# 23: The documentation system and the deviation register

**What to build:** the documentation surface becomes findable and true. One index links every document, every surface has exactly one entry point, and each client's rendering approach is written down — because the two clients currently have opposite mutation approaches, both internally consistent, and neither documented anywhere. The four deliberate departures from the blueprint are recorded with a reason and an answer about whether they may be copied, so they stop reading as oversights.

**Blocked by:** 20, 21.

**Status:** done

- [x] A documentation index links every document in the tree; today none of the seven existing documents is linked from anywhere
- [x] Each surface has exactly one documentation entry point, and the alias files that duplicate the name are gone
- [x] Each client's entry point is a hand-written index into its bounded-context documents, not a file a tool regenerates on every dev run
- [x] Each client's rendering approach is recorded: how data is read, how mutations travel, and what invalidates a view
- [x] The tier rank table exists as a document, next to the configuration that enforces it
- [x] The four deliberate deviations each have a register row: the panel's rendering approach, the storefront's decision to serve every public route dynamically, the kernel's runtime dependencies, and the two surviving component stacks
- [x] The storefront's decision to serve dynamically has an architecture decision record stating the reason and its cost, because it currently reads as an oversight rather than a decision
- [x] The tracked environment file that holds the database connection string is untracked, and the example files are the documented contract
- [x] The adoption plan itself is deleted, because everything it enforces now lives in the task configuration, the boundary rules, the ratchet and the pipeline — **done 2026-10-01.** The disposable adoption plan is deleted from `docs/`, per the rule its own header stated. Its row is out of [`docs/index.md`](../../docs/index.md), and ADR-0003's pointer to "Ticket 12 of" that plan now names [`.scratch/blueprint-adoption/issues/12-admin-writes.md`](12-admin-writes.md) directly, because a ticket is the durable record and a disposable plan is not. Everything the plan enforced has a home: `turbo.json` carries the tasks and the boundary tags, `.dependency-cruiser.js` carries the forbidden rules, `ratchet.json` carries the seven metrics, and `.gitlab-ci.yml` carries the six blocking stages. The gate withdrawal this box waited on is lifted too — `ratchet.json` and `scripts/audit.sh` were reopened for the last phase, so `client-route-files-only` and `app-root-stray-entry` are seeded at a measured 0 and the three structure gates run as hard `ok`/`FAIL` checks. The one decision that lived only in the plan — the colour-literal metric's scope — was moved into [ticket 17](17-manifest-gate-ratchet-pipeline.md) rather than deleted with it, so that nothing the plan decided died with the plan. The audit findings it was built from survive at `.scratch/blueprint-audit/findings-register.md`.

## What landed

- `docs/index.md` — every document in `docs/`, grouped by what it answers, with the per-surface entry points. It also says which of the two documents named "deviation register" is this repo's, because `.dependency-cruiser.js` and `.gitlab-ci.yml` cite a bare "DEVIATION-REGISTER row 1" and those citations mean this repo's file.
- `docs/RANKS.md` — all nine workspaces ranked, beside `turbo.json`'s `boundaries` block, which reads the same ranks from each workspace's own tags. §4 warns that an unranked workspace is where a second architecture grows; a table nothing checks cannot stop that, and this one can.
- `docs/DEVIATION-REGISTER.md` — eight rows. Rows 1 and 2 keep their numbers because the cruiser's header and the CI file cite them. Row 2 is marked closed: the generated-path invariant it described was cleared by P4b.
- `docs/adr/0004-storefront-dynamic-rendering.md`, `docs/adr/0005-pipeline-triggers.md`, `docs/adr/0006-rendering-dialects.md` — the three decisions §16.2 and §9.2 require be written down. The pipeline ADR is explicit that the Postgres major is a mirror of local tooling, not a decision about production, because this repo documents no production version.
- `apps/store/AGENTS.md`, `apps/admin/AGENTS.md` — hand-written indexes under the block `next dev` regenerates, so the entry point is an index and not tool output.
- `CLAUDE.md` — the root entry point no longer advertises `apps/legacy-store`, `packages/db` and `packages/adapters`, none of which exists, and omits the three workspaces that do.

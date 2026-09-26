# 17: The manifest gate, the ratchet, and the pipeline

**What to build:** the manifest rules become a command too, the metrics that must not go backwards are pinned at today's values so they can only fall, and one pipeline runs every job and blocks. The pipeline is the only place the blueprint stops being a document.

**Blocked by:** 16.

**Status:** ready-for-agent

- [ ] A manifest check enforces one version per tool, a root manifest with no runtime dependency, and a peer dependency that also appears as a development dependency
- [ ] A ratchet file records each metric with today's value and its target, and each command carries its own exclusions — including the vendored blueprint kit, which would otherwise count as three stray configuration files for ever
- [ ] The colour-literal metric's scope is decided and written down: counted over component source it starts at one for the storefront and zero for the panel, because the six hex values in the panel are a product colour-palette lookup, not styling
- [ ] The route-directory and app-root metrics are seeded at the values measured today, so the shape phase has a number to drive to zero
- [ ] The metrics that must not return are recorded: no stray lint or format configuration outside the root, and no suppression
- [ ] The suppression metric has no entry to hide behind, and a suppression carrying a reason still counts
- [ ] One pipeline runs install, typecheck, lint, test, audit and build, and every job blocks
- [ ] The gateway's suite runs in its own job against a disposable database pinned to the production major version
- [ ] The pipeline's trigger branches are decided and recorded in an architecture decision record

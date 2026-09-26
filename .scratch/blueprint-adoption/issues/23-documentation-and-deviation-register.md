# 23: The documentation system and the deviation register

**What to build:** the documentation surface becomes findable and true. One index links every document, every surface has exactly one entry point, and each client's rendering approach is written down — because the two clients currently have opposite mutation approaches, both internally consistent, and neither documented anywhere. The four deliberate departures from the blueprint are recorded with a reason and an answer to whether they may be copied, so they stop reading as oversights.

**Blocked by:** 20, 21.

**Status:** ready-for-agent

- [ ] A documentation index links every document in the tree; today none of the seven existing documents is linked from anywhere
- [ ] Each surface has exactly one documentation entry point, and the alias files that duplicate the name are gone
- [ ] Each client's entry point is a hand-written index into its bounded-context documents, not a file a tool regenerates on every dev run
- [ ] Each client's rendering approach is recorded: how data is read, how mutations travel, and what invalidates a view
- [ ] The tier rank table exists as a document, next to the configuration that enforces it
- [ ] The four deliberate deviations each have a register row: the panel's rendering approach, the storefront's decision to serve every public route dynamically, the kernel's runtime dependencies, and the two surviving component stacks
- [ ] The storefront's decision to serve dynamically has an architecture decision record stating the reason and its cost, because it currently reads as an oversight rather than a decision
- [ ] The tracked environment file that holds the database connection string is untracked, and the example files are the documented contract
- [ ] The adoption plan itself is deleted, because everything it enforces now lives in the task configuration, the boundary rules, the ratchet and the pipeline

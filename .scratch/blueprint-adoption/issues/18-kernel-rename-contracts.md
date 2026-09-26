# 18: `packages/schema` → `packages/contracts`

**What to build:** the kernel is renamed for what it holds rather than for the mechanism it uses, and every call site follows. A package named after its contents is the point: the next engineer looking for the shared contracts should find them under a name that says so. This is a wide mechanical change, so it runs expand–contract: the new package appears beside the old, call sites move in batches sized by blast radius, and the old one is deleted last.

**Blocked by:** 17.

**Status:** ready-for-agent

- [ ] The kernel package is named for what it holds, and its description says so
- [ ] Every call site is repointed in batches — one per consumer workspace, not one enormous commit — and the typecheck is green after each batch
- [ ] The old package name no longer appears in any manifest or source file
- [ ] Its declared entry points still resolve, and each one has a consumer
- [ ] The kernel's runtime dependencies are recorded as a named allowance in the gate configuration, because the blueprint both forbids a tier-one runtime dependency and requires a schema library in the kernel — a suppression would be the wrong instrument
- [ ] The canonical formats the kernel declares are reachable by their intended callers, so the money conversion, the phone contract and the city normaliser each have at least one caller

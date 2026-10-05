# 16: The import graph gate

**What to build:** the structural rules become a command that fails. Cycles at file and folder scope, an import that crosses a tier upward, a source file that reaches into an application entry point, and any new client-to-database edge all fail the build — including a type-only import, which is exactly how the edge came back four times in this repo before it was closed.

**Blocked by:** 15.

**Status:** done, with the caveat noted below

- [x] A tier rank is written down for every workspace, because an unranked workspace is where a second architecture grows
- [x] The gate reports a non-zero count of files it actually examined, and fails if that count is zero — a routine compiler bump otherwise makes the gate print a green tick while checking nothing
- [x] Cycles are checked at folder scope as well as file scope; the file-level scope alone cannot see two features importing each other
- [x] Type-only imports are resolved and checked, not skipped
- [x] Test files are excluded from the graph, since they are allowed to reach across features
- [x] The four in-application directory archetypes are encoded: entry points, features, infrastructure modules and support folders, each with its own rank
- [x] File-kind rank is encoded, so a request contract cannot sit beside a module and be mistaken for one
- [x] Workspace tags and cross-package cycles are checked by the task runner, and the ignore directive they own requires a stated reason on the same line
- [ ] A test proves the gate bites: a deliberate client-to-database import is rejected, and a deliberate cycle is rejected — **unverified as of 2026-10-01.** the only gate-bites test in the tree is `apps/api/tests/generated-index.test.ts`, which writes a second generated-path importer and asserts `generated-prisma-outside-data-client-index` fires; `grep -rln "depcruise|dependency-cruiser|no-client-to-data-tier|no-file-cycle" --include=*.test.* apps packages scripts` returns that file and no other, and `scripts/` has no `audit-depcruise.test.js`. Nothing writes a deliberate client-to-database edge or a deliberate cycle, so this box does not hold.
- [x] The compiler version the gate supports is pinned at the root and recorded next to the rule, so a future bump is a decision rather than a surprise

## Comments

Every box but the ninth is proved by configuration plus a green run, not by prose: `npx turbo boundaries` exits 0 with "Checked 567 files in 9 packages, no issues found", and each of those nine workspaces carries a `tags` entry in its own `turbo.json` (`kernel`, `pkg`, `app`, `build-only`) that `docs/RANKS.md` tabulates. `node scripts/audit-depcruise.mjs` exits 0 printing "698 modules cruised, no rule violated", and the wrapper's `if (cruised === 0) process.exit(1)` is the assertion the box asks for.

The two cycle scopes are two separate rules rather than one rule with a wider net — `no-file-cycle` at `scope: "module"` and `no-folder-cycle` at `scope: "folder"` in `.dependency-cruiser.js`. Type-only resolution was measured rather than read off a comment: cruising `apps packages` with `tsPreCompilationDeps: true` (the shipped value) reports 698 modules and 1895 dependency edges; the same cruise with it flipped to `false` in a throwaway config reports 688 modules and 1464 edges, so 10 modules and 431 edges — type-only imports included — are reachable only when the option is on. Test exclusion is provable from the output rather than from the pattern: parsing the cruise JSON for modules matching `/\.(test|spec)\.tsx?$/` returns 0.

The archetypes are one table read by two gates: `scripts/gateway-archetypes.js` exports `ENTRYPOINT_FILES` (rank 0's `main.ts`/`app.module.ts`, both present), `SUPPORT_DIRS` "Rank 0", `INFRASTRUCTURE_DIRS` "Rank 1", `FEATURE_DIRS` "Rank 2" and `GENERATED_DIRS`; `.dependency-cruiser.js` requires it to build `no-support-reaches-feature`, `no-infrastructure-from-support`, `no-infrastructure-reaches-feature` and `no-support-imports-its-own-module`, and `node scripts/audit-structure.js` exits 0 reporting "24 feature, 1 support, 6 infrastructure, 1 generated". File-kind rank is `no-lower-kind-imports-higher` and `no-kind-imports-controller` in the cruiser plus `checkFeatureFileKinds` in the structure gate.

The ninth box is the one real gap, and it is a missing test rather than a wrong claim: the rules exist and the wrapper asserts a non-empty cruise, but the only test that proves a depcruise rule bites is scoped to the §8 index rule. A `no-client-to-data-tier` probe and a cycle probe would close it; nothing else in the tree substitutes for them.

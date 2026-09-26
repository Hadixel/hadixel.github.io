# 03: One version per tool, and a documented environment for every variable

**What to build:** bumping the compiler, the linter or the test runner is a one-line change in one file, not seven. And every environment variable the code reads is written down somewhere, with its tier — so a new machine, a new teammate and a new deployment all learn the same contract instead of reverse-engineering it from the code.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] The compiler, the linter and the test runner are declared in the root manifest only; no workspace manifest declares them
- [ ] Every workspace that shares a dependency declares the identical version range, so no two manifests disagree
- [ ] The UI runtime is pinned to a single instance through the root overrides block, because two copies break hooks
- [ ] The component library declares the UI runtime as a dev dependency as well as a peer, so it type-checks and tests alone
- [ ] A committed example environment file exists at the root and at each app root, listing every variable the code actually reads
- [ ] Each variable in those files is labelled with its tier: available at build, read at runtime, or set only in continuous integration
- [ ] The one variable that is currently reachable at build time — the database connection string — is documented as runtime-only, and the change that enforces that is tracked rather than silently documented

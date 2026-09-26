# 16: The import graph gate

**What to build:** the structural rules become a command that fails. Cycles at file and folder scope, an import that crosses a tier upward, a source file that reaches into an application entry point, and any new client-to-database edge all fail the build — including a type-only import, which is exactly how the edge came back four times in this repo before it was closed.

**Blocked by:** 15.

**Status:** ready-for-agent

- [ ] A tier rank is written down for every workspace, because an unranked workspace is where a second architecture grows
- [ ] The gate reports a non-zero count of files it actually examined, and fails if that count is zero — a routine compiler bump otherwise makes the gate print a green tick while checking nothing
- [ ] Cycles are checked at folder scope as well as file scope; the file-level scope alone cannot see two features importing each other
- [ ] Type-only imports are resolved and checked, not skipped
- [ ] Test files are excluded from the graph, since they are allowed to reach across features
- [ ] The four in-application directory archetypes are encoded: entry points, features, infrastructure modules and support folders, each with its own rank
- [ ] File-kind rank is encoded, so a request contract cannot sit beside a module and be mistaken for one
- [ ] Workspace tags and cross-package cycles are checked by the task runner, and the ignore directive they own requires a stated reason on the same line
- [ ] A test proves the gate bites: a deliberate client-to-database import is rejected, and a deliberate cycle is rejected
- [ ] The compiler version the gate supports is pinned at the root and recorded next to the rule, so a future bump is a decision rather than a surprise

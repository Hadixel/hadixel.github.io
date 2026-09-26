# 01: One `packages/config` base and one root lint/format config

**What to build:** every workspace in the monorepo compiles under the same rules, declared in one place, and the whole repo — including the kernel and the two libraries that have never been linted — passes a single lint and format configuration owned by the root. Today each workspace hand-copies its own compiler settings and there is no linter at all, so a rule tightened in one place silently means something different in another.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A `packages/config` workspace holds one base compiler configuration plus one flavour per app type (browser app, React component library, Node library), and no project references and no `composite`
- [ ] Every workspace compiler config is an `extends` plus local keys only — no workspace restates a compiler flag
- [ ] The compiler, the linter and the test runner are declared in the root manifest only, and the root manifest still has zero runtime dependencies
- [ ] One root lint config, with an explicit rule block per workspace so each kind of code is linted under its own rules, and its type-aware service spanning every workspace
- [ ] One root format config, whose ignore list keeps the vendored blueprint kit out of repo formatting
- [ ] `pnpm turbo run lint` is green across every workspace
- [ ] `grep -L '"extends"' apps/*/tsconfig.json packages/*/tsconfig.json | wc -l` prints 0
- [ ] `grep -rn '"typescript"' package.json apps/*/package.json packages/*/package.json | wc -l` prints 1
- [ ] `find . -mindepth 2 \( -name "*lint.config.*" -o -name ".prettierrc*" -o -name "prettier.config.*" \) | grep -v node_modules | grep -v docs/blueprint | wc -l` prints 0
- [ ] No workspace manifest declares a `pre` or `post` lifecycle script, checked by reading each manifest's `scripts` object rather than by grep — a pattern like `"(pre|post)[a-z:]+"` also matches the dependency named `prettier`, and a check that cannot fail is not a check
- [ ] Existing source files are not reformatted by this change; formatting is applied to changed files only

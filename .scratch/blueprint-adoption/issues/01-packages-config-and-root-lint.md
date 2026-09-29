# 01: One `packages/config` base and one root lint/format config

**What to build:** every workspace in the monorepo compiles under the same rules, declared in one place, and the whole repo — including the kernel and the two libraries that have never been linted — passes a single lint and format configuration owned by the root. Today each workspace hand-copies its own compiler settings and there is no linter at all, so a rule tightened in one place silently means something different in another.

**Blocked by:** None (can start immediately).

**Status:** done, with one caveat recorded below

- [ ] A `packages/config` workspace holds one base compiler configuration plus one flavour per app type (browser app, React component library, Node library), and no project references and no `composite`
- [ ] Every workspace compiler config is an `extends` plus local keys only — no workspace restates a compiler flag
- [ ] The compiler, the linter and the test runner are declared in the root manifest only, and the root manifest still has zero runtime dependencies
- [ ] One root lint config, with an explicit rule block per workspace so each kind of code is linted under its own rules, and its type-aware service spanning every workspace
- [ ] One root format config, whose ignore list keeps the vendored blueprint kit out of repo formatting
- [ ] `pnpm turbo run lint` is green across every workspace
- [ ] `grep -L '"extends"' apps/*/tsconfig.json packages/*/tsconfig.json | wc -l` prints 0
- [ ] `grep -rn '"typescript"' package.json apps/*/package.json packages/*/package.json | wc -l` prints 1
- [ ] `find . -mindepth 2 \( -name "*lint.config.*" -o -name ".prettierrc*" -o -name "prettier.config.*" \) | grep -v node_modules | grep -v docs/blueprint | wc -l` prints 0
- [x] No workspace manifest declares a `pre` or `post` lifecycle script, checked by reading each manifest's `scripts` object rather than by grep — a pattern like `"(pre|post)[a-z:]+"` also matches the dependency named `prettier`, and a check that cannot fail is not a check

## What closing this turned up, and the one caveat

The `lint` task did not exist. There was one root `eslint.config.mjs`, one root `lint` script, no
per-app configs and no per-app lint scripts — and nothing in the task graph invoked any of it, so the
repository was configured to be linted by something that never ran. A config no task reaches is worse
than no config: it reads as covered.

Three things had to be true before `turbo run lint` could say anything:

- **A root task, not a per-workspace one.** Declaring `"lint"` in `turbo.json` made turbo look for the
  script in every workspace, find none, and report "no tasks were executed" while appearing to have
  run. The `//#` prefix is what makes it a root task.
- **The type-aware service needed every linted file to belong to some tsconfig.** Two did not. The nine
  data-tier seed scripts sat on `allowDefaultProject`, which typescript-eslint caps at 8 — so lint had
  been broken for the whole repository, not for those files. They have a project of their own now
  (`apps/api/seed/tsconfig.json`). `packages/transport/src/next.ts` is the deliberate remaining entry:
  its tsconfig excludes it on purpose, so it can only be a default-project file.
- **The old comment predicted both.** It said the next script past eight "needs either a tsconfig
  include or a split". Nine existed. A cap in a lint config is a to-do, not a setting.

Then 34 real problems, most of them dead imports and dead locals left by the moves. Four were worth
more than the deletion:

- `useCount` in the checkout rules is a server function the React-hooks plugin read as a hook. A
  function named `use*` in a module with no React in it is a naming bug whatever lint says; it is
  `redemptionCount` now.
- `catch (e)` that rethrows a summarised `Error` had no `cause`, so every failure became one line with
  nothing under it. The panel's read and auth helpers now keep the gateway's error as the cause.
- `<a href="/orders">` in two storefront components is a full document load where a client navigation
  was meant, and the whole bundle refetches.
- An `eslint-disable` in `main.ts` for a rule this config never enabled. A directive for an inactive
  rule is how a lint config quietly stops describing the code it lints.

**The caveat.** `turbo run typecheck lint build` is green **in this working tree**, which contains a
large amount of uncommitted work that is not mine. Eleven files whose committed version has a lint
error are green only because that uncommitted work changed them — the admin's `audit/page.tsx`,
`categories-manager.tsx`, `discounts/new/page.tsx`, `media/media-library.tsx`, `login/login-form.tsx`,
`blog-editor.tsx`, `discount-form.tsx`, `nav-editor.tsx`, `product-form.tsx`, and the storefront's
`block-renderer.tsx` and `cart-button.tsx`. So the criterion's phrase "from a clean checkout" cannot be
established until that work is either committed or set aside; this commit makes the *linted* tree clean
for every file it owns, and the remaining errors are in files it does not own.
- [ ] Existing source files are not reformatted by this change; formatting is applied to changed files only

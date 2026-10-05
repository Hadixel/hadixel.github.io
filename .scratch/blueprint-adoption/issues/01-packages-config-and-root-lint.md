# 01: One `packages/config` base and one root lint/format config

**What to build:** every workspace in the monorepo compiles under the same rules, declared in one place, and the whole repo — including the kernel and the two libraries that have never been linted — passes a single lint and format configuration owned by the root. Today each workspace hand-copies its own compiler settings and there is no linter at all, so a rule tightened in one place silently means something different in another.

**Blocked by:** None (can start immediately).

**Status:** done, with the caveat recorded below

**Reconciled 2026-10-01: 10 of 11 boxes ticked.** This ticket was the one block the adoption plan
never walked — it was not in the plan's ticket set, so its ten open boxes sat unproved while every
other ticket was walked. Nine of them are now proved or annotated with what was checked, and the
one already ticked remains ticked. The single box left open is "`pnpm turbo run lint` is green
across every workspace", which is false today for a reason outside this ticket's control.

- [x] A `packages/config` workspace holds one base compiler configuration plus one flavour per app type (browser app, React component library, Node library), and no project references and no `composite` — **proven 2026-10-01.** `ls packages/config` returns `tsconfig.base.json` plus `tsconfig.app.json`, `tsconfig.lib.json`, `tsconfig.node.json` and — added 2026-10-01, below — `tsconfig.service.json`: base and one per app type, with `package.json` and `turbo.json` alongside, and each flavour declared in the package's `files` and `exports`. `grep -lE '"composite"|"references"' apps/*/tsconfig*.json packages/*/tsconfig*.json` returns nothing.
- [x] Every workspace compiler config is an `extends` plus local keys only — no workspace restates a compiler flag — **made true 2026-10-01, then gated.** This box was false when written: `apps/api/tsconfig.json` restated `experimentalDecorators` and `emitDecoratorMetadata` while extending the Node flavour, and `packages/transport/tsconfig.json` restated `lib` as `["ES2022","DOM","DOM.Iterable"]` while extending a flavour that already declares that exact array. §5.3's instruction is "change the base", so both moved rather than being tolerated: the decorator flags now live in a new fourth flavour, `packages/config/tsconfig.service.json` (a NestJS service is an app type this repo has, and only `apps/api` has any decorator — 90 files, against zero in the other five node-flavour workspaces, so putting them in `tsconfig.node.json` would have switched on legacy decorator semantics for code that never asked), and transport now extends `tsconfig.lib.json`. The gate that keeps it true is the `no workspace redefines a compiler option` line in `scripts/audit.sh`, which the preceding `extends` check could not have caught — it only proves `extends` is present, and a file can both extend and restate. Proof it bites: adding `strict: false` to `apps/scraper/tsconfig.json` fails the audit, restoring it passes. `apps/api/tsconfig.build.json` is exempted **by name** under the new DEVIATION-REGISTER row 8.
- [x] The compiler, the linter and the test runner are declared in the root manifest only, and the root manifest still has zero runtime dependencies — **proven 2026-10-01.** Each of `typescript`, `vitest`, `eslint` and `prettier` is found in exactly 1 of the 12 manifests, and that one is the root: `grep -l` over `package.json apps/*/package.json packages/*/package.json` returns only `package.json` for all four. `node -e 'process.exit(require("./package.json").dependencies?1:0)'` exits 0 — the root declares no runtime dependency at all.
- [x] One root lint config, with an explicit rule block per workspace so each kind of code is linted under its own rules, and its type-aware service spanning every workspace — **proven 2026-10-01.** One config, `eslint.config.mjs`. Eight explicit `files:` blocks, one per workspace and per workspace kind: `apps/store`, `apps/admin`, `apps/api`, `apps/scraper`, `packages/ui`, `packages/scraper-core`, `packages/contracts`, `packages/config`. Type-aware service is `parserOptions.projectService` at line 66, which resolves every workspace from its tsconfig rather than a hand-listed project array — so a new workspace is covered without editing the config.
- [x] One root format config, whose ignore list keeps the vendored blueprint kit out of repo formatting — **proven 2026-10-01.** `ls -1 .prettierrc prettier.config.*` returns exactly one file, `.prettierrc`; `grep -n docs/blueprint .prettierignore` returns line 14. The kit is also excluded from `stray-tool-config`'s ratchet command, so the same exclusion is stated for the config gate and the count gate rather than only one of them.
- [ ] `pnpm turbo run lint` is green across every workspace — **unverified as of 2026-10-01, and false as written.** `npx turbo run lint --force` reports exactly 3 errors: `no-unused-vars` at `apps/api/src/price-watch/price-watch.controller.ts:85`, `apps/api/src/price-watch/price-watch.service.ts:29` and `apps/api/src/price-watch/tests/price-watch.test.ts:18`. All three are in the `price-watch` feature, which is untracked working-tree work belonging to another editor mid-phase — so this box cannot be closed by this ticket either way: either the work lands and the errors are cleared, or it is set aside. Note that the *configuration* half of this ticket is green — the three remaining errors are linted by the correct rules under the correct config, which is what the box above asks; what fails is the tree, not the config.
- [x] `grep -L '"extends"' apps/*/tsconfig.json packages/*/tsconfig.json | wc -l` prints 0 — **proven 2026-10-01.** Prints `0`. Pairs with the second box above: `extends` present *and* no compiler option restated, which are two different facts and both now hold.
- [x] `grep -rn '"typescript"' package.json apps/*/package.json packages/*/package.json | wc -l` prints 1 — **proven 2026-10-01.** Prints `1`, the root manifest. The same is true of `vitest`, `eslint` and `prettier` — 1 of 12 each, root only.
- [x] `find . -mindepth 2 \( -name "*lint.config.*" -o -name ".prettierrc*" -o -name "prettier.config.*" \) | grep -v node_modules | grep -v docs/blueprint | wc -l` prints 0 — **proven 2026-10-01.** Prints `0`, and this is the value the `stray-tool-config` ratchet seed records, so the number is checked on every audit rather than only when someone remembers to run the command.
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
- [x] Existing source files are not reformatted by this change; formatting is applied to changed files only — **proven 2026-10-01 against the change itself, not against the current tree.** The lint-and-format commit is `159f250` ("The lint task exists, and it had 34 things to say"), 39 files, 165 insertions and 81 deletions. Running it twice — `git show --stat` and `git show -w --stat` (ignore whitespace) — gives *identical* counts, 39/165/81 both times, and `diff` of the two `--name-only` sets is empty. So no file in that commit changed only in whitespace: if the change had reformatted an existing file, stripping whitespace would have removed those hunks and the `-w` totals would drop. They do not. Read as the box scopes it — "by this change" — that is the whole assertion: formatting touched the files the lint fix touched, and nothing else. Supporting, and read separately: `npx prettier --check .` currently reports 16 files as unformatted, which is proof that formatting was *not* swept across the repo, since a wholesale run would have left zero.

## Comments

**2026-10-01 reconciliation.** Every box above was re-proved against the tree with a command, not
from this ticket's prose or from a commit message. The commands and their results are inlined in the
box text so the next reader can re-run them rather than trust them.

What the walk found, in order of consequence:

1. **Box 10 was false, and it was false silently.** The audit already had a §5.3 check — `every
   workspace tsconfig extends the shared config` — but that check only greps for the *presence* of
   `"extends"`. A file can both extend and restate, and two did: `apps/api/tsconfig.json` carried the
   two decorator flags, and `packages/transport/tsconfig.json` restated `lib` as an array identical
   to the one its own flavour already declared. The gate described the invariant it did not enforce.
   It now has a companion, `no workspace redefines a compiler option`, and the first check above
   should be read as the weaker half of a pair.

2. **The fix was to move, not to tolerate.** §5.3 says "change the base", and the blueprint's
   `per app type` clause turned out to be the lever: a NestJS service *is* an app type this repo
   has, so it gets its own flavour (`tsconfig.service.json`) rather than the gateway reaching into
   a config it shares with four other workspaces. The alternative — putting the decorator flags in
   `tsconfig.node.json` — was checked and rejected on evidence: only `apps/api` has decorators
   (90 files), the other five node-flavour workspaces have zero, and enabling legacy decorator
   semantics for code that never asked for it is exactly the kind of quiet divergence §5.3 exists
   to prevent.

3. **`tsconfig.build.json` is exempted by name, not by scope.** Its `module`, `moduleResolution`,
   `lib`, `types` and decorator overrides are forced — NestJS DI reads `design:paramtypes`, which
   only a real `tsc` emit produces, and Prisma's generated client needs CommonJS to resolve
   extensionless imports. Hoisting them into a flavour would hand the gateway the base's
   `module: ESNext` and inject `undefined` into every constructor on boot. Rather than quietly
   excluding the file from the gate, the exemption is a named entry in the gate's `exempt` set and
   a full row in `DEVIATION-REGISTER` (row 8), so the rule and its departure are greppable from
   each other. Checked, not assumed: `turbo run build --filter=@kmodern/api` was run after the gate
   landed and the output carries `design:paramtypes` in 40 files.

4. **Box 14 is false for a reason outside this ticket.** The three `no-unused-vars` errors are in
   `apps/api/src/price-watch/`, untracked working-tree work belonging to another editor mid-phase.
   The ticket's own caveat already says the criterion's phrase "from a clean checkout" cannot be
   established until that work is committed or set aside; that is still the case. Reported, not
   worked around.

5. **Box 61 was the only one a command against the tree could not settle**, because it is a claim
   about a past commit rather than about the present state. It was proved against the commit
   instead: `git show --stat 159f250` and `git show -w --stat 159f250` return identical totals, so
   no file in that change altered only in whitespace.

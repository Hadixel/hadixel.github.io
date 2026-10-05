# 19: One generated-client index

**What to build:** the generated database client is reached through exactly one index, so changing the object-relational mapper, the generator version or the output path is a one-file edit. Two modules currently reach into the generated output directly.

**Blocked by:** 17.

**Status:** done, with one caveat recorded below

- [x] The generated client, its enumerations and its namespace are re-exported by exactly one index in the data tier
- [x] No other file in the gateway imports the generated output by path
- [x] The gate rule for this is raised from a warning to an error, so a second entry point cannot appear
- [x] A test proves it: adding a second direct import of the generated output is rejected
- [ ] The packages that ship source rather than build output are identified, and the gateway stops depending on source being transpiled by its consumers

## Comments

**Boxes 1–4.** 39 import sites in `apps/api/src` that named `generated/` now name
`../prisma/index.js`, as do the 21 that named `../prisma/client`. `client.ts` did not survive the
change: making it import the index that re-exports it is `index → client → index`, a file cycle, so
the composition root moved into `index.ts` and the wrapper was deleted — with it,
`apps/api/package.json`'s `./prisma/client` export. The rule is
`generated-prisma-outside-data-client-index` at **error**, and `generated/` came back into the
cruise, which is the precondition for that rule existing: with the target excluded, no rule aimed at
it could ever fire (why P3 left it out, recorded in DEVIATION-REGISTER until this closed it).

`apps/api/tests/generated-index.test.ts` is box 4: it writes a second importer to the repository
root from `fixtures/second-generated-importer.ts.fixture`, runs the real config over that entry, and
asserts the gate names both the file and the rule — 8.7s inside `turbo run test`, which passed 942
tests across the workspace. The fixture lives outside a `.ts` file on purpose: `scripts/audit.sh`'s
§15.1 check greps every `.ts` under `apps` and `packages` for the generated path, so a test that
spelled it out would count as the violation it is testing.

`scripts/audit.sh` now asserts both halves of the boolean instead of reporting a count — 0 files
outside `apps/api/src`, exactly 1 inside it — which clears the labelled KNOWN that P3's done-when
failed on.

**Box 5, not done — and it is two questions.** *Identified:* `packages/contracts`,
`packages/ui`, `packages/transport` and `packages/scraper-core` all point `exports` at `./src/*.ts`
and none declares a `build` script; `packages/config` ships JSON, so it is not a case. *Not done:*
the gateway still builds workspace source into its own output — `apps/api/tsconfig.build.json` sets
`rootDir: "../.."` so `dist/packages/contracts/src/index.js` exists beside the app, and
`scripts/gateway-dist-manifest.mjs` writes a stub `dist/node_modules/@kmodern/contracts` so the
emitted `require("@kmodern/contracts")` resolves. That is the dependency the box names: the gateway
assumes the kernel has no compiled form of its own. Closing it means giving the kernel a real build
and rewiring `exports`, `transpilePackages`, the vitest/typecheck resolution and the dist manifest
around it — a build-pipeline change with its own blast radius, not part of a rename. The adoption
plan's Part 2 says D-9 was "closed by P1 for the build step"; no workspace declares one, so that
line is stale as well. **Needs a ticket of its own.**

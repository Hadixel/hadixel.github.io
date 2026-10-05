# Architecture Blueprint

A portable pattern language for a **multi-frontend monorepo with a single API gateway**, written
to be executed by an agent in one of two modes:

- **Scaffold** - create a new repo from the laws below, with no existing code to consult.
- **Audit** - compare an existing repo against the laws, and bring it into line.

Pick your mode in [§1](#1-modes), then read straight through. Every rule states the decision
**and** the failure it prevents, so a rule can be dropped deliberately rather than by accident.

**Authority**: this document decides. A reference implementation is an *example* of the laws,
never the source of them. Where a real repo and this document disagree, the repo is wrong until
a deviation is recorded ([§18](#18-deviation-register)).

**Scope**: the TypeScript monorepo - workspace structure, boundaries, code patterns, build
orchestration, and the mechanical checks that hold them. Deployment topology is out of scope.

Placeholders: `<org>` = package scope, `<service>` = app workspace, `<feature>` = bounded feature
area, `<entity>` = domain object.

---

## Contents

1. [Modes](#1-modes)
2. [The one-way law](#2-the-one-way-law)
3. [The five founding rules](#3-the-five-founding-rules)
4. [Tier rank](#4-tier-rank)
5. [Workspace archetypes](#5-workspace-archetypes)
6. [Dependency and manifest rules](#6-dependency-and-manifest-rules)
7. [Gateway internals](#7-gateway-internals)
8. [Data tier pattern](#8-data-tier-pattern)
9. [Presentation tier pattern](#9-presentation-tier-pattern)
10. [Cross-cutting contracts](#10-cross-cutting-contracts)
11. [Design token system](#11-design-token-system)
12. [Build orchestration](#12-build-orchestration)
13. [Documentation system](#13-documentation-system)
14. [Recipes](#14-recipes)
15. [Invariants](#15-invariants)
16. [Enforcement and CI](#16-enforcement-and-ci)
17. [Adoption](#17-adoption)
18. [Deviation register](#18-deviation-register)
19. [When not to use this](#19-when-not-to-use-this)

---

## 1. Modes

**Scaffold.** Read [§2](#2-the-one-way-law)-[§13](#13-documentation-system) for the laws, then
follow the ordered build in [§17.1](#171-scaffold-a-new-repo). Create every mechanical check in
[§16](#16-enforcement-and-ci) **before** the second feature exists, while the boundaries are still
free to hold.

**Audit.** Run `turbo run audit` first ([§16](#16-enforcement-and-ci)); it answers every mechanical
question without reading a line of prose. Then work [§15.2](#152-judgement-invariants) by hand,
which is the part no command can answer. Record findings with file and line, fix nothing during
the pass, then sequence the fixes by [§17.2](#172-audit-an-existing-repo).

Good fit for this blueprint: two or more clients over one domain, one primary datastore, one team
or a few, each surface releasable on its own.

Poor fit: a single-app product (skip the monorepo), independently versioned public packages (use a
release pipeline), or genuinely independent domains with separate datastores (use separate repos).

---

## 2. The one-way law

**Imports run downhill.** Every import edge in the repo points down a rank or sideways within a
rank, and the graph that results is **acyclic** - you can never follow imports out of a file and
arrive back at it.

This is the top law. Everything in [§4](#4-tier-rank) through [§7](#7-gateway-internals) is the
same law applied at a smaller scale. There are three scales, and each has its own ranking:

| Scale | Ranking | Section |
|---|---|---|
| Between workspaces | Tier rank | [§4](#4-tier-rank) |
| Between folders in the gateway | Archetype rank | [§7.1](#71-the-four-in-app-archetypes) |
| Between files in a feature | File-kind rank | [§7.2](#72-file-kind-rank) |

Two consequences worth stating outright, because both are routinely reached for and both defeat
the law:

- **A cycle is a missing module, not a missing tool.** When A and B need each other, the shared
  concept between them has no home yet. Give it one and both edges point at it. The cheapest
  signal that you have found the right split: the extracted module has a name that already
  appears in the domain vocabulary.
- **`forwardRef()` and its equivalents are banned.** A lazy-resolution helper is the tool for
  making a cycle *run*. The cycle is still there; you have only hidden it from the loader.
  *Prevents*: a dependency graph that cannot be reasoned about, tested in isolation, or split.

**Ports do not dissolve cycles.** An interface owned by A and implemented by B still needs a
binding, and the binding sits in a module that imports both - so the cycle returns one level up.
A port is justified by a **real swappable boundary** (local disk versus object storage; a
development sender versus a real one), never by implementer count, and never as a cycle escape
hatch. A port with one implementer and a real boundary is correct. A port with three
implementations that exists only to break a loop is not.

---

## 3. The five founding rules

Everything else is a consequence of these plus [§2](#2-the-one-way-law).

1. **One data gateway.** Exactly one process talks to the database. Every client read and write is
   an HTTP call into it. *Prevents*: two write paths enforcing different invariants - the single
   most expensive class of bug in a multi-frontend product.
2. **Imports run downhill** ([§2](#2-the-one-way-law)). *Prevents*: cycles, and a "shared" package
   that only one app can actually use.
3. **Declare where you import.** Every dependency is listed in the manifest of the workspace whose
   source imports it. *Prevents*: builds that pass only because of hoisting, and clean installs
   that fail everywhere except the machine they were written on.
4. **Global concerns are registered in exactly one place.** One composition root per process; one
   place for pipes, filters, and middleware; one place for providers and tokens. *Prevents*: the
   same concern configured twice with different values.
5. **One way to do each recurring thing.** One transport factory, one error envelope, one token
   convention, one date and number helper, one feature-folder shape. *Prevents*: N-way drift where
   each variant is 80% the same and 20% subtly different.

---

## 4. Tier rank

Every workspace carries exactly one **tier rank**. An import may point at a strictly lower rank.
It may point sideways only where this section says so.

```
tier 3   apps/api (gateway)        apps/<client> ...      clients call the gateway over HTTP
              │                          │
              └──────────┬───────────────┘
                         ▼
tier 2   packages/transport      packages/ui              created only under §5.5
                         │
                         ▼
tier 1   packages/contracts                               depends on nothing
                                                          the kernel

off-graph  packages/config                                build-time only, imported by no source
```

**Only surprising or attempted edges get a row.** A full N-by-N table of every legal and illegal
pair is noise; rank already answers the ordinary cases.

| Edge | Status | Reason |
|---|---|---|
| `api` → `transport` | ❌ | A gateway calling itself over HTTP is a category error. The gateway *is* the thing transport talks to. |
| client → the database or its client | ❌ | A second data path. Breaks founding rule 1. This edge is frequently **type-only**, so the check must see type imports ([§16](#16-enforcement-and-ci)). |
| `contracts` → anything | ❌ | The kernel is tier 1 by definition. A dependency here makes every consumer inherit it. |
| client → client | ❌ | Clients build independently. Share through a package. |
| `api` → `ui` | ❌ | No renderer in the gateway. |
| a request contract (DTO) → `contracts` | ❌ | See [§5.4](#54-the-kernel-holds-no-request-contracts). |
| root manifest → a runtime dependency | ❌ | See [§6](#6-dependency-and-manifest-rules). |
| client → `contracts` | ✅ | Domain types, pure rules. |
| `ui` → `contracts` | ✅ | Pure helpers only. |
| client → `api` over HTTP | ✅ | The only data path. |
| anything → `packages/config` via `extends` | ✅ | Not a source import; off the graph. |

**Every workspace under `apps/*` and `packages/*` carries a rank, including one nobody is actively
building.** An unranked workspace is where a second architecture grows. A nine-file placeholder
costs nothing to rank today and is the cheapest it will ever be.

---

## 5. Workspace archetypes

A workspace is exactly one of three archetypes. Choose the archetype first; the manifest shape
follows from it.

### 5.1 Application - `apps/*`

- `private: true`, named `@<org>/<service>`, **no** `exports` field. Nothing imports an app.
- Exposes exactly the task-graph script names (`dev`, `build`, `lint`, `typecheck`, `start`,
  `audit`) so it joins the graph with no bespoke config.
- One fixed port, assigned once, never reused.

An app workspace root holds only these files:

```
.env.example            every variable, no values
.gitignore
package.json            task-graph script names
tsconfig.json           extends packages/config, plus rootDir / paths / include / exclude
<task-runner>.json      extends the root config, plus this workspace's tags - nothing else
<framework>.config.*    web framework, style pipeline, test runner
<docs entry point>      the one index file of section 13
src/
```

The docs entry point is the one index file of [§13](#13-documentation-system) - exactly one, under
either of that section's two names, and a root carrying neither or both fails; the task-runner file
carries `extends` and tags only, which is the same restriction
[§15.1](#151-mechanical-invariants) states for the build graph.

**Three untracked artefacts are also allowed at an app root.** The fence above lists tracked
files; these three are the framework's generated ambient declaration file (`next-env.d.ts`, for one
widely used framework), the incremental-compiler state file (`*.tsbuildinfo`), and the app's local
environment files - `.env` and any `.env.<suffix>`, the whole family except the tracked
`.env.example` the fence already names. A client on another framework substitutes that framework's
declaration file and **writes it out**. Each of the three is written by the toolchain or by the
developer, at the app root, with no supported way to put it anywhere else, and each is in the app's
`.gitignore`.

The environment family is allowed whole rather than suffix by suffix because nothing chooses the
suffixes centrally: the web framework loads `.env` and `.env.<mode>`, the ORM CLI loads `.env`, and
a developer naming a throwaway environment for one suite picks a suffix no config file records. An
app's `.gitignore` already draws the only line that matters - `.env.example` is tracked and every
other member is not - so a gate that re-lists the suffixes is a second, weaker copy of that line
and goes red the first time someone adds one.

*Prevents*: a gate that is green on a clean checkout and red on a working one. A developer whose
own machine fails the audit after every build learns to skip the audit, and a gate that is
routinely skipped has stopped being a gate.

**Two directories at an app root are untracked artefacts in the same sense, and are allowed at
every app root without being named per archetype.** `node_modules/` is the package manager's own
install target; `.turbo/` is the task runner's own cache. Neither is written by an app's own build
step, both are gitignored everywhere, and both are identical in shape regardless of framework. An
app's own build output directory (`dist/` for the gateway's compiled output, `.next/` for a
Next.js client) is untracked and toolchain-written the same way, but its name is framework-specific,
so it is named once per archetype alongside the extras below rather than treated as universal.

*Prevents*: the same clean-checkout-versus-working-checkout gate flap as the untracked artefacts
above, this time for a directory a files-only check would have missed anyway.

**An archetype may name its own extra root entries, and only those.** Each entry below is at the
root because its own tool reads it from nowhere else, and each is named once, for its archetype, in
[§16.1](#161-the-audit-task)'s allowlist configuration - an app root is not a place to improvise.

- A client's static assets live in `public/`; a framework that serves assets from an arbitrary
  directory would leave the client's build unable to find its own images and fonts.
- A gateway's end-to-end suite lives in `test/`; the framework's own test runner discovers it there
  by convention, and moving it under `src/` would mix a build concern into the module graph §7.1
  fences.
- Its database schema and seeds live in `prisma/`; the ORM CLI resolves that path itself and
  cannot be told a different one without also changing every command that already assumes it.
- It carries `nest-cli.json`, the framework's own CLI config; without it at the root, `nest build`
  and `nest generate` have no configuration to read and fail before they start.
- It carries `tsconfig.build.json`, a build-only compiler pass excluding tests; without a separate
  build config, the compiled output either ships test files or the one tsconfig has to serve both
  test and build, coupling two concerns that change for different reasons.
- It carries `prisma.config.ts`, the ORM CLI's own config resolving the database URL from the
  environment; without it, the CLI has no supported way to learn which database to talk to outside
  a hardcoded default.

*Prevents*: the fence above forcing every archetype into one shape when their frameworks
genuinely differ, while still keeping the root a closed, named list rather than an open one.

**No second docs home at an app root.** The one index file of [§13](#13-documentation-system) is
the whole of it - no `README.md`, no `CONTEXT.md` beside it. Per-concern documentation lives in
`docs/`, and an app-specific concern gets a numbered doc there like any other.

*Prevents*: the overlapping document [§13](#13-documentation-system) bans. Two descriptions of one
app leave a reader worse off than one, and the copy that no change happens to touch is the one that
goes stale and is still believed.

**No lint config, no formatter config, no compiler options, no `engines` field.** Those live at the
root or in `packages/config` and reach the app by `extends`. A lint or formatter config wears the
same `<name>.config.*` shape as the framework files in the fence, so the app-root gate cannot tell
the two apart by shape and **writes the tool family out** instead: any name carrying `lint`, and
each formatter by name. A client adopting a formatter this list does not know adds it there in the
same change.

*Prevents*: N workspaces with N slightly different rule sets, which is how one app quietly stops
being checked at all.

### 5.2 Library package - `packages/*`

Ships **build output**, not source:

```json
{ "type": "commonjs", "main": "./dist/index.js", "types": "./dist/index.d.ts" }
```

Source-publishing (`"main": "./src/index.ts"`) is tempting and has a sharp edge: it only works
while every consumer can compile your source **and** every runtime can erase your types. Node's
type stripping handles erasable syntax only. An `enum`, a `namespace`, a parameter property, or a
non-`type` re-export is not erasable and dies at load with `SyntaxError: Unexpected token`. Since
a package cannot police which of those a future contributor adds, compile.

- Keep an **explicit `exports` map**, one entry per entry point, never a wildcard. It keeps deep
  imports legal, keeps tree-shaking possible, and lets you hold a module deliberately *out* of the
  barrel ([§11.2](#112-component-library-contract)).
- **Re-export anything generated through your own index**, so no consumer imports a `generated/`
  path. That one indirection is what lets the generator layout change without touching call sites.
- **Group by feature, not by layer.** One file per domain area holding that area's types, schemas,
  and pure rules together. `types/`, `utils/`, and `schemas/` force a reader who wants one entity
  to open three folders, and they hide how large an area has grown.
- A component library declares the UI runtime (`react`, …) in `peerDependencies` (the host
  provides it) **and** `devDependencies` (so it type-checks alone). No other workspace does this.

### 5.3 Config-only package - `packages/config`

No source, no build, no rank. A `files` + `exports` map over base configs: `tsconfig.base.json`
plus one `tsconfig.<flavour>.json` per app type.

**Use `extends` only. Never project references, never `composite`.** Project references buy
incremental build ordering, which the task runner ([§12](#12-build-orchestration)) already
provides, and they charge for it in `.tsbuildinfo` staleness and a second dependency graph that
can disagree with the first.

Each workspace config is `extends` plus only what is genuinely local: `rootDir`, `include`,
`exclude`, and `paths` for the **intra-app `@/*` alias and nothing else**. Compiler options are
never redefined per workspace - change the base. *Prevents*: strictness drifting per app, which is
how one app quietly stops being type-safe.

### 5.4 The kernel holds no request contracts

`packages/contracts` is the domain kernel. Name it `contracts`, not `shared` - **"shared" is the
name a junk drawer gets**, and a package named for who uses it rather than what it holds will
accept anything.

One name covers two objects with different lifetimes, and conflating them is the most common
reason a kernel either stays empty or swallows the gateway:

- **The request contract (the DTO)** - the validated class the gateway checks input against. It
  carries validation decorators, so it drags a validation runtime with it. It stays in the
  feature's `dto/` and **no client and no package ever imports it**.
- **The domain type** - the shape a client needs to read a response, plus the enums and pure rules
  that go with it. No framework in it, so it lives in the kernel where the gateway and every client
  read one definition.

**A generated model type is not a domain type.** A schema generator emits types beside the data
client, inside the one workspace that owns the database. Reading them from a client couples the
client's compile to the database schema and puts a second data path in the graph, so the generated
type reaches a client only by being **restated in the kernel** - hand-written, framework-free, and
carrying exactly the fields the response exposes. The restatement is the point, not overhead: it is
where a column rename stops being a client's problem, and where a column the API never returns
stops being visible to one.

A DTO is therefore **never promoted to `contracts`**, no matter how many features import it -
moving it would give the kernel a runtime dependency and break its tier 1 rank. A DTO obeys the
ordinary one-way law instead: feature A may import feature B's DTO exactly when the A → B edge is
already legal.

*Prevents*: each client hand-rolling its own copy of every response type. Those copies compile, so
nothing fails - they simply drift, silently, the first time the gateway adds a field.

### 5.5 The package creation trigger

**A `packages/*` workspace needs two or more consuming workspaces.** With one consumer it is a
directory inside that consumer.

A workspace is not free: it is a manifest, a tsconfig, a build task, a cache entry, a rank, and a
line in every dependency check. Paid once for real sharing, it is cheap. Paid for a single
consumer, it buys nothing and costs forever.

The same rule drives promotion: a utility moves **down** a rank on its **second** consumer, and is
never copied sideways. App-local helper → a second feature needs it → move it to a support folder;
a second workspace needs it → move it to a package.

Consequences worth naming, because each one is a package people reach for by reflex:

- **A database package does not exist.** Exactly one workspace touches the database
  ([§8](#8-data-tier-pattern)), so a package for it has one consumer by construction. It appears to
  earn a second consumer only when a client imports a generated model type from it - and that edge
  is already ❌ in [§4](#4-tier-rank). The package is the symptom; the client's import is the
  violation. What the client actually wants is the domain type, which belongs in the kernel
  ([§5.4](#54-the-kernel-holds-no-request-contracts)).
- **A UI package waits for the second client.** With one client, its components live in that
  client.
- **A transport package waits for the second HTTP caller.**

---

## 6. Dependency and manifest rules

1. **Declare where you import.** If it resolves only by hoisting, it is a bug that surfaces on the
   next clean install.
2. **Root manifest holds build tooling only** - task runner, compiler, linter, formatter, shared
   type packages. **Zero runtime dependencies.** A lint plugin used by the one root lint config is
   a root dependency, by rule 1.
3. **One version of the compiler, the linter, and the test runner, declared at the root only.**
   Removing them from each workspace manifest is not tidying: a tool version that drifts per
   workspace silently changes what each check means ([§16](#16-enforcement-and-ci) explains the
   failure mode that makes this load-bearing).
4. **Centralise version unification.** Use the root `overrides` block to pin anything that must be
   a single instance across the repo (the UI runtime is the classic case: two copies break hooks).
   Never hand-align versions across N manifests.
5. **The internal link protocol depends on the package manager.** Write the correct one for yours
   and never copy the other:
   - **pnpm, yarn**: `"@<org>/contracts": "workspace:*"`.
   - **npm**: `"@<org>/contracts": "*"`. npm has no workspace protocol; `workspace:*` fails the
     install outright with `EUNSUPPORTEDPROTOCOL`.
6. **One `engines` floor and one `packageManager`, both at the root only.** The floor is the
   highest any workspace genuinely needs; a lower root floor is simply false, because the repo
   cannot install and run below it. `"packageManager": "<pm>@<exact version>"` is what stops
   "works on my machine".
7. **Unused-dependency tools are advisory.** They cannot see CLI-only tools, plugin-resolved
   packages, or the runtime dependencies of generated code. Verify against real import statements
   before removing, and keep the known false positives listed in one place.
8. **A new third-party dependency is a decision, not a detail.** Prefer the kernel, then a platform
   primitive, then a dependency. Anything landing in a shared UI package is in every client's
   bundle.

---

## 7. Gateway internals

### 7.1 The four in-app archetypes

**The gateway `src` root holds three kinds of file and nothing else:**

| Root file | Why it is a file and not a directory |
|---|---|
| the process entry (`main.ts`) | it *is* the boot sequence ([§7.4](#74-composition-root)) |
| the composition module (`app.module.ts`) | it *is* the root of the module graph |
| a **pre-boot init** file, one per external agent - error monitoring, analytics, tracing | its side effect must run before the first application import, so no module can own it |

A pre-boot init file is named for its agent (`instrument.ts`, `analytics.ts`), holds that agent's
initialisation and nothing else, exports nothing, and is imported on the first lines of the process
entry - before every other import. It is the one legal loose file, and it is legal only because the
ordering requirement is real: an agent that can be initialised after the app object exists is an
infrastructure module instead.

*Prevents*: the scaffold leftover. A framework generator drops a controller and a service at the
`src` root, they match no archetype, so every boundary rule is written against directories and
cannot see them. They then sit there for the life of the repo, and the root reads as a place where
loose files are normal.

Everything else under `src` is a **directory**, and every top-level directory is exactly one of
four archetypes. **Choose the archetype before creating the directory.** The single-archetype
version of this rule is the most common way a real repo diverges from its own blueprint: half its
directories have no module and no legal shape, so the rule reads as failing everywhere and gets
ignored.

| Archetype | Shape | May import | May be imported by |
|---|---|---|---|
| **Entrypoint** | Files the process boots (`main.ts`, `cli/*`) | anything | nothing, ever |
| **Feature** | module + controller(s) + service(s), in the [§7.3](#73-feature-anatomy) shape | features (acyclic), infrastructure, support, kernel | features, entrypoints |
| **Infrastructure module** | module + service or port + adapter, no controller (data client, cache, revalidation, media) | support, kernel, third-party | features, entrypoints |
| **Support folder** | pure functions. No module, no dependency injection, no framework decorators | framework types, third-party, kernel, other support folders (acyclic) | everything above |

**A top-level directory with no `*.module.ts` is claiming the support archetype**, and must then
satisfy every support constraint in the table above. This is the fastest archetype audit there is:
list the directories, list the modules, and every directory in the first list but not the second is
either genuinely pure or misfiled.

Reading the table as ranks: entrypoint (rank 3) → feature (rank 2) → infrastructure (rank 1) →
support (rank 0). Sideways edges inside the feature rank and inside the support rank are legal and
must stay acyclic.

**An entrypoint is a real archetype, not an exception.** A CLI script imports the composition
module and therefore sits above the entire app. Without this slot the tier law has nowhere to put
it, and a `cli/` folder ends up either exempted by hand or misfiled as a feature.

**A support folder is a real archetype, not an escape hatch.** Pure functions consumed by fifteen
features do not want a module, a provider, or an injection token wrapped around them. Its one hard
constraint is the import list above: a support folder that reaches for a feature has stopped being
support.

Cross-cutting code owned by no feature (filters, middleware, shared types, utilities) is a support
folder. **It is the one legal place to group by layer**, precisely because none of it belongs to a
feature.

### 7.2 File-kind rank

Inside a feature folder, imports run downhill through the file kinds:

```
module            the roof - wires the feature; may import anything in its own feature;
                  nothing may import it
   │
   ▼
controller        decodes HTTP        (guard, decorator sit at this rank)
   │
   ▼
service           business rules + data access
   │
   ▼
adapter           the concrete implementation behind a port
   │
   ▼
port · dto · exception · pure rule                                      the leaves
```

**The module is the roof, not a layer.** It imports the controllers it registers, which reads as a
violation of any straight `controller → service → …` line. Ranking it above the controller states
what it actually is: the wiring, read by nothing.

**A service may call a sibling service in the same feature**, as long as no loop forms. Banning it
does not remove the coupling; it pushes the coupling into a lazy-resolution helper or a port that
exists only to dodge the rule - both worse, and both banned elsewhere in this document.

**Pure domain rules stay flat**, beside the service, and they are the one kind the directory rule
above does not touch. They are the feature's core logic and they change when the service changes;
co-location is the point. The module, the controllers and the services stay flat for the same
reason - they are what the feature *is*, and a `services/` directory beside a `dto/` directory
hides the behaviour the listing exists to show. Resist a `rules/`, `domain/` or `services/`
folder.

**Tests sit outside the graph.** A test file is not part of the shipped shape, and a test importing
another feature's fixtures is normal. Exclude `*.spec.ts` from the mechanical checks
([§16](#16-enforcement-and-ci)) and keep the smell as a judgement item
([§15.2](#152-judgement-invariants)).

### 7.3 Feature anatomy

**This is the most-skipped rule in this document. Audit it by opening a folder; do not infer it.**

The rule has two halves, and passing one says nothing about the other:

- **Outside the folder** - group by feature, never by technical layer. No top-level `controllers/`,
  `services/`, `dtos/`. Features change together; layers do not.
- **Inside the folder** - the shape below, with each **file kind** in its own directory.

Codebases routinely satisfy the first and fail the second. An auditor who confirms "no top-level
`controllers/`" and moves on has checked half a rule and recorded a pass.

```
apps/api/src/<feature>/
├── <feature>.module.ts         # wiring only
├── <feature>.controller.ts     # HTTP surface for one audience
├── <audience>.controller.ts    # a second controller when an audience differs
├── <feature>.service.ts        # business rules + data access
├── <concern>.service.ts        # a sibling service, acyclic
├── <rule>.ts                   # pure domain rules, flat beside the service
├── dto/                        # request contracts, including query params
│   ├── create-<entity>.dto.ts
│   └── <entity>-query.dto.ts
├── exceptions/
│   └── <entity>-<condition>.exception.ts
├── guards/                     # any further kind, once the folder holds two of it
└── decorators/
```

**Every file kind gets a directory named for the kind, plural, as soon as the folder holds a second
file of that kind.** The kind is whatever the filename suffix already declares - `dto`,
`exception`, `guard`, `decorator`, `filter`, `interceptor`, `middleware`, `port`, `adapter`,
`type`, `util`. The list is open: a kind this document never names still obeys the rule, because the
rule is about the suffix, not about a fixed vocabulary.

**`dto/` and `exceptions/` are the exception to the "second file" trigger: they exist from the
first file of each kind.** Those two kinds multiply in every feature that has any, so waiting for
the second buys one file's delay and costs a move.

The trigger is a count of two, not a judgement of mess. A threshold like "once past about five"
sounds moderate and fails in practice: nobody counts to five, the threshold is never observed to
trip, and the flat listing wins by default. Two is observed by opening the folder.

*Prevents*: the **junk drawer** - one flat directory of forty-plus files where request contracts,
exceptions, pure rules, the service, and the controller are indistinguishable by sight. The cost is
not aesthetic. Finding the write path for one entity means reading filenames linearly, every new
file lands wherever the last one did, and nobody can see that a feature has grown large enough to
split. The two directories keep the handful of files that define the feature's *behaviour* visible
at the top of the listing.

Two more conventions:

- **Split controllers by audience, not by verb.** When an admin, an owner, and the public need
  different surfaces over the same feature, that is three controllers in one module. *Prevents*:
  the 900-line controller where authorization is an `if` in the middle of a handler.
- **The service holds the rules; the controller decodes HTTP.** A controller reaching straight for
  the data client is a shortcut. Allow it only for a trivial read, and record it in the deviation
  register.

### 7.4 Composition root

The bootstrap sequence is fixed, ordered, and lives in one file:

```
load environment          (before any import that reads config)
init error monitoring     (before the app object exists)
create app
attach monitoring handler
static assets
CORS allowlist            (explicit origins; env-overridable)
global validation         (whitelist + reject unknown fields + transform)
global exception filter
security headers
API docs                  (non-production only)
graceful shutdown hooks
listen(PORT)
```

No feature module installs its own pipe, filter, or middleware. A global concern goes here; a
non-global one is a decorator on the route.

**The composition module (`app.module.ts`) declares `imports` and nothing else.** The order is
fixed, because each tier is read by the ones below it:

```
imports: [
  <global config>,        # first - every later module reads from it
  <data client>,          # second - nearly everything depends on it
  <auth>,                 # third
  <feature modules>,      # then features, in one stable order
]
```

A provider appearing here is either a global concern - which belongs in `main.ts` above - or a
feature's own, which belongs in that feature's module. *Prevents*: a second, competing composition
root, so global wiring has two places to hide. That is exactly what founding rule 4 forbids.

### 7.5 Auth model

Separate the two questions and give each the cheapest correct implementation:

| Question | Mechanism | Cost |
|---|---|---|
| Who is this? | Verify the session or token, project the subject onto the request | One lookup, or none |
| May they do this? | Read declared requirements from route metadata, then **re-read the subject's authority from the datastore** | One indexed query |

**Authorize from the source of truth, never from a claim.** A token minted before a permission was
revoked is still cryptographically valid. If that query cost matters, cache it explicitly with a
short TTL and an invalidation hook.

- One session or token shape for all subject types, with a `type` discriminator, so middleware
  stays uniform.
- A normalised `request.user` shape that handlers read through a single accessor or decorator.
- Guard composition is declarative and order-dependent: authenticate, then authorize.
- One cookie name **per audience**; that name is the only per-client variable in the transport
  layer.

### 7.6 Error and validation contract

- **Input**: a validated schema class for every body **and** every query object. Configure the
  validator to strip unknown fields *and reject* them. Consequence worth accepting: request schemas
  become the real API contract, so they must be maintained.
- **Output on failure**: one envelope, produced by one global filter:
  `{ statusCode, message, timestamp }`. Handlers throw typed HTTP exceptions and assemble no error
  body of their own. *Prevents*: stack traces and internal messages leaking one endpoint at a time.
- **Hostile input yields a 4xx.** Sanitise any user-controlled string reaching a query builder
  (null bytes, control characters, oversized input) and constrain numeric and enum params at the
  schema layer.
- Decide once whether user-facing messages are localised at the API or the client, and apply it
  everywhere.

### 7.7 The API describes itself

Annotate every controller and route for the OpenAPI document: tags, summaries, auth requirements,
query params. The generated spec is the input to contract tests, client generation, and automated
security scanning. **An undocumented route is an untested, unscanned route.** Gate the docs UI to
non-production.

---

## 8. Data tier pattern

**The schema, the generated client, and the migrations live inside the gateway workspace.** This
follows from [§5.5](#55-the-package-creation-trigger) plus founding rule 1: one process touches the
database, so a database package would have exactly one consumer.

- **One injectable client wrapper**, bound to the process lifecycle (connect on start, disconnect
  on shutdown) over an explicitly configured pool. Connection management is a lifecycle concern,
  never per-request code. It is an infrastructure module ([§7.1](#71-the-four-in-app-archetypes)).
- **Point the generator's `output` at a path inside the workspace**, and **re-export the generated
  client through one index**. No other file imports a `generated/` path. That single indirection is
  what makes changing ORM, generator, or output layout a one-file edit instead of a repo-wide one.
- **Migrations are the only path to production schema change.** Committed, ordered, immutable once
  applied. Schema-push tools are for throwaway local databases only. Two CI jobs enforce it:
  1. **Immutability** - an already-applied migration file may not be modified.
  2. **Drift** - replay all migrations onto an empty database and diff against the schema; the diff
     must be empty.
  *Prevents*: the classic outage where code ships expecting a column production lacks.
- **Squash history at milestones** into one baseline migration, and never re-add the old per-feature
  ones.
- **Relational core, structured edges.** Model stable entities relationally. Storing a fast-moving,
  user-authored, self-contained structure as a JSON column is legitimate, but name the trade: you
  have moved validation from the database to the application. Therefore the shape lives in the
  kernel as a type plus schema, its resolution rules (defaults, overrides, fallbacks) live in
  **one** shared helper, and no call site re-derives them.
- **Derived relations over duplicated keys.** If a relationship is reachable by a join, adding a
  convenience foreign key adds something that can drift.
- **Data scripts are entrypoints** ([§7.1](#71-the-four-in-app-archetypes)): seeds, bootstraps, and
  one-off backfills read connection config from the environment and are either idempotent or refuse
  to overwrite existing rows.
- **A destructive test suite names its own database.** Any suite that drops and rebuilds a schema
  reads a dedicated variable, documents that it is destructive at the top of its own docs, and runs
  against a disposable container on a non-default port.

---

## 9. Presentation tier pattern

### 9.1 One client per audience

Split clients by *audience*, not by feature. Each audience gets its own app workspace, route
surface, auth cookie, and performance budget. They share transport, components, tokens, and domain
rules.

### 9.2 Rendering dialect is chosen per audience

**Do not force one rendering dialect on all clients.** Pick per audience, write it down, and stay
consistent *within* each client.

| Audience | Priority | Default component | Read path | Write path | Forms |
|---|---|---|---|---|---|
| Public / SEO | Crawlability, Core Web Vitals | Server | Cached server data module | Direct call from a small island | Minimal |
| Authenticated operational | Interaction latency, correctness | Server shell + client feature tree | Server-side fetch with request credentials | Server actions + targeted revalidation | Schema-validated form library |
| Internal admin | Uniformity, speed of adding entities | Client | Query-cache hook | Mutation + cache invalidation | Local state |

Rules that follow:

- **Match the dialect of the client you are in.** Porting the admin dialect into the public app is
  how a server-first app becomes client-rendered by accident.
- **Providers are scoped, not global.** Mount a query cache, auth context, or theme provider in the
  subtree that needs it, not at the app root. A public page must not need a client cache provider to
  render a badge.
- **Keep the root layout thin**: structural markup, global styles, fonts, static wrappers.
- **Islands over client pages.** If one button is interactive, extract the button.
- **Treat runtime request data as async** (params, query, cookies, headers) where the framework
  does, and resolve it in the entry path.
- **A performance regression on a public route is a functional regression.** Reserve layout space,
  fix media dimensions, and keep above-the-fold content off the client fetch path.

### 9.3 Server-side write orchestration

For operational clients, mutations live in dedicated server-side modules per feature, not in
components:

```
<feature>-actions.ts     server-only; calls the gateway with request credentials;
                         revalidates affected paths and tags;
                         returns a uniform result object rather than throwing across the boundary
```

The uniform result shape (`{ success, error?, data? }`) is deliberate: an error thrown across a
server/client boundary loses its type and its message. Multi-step orchestration belongs **in the
action**, never in a component.

### 9.4 Client structure conventions

```
src/
├── app|routes/                # routing only - thin entries
│   ├── (group)/               # route groups carry auth, providers, layout
│   └── <route>/_components/   # route-local components (underscore = not a route)
├── <feature-root>/            # one per feature: lib/, hooks/, components/, state, types.ts
├── components/                # app-wide shared components
├── lib/                       # app-level helpers, transport instance
└── types/                     # app-level types
```

**The fence is an illustration; the rules are the bold statements below.** Each carries its trigger
and the failure it prevents, because a shape carried by a code fence alone is read as a suggestion
and drifts in a different direction in every client that copies it.

**A client's `src` root obeys the same allowlist discipline as the gateway's**
([§7.1](#71-the-four-in-app-archetypes)): the framework's own required root entries, plus one
pre-boot init file per external agent, and every other unit is a directory. Above `src`, the app
workspace root obeys the [§5.1](#51-application---apps) allowlist unchanged - a client is an app
first.

*Prevents*: the scaffold leftover, in the form [§7.1](#71-the-four-in-app-archetypes) names. A
generator drops a helper at the client `src` root, it matches no archetype, and every
directory-scoped rule below is blind to it for the life of the repo.

**A route directory holds only the framework's own route files.** For one widely used framework
that set is `page`, `layout`, `route`, `loading`, `error`, `not-found` and `template`, in whatever
extension the framework uses, plus the co-located tests of those files; a client on another
framework substitutes that framework's set and **writes it out**, because the rule is the
enumeration. The rule governs source units - the framework's metadata files and the route tree's
global stylesheet are not units. Every other unit under a route lives in that route's
`_components/` directory, or in the feature root.

*Prevents*: the route surface becoming the feature's home. A hook, a fetch helper and four
components land beside `page` because that is where the author was working; the next route imports
two of them across the route tree; the routing surface now owns the feature and cannot be
restructured without rewriting imports. Route entries stay thin only if there is somewhere else for
the implementation to go.

**The `_components/` trigger is a count, not a judgement:** the directory exists from the **first**
route-local file. This matches the `dto/` and `exceptions/` trigger in
[§7.3](#73-feature-anatomy).

*Prevents*: the trigger that never fires. "Once the route gets busy" is a judgement nobody is
observed to make, so the second file lands flat beside the first, the tenth lands beside the ninth,
and the rule reads as satisfied at every individual step while the route directory becomes the
junk drawer [§7.3](#73-feature-anatomy) describes. A count of one is checked by looking.

**A feature has exactly one root directory**, holding that feature's lib, hooks, components, state
and `types.ts`. A `lib/<feature>/` beside a `store/<feature>/` is one feature with two homes, which
founding rule 5 ([§3](#3-the-five-founding-rules)) forbids.

*Prevents*: the split feature. One behaviour change means editing two trees, a reader grepping the
feature name finds half of it, and neither tree can be moved or deleted on its own.

**`src/lib/`, `src/components/` and `src/types/` are app-wide only.** A feature-named directory
inside any of them is a feature root filed in the wrong place, and it fails this rule even when it
is that feature's only home.

*Prevents*: grouping by layer at the client root - the failure [§7.3](#73-feature-anatomy) bans in
the gateway, arriving through the back door. Once `lib/<feature>/` is legal, `components/<feature>/`
and `hooks/<feature>/` follow, and the feature stops existing as a unit anywhere in the tree.

Types shared across clients move to the kernel. Two conventions stay judgement calls, and both are
listed in [§15.2](#152-judgement-invariants):

- **Component size ceiling around 400 to 500 lines.** Past it, extract sub-components, a
  `use-<feature>.ts` hook, and pure utility modules.
- Keep heavy fetching, data transformation, and rendering in separate units.

### 9.5 Responsive versus dedicated mobile views

Decide explicitly, per surface:

- **Responsive** is correct when the information hierarchy is the same and only layout reflows.
- **A dedicated mobile view** is correct when the interaction model differs (a data grid, a
  scheduler, a multi-pane editor). A desktop table with horizontal scroll is not a mobile view.

When building a dedicated view: share data, actions, rules, types, and state hooks; split only
presentation; select the tree with a CSS breakpoint in a small feature shell, since a
viewport-measuring script costs a hydration mismatch and a layout shift. Keep mobile overrides
inside the mobile tree.

---

## 10. Cross-cutting contracts

Each of these is founding rule 5 applied to one concern.

**Transport.** One factory produces a typed client:

```ts
createApiClient(tokenName) → { get, post, patch, put, delete, upload }
```

It owns base URL resolution, auth header injection, JSON encoding, empty-response handling, and a
**typed error** (`{ message, statusCode }`) that prefers the server's message with a sane default.
No component hand-rolls a request. Server-side reads use a sibling helper because credentials come
from the request context rather than browser storage - the one legitimate duplication here. Until a
second workspace calls the gateway, the factory lives in the one client that has it
([§5.5](#55-the-package-creation-trigger)).

**Identity.** One token or cookie name per audience; nothing else in the transport layer varies per
client.

**Canonical domain formats.** Pick one representation per domain primitive (phone numbers,
currency, identifiers, timestamps), store and transmit only that, and normalise at **every write
path** with one shared function. State the rule in absolute terms ("11 digits, no country code,
anywhere"), because these leak back in through seeds, display helpers, and link builders rather
than through core code.

**Localisation and formatting.** Decide whether locale is a first-class concern or a theme. If
first-class (non-Latin script, RTL, non-Gregorian calendar, non-ASCII digits), then direction is
structural in the root layout, all date and number formatting goes through kernel helpers, and no
component formats a date or a currency inline. Decide once whether you adopt an i18n framework -
retrofitting one is a project, not a refactor.

**Validation split.** Two validators with two jobs, and it is not duplication:
- a schema class at the HTTP boundary (it produces the API contract and the docs),
- a schema library in the kernel for shapes crossing the client/server boundary, form validation,
  and JSON-column payloads.

Shared business **predicates** both tiers need (overlap checks, availability rules, limits) live in
the kernel so the rule cannot diverge.

**Observability.** One error-monitoring protocol everywhere: initialised before the app in the
gateway, wired into each client. Route client reports through a first-party tunnel endpoint so
ad-blockers do not silence the error stream. Tag by environment explicitly - inferring it from
`NODE_ENV` fails, because that is `production` in every non-local environment.

**Security headers.** One canonical header set, applied as middleware in the gateway and in the
framework config in clients. Where the framework requires a static literal, the duplication is
intentional: record it in the deviation register and in the "new client" recipe so it is copied
rather than reinvented.

**Automated security scanning.** Run DAST against the gateway's generated spec and each client, on
a schedule and before merge. Define the gate numerically (zero failures, zero new warnings) with a
documented baseline of accepted warnings. A subjective gate is not a gate.

---

## 11. Design token system

### 11.1 Three tiers - always consume the highest available

1. **Primitive variables.** CSS custom properties on the theme root and each variant
   (`--background`, `--foreground`, `--primary`, `--muted`, `--destructive`, `--border`, `--ring`,
   `--radius`, …), stored in a form that composes so opacity modifiers work.
2. **Semantic mapping.** Each variable mapped to a semantic utility in the styling config
   (`bg-primary`, `text-muted-foreground`). **A colour literal in a component is a bug.** The
   literals in the token definition file are the definition and belong there.
3. **Composed semantic classes.** Named classes for patterns repeating across components
   (`.text-title`, `.text-body-bold`, `.<surface>-card`), plus effect and utility classes.

**The token rule**: before writing a repeated utility chain, look for an existing composed class.
If the chain is new *and* repeats, add a token. This is what keeps a utility-CSS codebase from
becoming write-only.

Fonts are wired per client and consumed through a variable.

### 11.2 Component library contract

Applies once the second client triggers the package ([§5.5](#55-the-package-creation-trigger)).
Before that, these rules apply to the one client's own `components/`.

- **Primitive + variant + merge.** Accessible headless primitives, a variant helper for the API
  surface, and a class-merge utility so consumers can override. Components are
  unstyled-by-default, variant-driven, and **own no data fetching**.
- **Theme tokens only.** A shared component that hardcodes a colour is not shareable.
- **Two import styles, documented explicitly.** A barrel for the common case; a direct path for
  modules that must not be eagerly evaluated (anything that portals, locks scroll, or touches
  browser globals at module scope, which crashes server rendering through a barrel). Keep those out
  of the barrel with their own `exports` entry.
- **Consumers include the library source in their style scanner's content globs**, or library
  classes are never generated.

### 11.3 Shared-behaviour index

Keep one table in the docs mapping *need → canonical implementation* (transport, dates, string and
number formatting, domain rules, toasts, breakpoints, debounce, outside-click, money input, money
display). Consult it before writing a hook or helper. This index is the cheapest
duplication-prevention mechanism available.

---

## 12. Build orchestration

**A caching task runner owns the task graph.** Not for speed: for **correct ordering**. Running a
build across workspaces without one runs a consumer before its dependency, and the usual patch for
that is a chain of `pre*` and `post*` npm hooks - a hand-rolled task graph, written in the one
place that cannot see the dependency graph. Delete those hooks when the runner lands.

| Task | Config | Why |
|---|---|---|
| `build` | depends on upstream `build`; declare output dirs (exclude caches) | Topological order + correct cache |
| `dev` | persistent, uncached, depends on upstream `build` | Long-running; upstream must exist |
| `generate` | declare generated paths as outputs | Codegen participates in the cache |
| `lint`, `typecheck`, `test` | leaf tasks | Parallel, independent |
| `audit` | leaf task, root only ([§16](#16-enforcement-and-ci)) | One command answers every mechanical invariant |

Three properties make this work:

- **The whole task graph lives in one root config.** A package-level file carries only `extends`
  and its tags. A workspace joins the graph by exposing the script names and nothing else; if
  adding a workspace requires editing the graph, the graph is over-specified.
- **Declare every output directory.** An undeclared output is a cache that silently returns stale
  artefacts.
- **Declare build-time-inlined environment variables in the task's `env` list**, so they are part
  of the cache key. Otherwise a cached build carries another environment's API URL - a genuinely
  hard bug to see, because nothing failed.

**Lint is a root-only task.** Not per workspace. A flat-config linter searches upward from the
working directory, and the task runner sets the working directory to each package - so per-package
configs and a root run can disagree about which rules fired, with both reporting success. One root
config with `files`-scoped blocks per workspace makes them the same object. Point the type-aware
project service at every workspace tsconfig, and keep the linter and its plugins in the root
manifest ([§6](#6-dependency-and-manifest-rules) rules 2 and 3).

**Typecheck, lint, and test are first-class tasks, not editor features.** A monorepo where only the
IDE checks types has no type safety at the boundaries between packages.

**Configuration tiers.** Three, never mixed:

| Tier | Where it lives | Visibility |
|---|---|---|
| Build-time public | inlined at compile time, part of the cache key | Shipped to the client - assume public |
| Runtime | read from the environment at process start | Server-side only |
| Secret | a secret store, never in the repo | Injected at runtime, never at build time |

**A secret that reaches a build is no longer a secret** - it persists in build output and in
caches. Document every variable and its tier in one place.

---

## 13. Documentation system

Docs are part of the architecture.

- **One entry point** (`AGENTS.md` or `CLAUDE.md`) that is *only* an index: "if you need X, read
  Y". Humans and agents both start there. **Exactly one per surface** - the repo root gets one, and
  each app workspace gets one, reaching that surface's bounded-context document and its decision
  tree. Two index files at one root is two answers to "where do I start", and the one nobody
  updated is the one that gets read.
- **Numbered topic docs** in `docs/`, one concern each. Numbers are stable reference targets.
- **A docs index** in `docs/` that names every topic doc and every per-surface tree the directory
  holds, so every document has more than one route in. This is a different job from the domain
  map: the docs index answers "what documents exist", the domain map answers "what contexts exist".
  A document reachable only from the domain map disappears the day that map is rewritten around a
  new context boundary.
- **This blueprint is prescriptive and portable; the numbered docs are descriptive and specific.**
  Keep them separate. Instantiating this blueprint means writing a project-specific companion doc
  recording the concrete choices (actual ports, actual module list, actual token values) and
  linking here for the reasoning.
- **The audit is a command, not a document.** `turbo run audit` is the audit
  ([§16](#16-enforcement-and-ci)). A prose file restating what the script checks drifts out of sync
  with the script within a month, and an agent reading two overlapping documents is worse off than
  one reading one.
- **A deviation register** ([§18](#18-deviation-register)) instead of pretending the codebase is
  clean.
- **The error-driven documentation rule**: when a reviewer catches a mistake, ask whether a missing
  written rule allowed it. If so, add the rule, and add its mechanical check in the same change.
  This is how the guideline stays alive rather than decaying into aspiration.

---

## 14. Recipes

### New API endpoint

1. Request schema for body **and** query params, in the feature's `dto/`.
2. Service method: business rules, data access, sanitise user-controlled strings reaching the query
   builder, throw typed HTTP exceptions from `exceptions/`.
3. Controller route: docs annotations, authenticate guard, authorize guard plus required-authority
   metadata, subject accessor if needed.
4. Normalise canonical domain formats on write.
5. Run the security scan to the defined gate.

### New feature folder

Create it as a **directory** under the gateway `src` - never a loose file
([§7.1](#71-the-four-in-app-archetypes)) - in the [§7.3](#73-feature-anatomy) shape: module,
controller, service, `dto/` and `exceptions/` as real directories from the first file of each kind,
and a directory for any other kind on its second file. Register it in the composition module,
annotate the controller, and add it to the archetype lists the boundary checks read. Nothing is
added to the composition root.

### New non-feature folder

Pick the archetype from [§7.1](#71-the-four-in-app-archetypes) first. No controller and no HTTP
surface means infrastructure module; no module and no dependency injection means support folder;
booted by the process means entrypoint. If it fits none, it is a feature.

### New schema change

Generate a migration → commit it → run the drift check (diff must be empty) → update the data model
doc → push. Never sync-push a shared database; never edit an applied migration.

### New shared component

Build it with headless primitive + variants + class merge, tokens only. Add an explicit export
entry. Export from the barrel **unless** it portals, locks scroll, or touches browser globals at
module scope. Document non-obvious API.

### New client page

Identify the client's dialect ([§9.2](#92-rendering-dialect-is-chosen-per-audience)) and follow it.
The route directory holds only the framework's route files
([§9.4](#94-client-structure-conventions)): the first route-local component creates that route's
`_components/` directory, and anything a second route will use goes in the feature root instead -
the feature's single directory, never a new entry under `src/lib/` or `src/components/`. Data
through the client's canonical helper; UI from token classes; feature types in the feature root's
`types.ts`. On public routes, re-check performance budgets.

### New app workspace

Scaffold `apps/<service>` with the task-graph script names, an `extends`-only tsconfig, a fresh
port, the security header set, observability wiring, kernel dependency, and **a tier rank recorded
in [§4](#4-tier-rank)**. Add its origin to the gateway's CORS allowlist and to the docs index. It
should require no task-graph edits and no new lint config.

### New workspace package

Confirm the trigger first ([§5.5](#55-the-package-creation-trigger)): two or more consuming
workspaces, today. Then choose the archetype ([§5](#5-workspace-archetypes)) and copy that
archetype's manifest shape.

---

## 15. Invariants

Two kinds, and the split is the point. **A mechanical invariant is a command that fails CI. A
judgement invariant is read by a person or an agent and reported.** Filing a judgement item as
mechanical produces a gate nobody can satisfy; filing a mechanical item as judgement produces a
rule that is never checked.

Every rule added to this document lands in one of the two lists in the same change, or it will
never be checked at all.

### 15.1 Mechanical invariants

Each is one command in the `audit` task ([§16](#16-enforcement-and-ci)).

**Boundaries**
- [ ] No cycle at file scope, module scope, or folder scope, anywhere.
- [ ] No import crosses a tier rank upward ([§4](#4-tier-rank)).
- [ ] No client imports the database client, including by type-only import.
- [ ] No file outside the data-client index imports a `generated/` path.
- [ ] No source file imports an entrypoint.
- [ ] `packages/contracts` has zero runtime dependencies.
- [ ] Every dependency is declared in the workspace that imports it; the root manifest has no
      runtime dependency.
- [ ] Every workspace tsconfig is `extends` plus local-only keys.
- [ ] No lint or formatter config exists outside the repo root.
- [ ] One `engines` floor and one `packageManager`, at the root only.
- [ ] One compiler version, one linter version, declared at the root only.
- [ ] The internal link protocol matches the package manager
      ([§6](#6-dependency-and-manifest-rules) rule 5).

**Structure**
- [ ] Every file at the gateway `src` root is the process entry, the composition module, or a
      pre-boot init file ([§7.1](#71-the-four-in-app-archetypes)).
- [ ] Every top-level directory under the gateway `src` is named in the archetype lists the
      boundary checks read. A new directory fails until it is assigned.
- [ ] No file kind appears twice at the top level of a feature folder
      ([§7.3](#73-feature-anatomy)). The module, controllers, services and pure rules are exempt.
- [ ] Every file at an app workspace root is named in the [§5.1](#51-application---apps) fence or
      is one of the three untracked artefacts that section allows. A lint or formatter config there
      fails even though it matches the framework-config shape.
- [ ] Every file at a client `src` root is a framework-required root entry or a pre-boot init file
      ([§9.4](#94-client-structure-conventions)).
- [ ] Every file directly inside a client route directory is a framework route file or the
      co-located test of one ([§9.4](#94-client-structure-conventions)).
- [ ] No directory name appears twice in a client's `src` at depth 1 or 2, outside the route and
      test trees: one feature, one root ([§9.4](#94-client-structure-conventions)).
- [ ] A `"use server"` module exports nothing but an async function, in every client. The framework
      registers every export of such a module as a callable server action; a type, a constant, a
      plain object or a synchronous function among them still gets registered, and since a type
      does not survive compilation the build then fails looking for an action it cannot find.

**Documentation**
- [ ] Every surface root carries exactly one docs entry point - not zero, not both names
      ([§13](#13-documentation-system)).
- [ ] Every document under `docs/` is linked from the docs index
      ([§13](#13-documentation-system)).

**API**
- [ ] Every `*.dto.ts` is inside a `dto/` directory; every `*.exception.ts` is inside an
      `exceptions/` directory.
- [ ] No lazy-resolution helper (`forwardRef` and equivalents) appears in source.
- [ ] The composition module declares `imports` only.

**Data**
- [ ] Applied migrations are unmodified.
- [ ] The migration drift diff is empty.

**Design system**
- [ ] No colour literal in a component. The token definition file is excluded.

**Build**
- [ ] Every workspace joins the task graph by script name; no per-package graph config beyond
      `extends` and tags.
- [ ] Every build output directory is declared.
- [ ] No secret is available at build time.

### 15.2 Judgement invariants

Reported, never failed. These are the ones no command can answer.

- Does every folder have one job, or has one become a catch-all?
- Is each directory's archetype ([§7.1](#71-the-four-in-app-archetypes)) the right one, or was it
  chosen by inertia?
- Does every port guard a **real swappable boundary** ([§2](#2-the-one-way-law))?
- Is a domain type duplicated in a client instead of read from the kernel?
- Has a feature grown large enough to split? A junk drawer that passes the `dto/` and `exceptions/`
  checks is still a junk drawer.
- Does a test reach into another feature's internals rather than its public surface?
- Is a controller reaching past its service to the data client?
- Is each client's rendering dialect documented, and is the client internally consistent with it?
- Has a client component passed the [§9.4](#94-client-structure-conventions) size ceiling without
  a sub-component, a hook, or a pure module being extracted?
- Does a client unit still mix heavy fetching, data transformation, and rendering
  ([§9.4](#94-client-structure-conventions))?
- Is a directory inside a client's `src/lib/`, `src/components/` or `src/types/` genuinely
  app-wide, or is it a feature root filed by layer ([§9.4](#94-client-structure-conventions))?
- Does every feature have exactly one root? The `[client-feature-one-root]` gate
  ([§15.1](#151-mechanical-invariants)) is a **proxy** and errs in both directions: it cannot see a
  split feature whose two trees are named differently, and it fires on two genuinely distinct
  app-wide directories that happen to share a name. A green gate is not the same as the rule
  holding, so read this one by opening the tree.
- Is a repeated utility chain owed a composed class?
- Does the code follow SOLID - one reason to change per unit, extension without modification,
  substitutable implementations, interfaces no wider than their consumer needs, dependencies on
  abstractions where a real boundary exists?

### 15.3 The ratchet

A **ratchet** is a number checked into the repo, verified by CI, that may go **down** and never up.
It is how a violation with hundreds of instances gets fixed incrementally without the gate sitting
red for months.

Three rules make a ratchet work:

1. **Every metric ships with its literal command, excludes included.** A metric described in prose
   is re-derived differently by every reader, and then an unrelated change fails CI. A colour
   literal count varies by a factor of seven depending on whether CSS is scanned; a config-file
   count doubles if a stale git worktree is inside the repo. **The command is the metric.**
2. **Commands and counts live in one checked-in `ratchet.json`**, read by the `audit` task. The
   file is the single source of truth; this section is the law about the file.
3. **A ratchet covers counts, never a yes/no rule.** A boolean invariant is either satisfied or the
   gate is red. Anything in [§15.1](#151-mechanical-invariants) that reads as yes/no is fixed
   before its gate lands ([§17.2](#172-audit-an-existing-repo)), never ratcheted.

The canonical metric set, each with its command. Every one targets zero, except the last. Paths are
written as `apps/<gateway>` and `apps/<client>`, and an allowlist inside a command is written as
the placeholder the matching section uses; `ratchet.json` substitutes this repo's real workspace
names and its real filenames, spelled out. A metric scoped to a client gets **one entry per client
workspace**, since the counts differ per client. After
[§15.4](#154-retiring-a-ratchet), `colour-literal` is the only client-scoped metric left, and it
carries an `admin` entry only - `storefront` renders no components of its own yet, and the entry is
owed the moment it does.

Where a command excludes generated, ignored artefacts, the exclusion is part of the metric and not
a convenience: without it the count changes with checkout state, which is the failure rule 1 above
describes.

**Flat request contracts** - `*.dto.ts` files outside a `dto/` directory.

```
find apps/<gateway>/src -name "*.dto.ts" -not -path "*/dto/*" | wc -l
```

**Flat exceptions** - `*.exception.ts` files outside an `exceptions/` directory.

```
find apps/<gateway>/src -name "*.exception.ts" -not -path "*/exceptions/*" | wc -l
```

**Stray tool configs** - the lint and formatter configs below the repo root that the command
enumerates. The enumeration is the metric, so a tool it does not name is uncounted until it is
added here.

```
find . -mindepth 2 \
  \( -name "*lint.config.*" -o -name ".*lintrc*" -o -name ".*lintignore" \
     -o -name "prettier.config.*" -o -name ".prettierrc*" -o -name ".prettierignore" \
     -o -name "biome.json*" -o -name "dprint.json*" -o -name ".editorconfig" \) \
  | grep -v node_modules | grep -v <worktree root> | wc -l
```

**Colour literals** - hex literals in component source, excluding stylesheets.

```
grep -rEoh "#[0-9a-fA-F]{3,8}" --include="*.ts" --include="*.tsx" apps/<client>/src | wc -l
```

**Suppressions** - boundary-suppression directives in source ([§18](#18-deviation-register)).

```
grep -rn "boundaries-ignore" --include="*.ts" --include="*.tsx" apps packages | wc -l
```

The suppression metric is the one that matters most: it is the only number that stops accepted
deviations quietly compounding.

### 15.4 Retiring a ratchet

A ratchet is scaffolding, not a fixture. Rule 3 above says a ratchet covers counts and never a
yes/no rule, so a ratchet parked at zero is the weakest form of the gate it stands in for: it
reports a number where the rule is boolean, and it is satisfied by a count that merely fails to
rise. **A metric retires when two things are true at once: the count has reached zero, and a
[§15.1](#151-mechanical-invariants) command exists that fails on the first violation.** Then the
entry leaves `ratchet.json` and the boolean gate carries the rule alone. Anything deliberately left
behind at that moment is recorded in [§18](#18-deviation-register), because the count is no longer
there to carry it.

**A count at zero with no boolean gate behind it does not retire** - deleting it would delete the
only check the rule has. Of the metrics above, `flat-dto` and `flat-exception` sit at zero over a
`severity: 'error'` file-kind rule, yet their `find` still catches the one shape that rule cannot
see: a flat file with no dependency edge at all. `stray-tool-config` and `colour-literal` have no
second mechanism, so their counts *are* the gate. That is why those four entries stay at zero
rather than leaving with the client-structure four.

Four client-structure metrics have been retired this way. Each counted the remaining violations of
one [§15.1](#151-mechanical-invariants) structure invariant, none could be assumed to start at zero
in an existing client, and the route-tree count started in the hundreds
([§17.2](#172-audit-an-existing-repo), phase 5). Their invariants live as hard gates in
`scripts/audit-client-structure.js`, whose allowlists live in `scripts/client-structure-config.js`:

| Retired metric | Now enforced as |
|---|---|
| Loose app-root entries | `[app-root-allowlist]` - every file and directory at any app workspace root, gateway included, is in the [§5.1](#51-application---apps) allowlist |
| Loose client `src`-root files | `[client-src-root-allowlist]` - every file at a client `src` root is a framework root entry or a declared pre-boot init file |
| Non-route files in route directories | `[client-route-files-only]` - every source unit under the route tree is a route file, the co-located test of one, or underscore-scoped |
| Feature names with two homes | `[client-feature-one-root]` - no directory name repeats in a client's `src` at depth 1 or 2, outside the route and test trees |

Only the last two of those gates changed behaviour on retirement. The two allowlist gates already
failed on the first violation, so their entries had been counting what a boolean check was
enforcing anyway - retiring them removed a duplicate, not a floor.

The last of the four is a **proxy for its invariant, not the invariant**, and it errs in both
directions - see the matching judgement item in [§15.2](#152-judgement-invariants). Retiring the
count does not retire that judgement item: the gate catches the split feature whose two trees share
a name, and a person still has to open the tree for the one whose trees do not.

---

## 16. Enforcement and CI

**A rule that lives only in a document is a rule that will be broken.** Every mechanical invariant
in [§15.1](#151-mechanical-invariants) is a command here.

### 16.1 The audit task

One root task, `audit`, running its own test suite, eight checking tools, and the ratchet:

| Tool | Job | Why it is here |
|---|---|---|
| **The audit scripts' own tests** | Every `scripts/*.test.js` file, via `node --test` | A check nobody can trust is a check nobody should be gated by; this runs before any of the tools below |
| **dependency-cruiser** | Primary gate. Cycles at file, module, and folder scope; tier rules; intra-app archetype and file-kind rules | The only one that reads the import graph inside a workspace |
| **Task-runner boundaries** | Cross-workspace tags and package cycles | Fast, and it owns the suppression directive |
| **Package-manifest linter** | Root has no runtime dependency; a peer dependency implies a dev dependency; one version per tool | Manifest-level rules the graph tools cannot see |
| **App-root check** | Every app workspace root, gateway included: every file and directory is in the [§5.1](#51-application---apps) allowlist, archetype extras named and no more | The one check every app workspace goes through, so a workspace left off another list still gets this one |
| **Gateway structure check** | The gateway's `src/` directory shape: module layout, file kinds ([§9](#9-directory-structure)) | Directory shape is a rule the import graph cannot see |
| **Client structure check** | Each client's directory shape: `src/` root fence, route files only, one root per feature ([§9.4](#94-client-structure-conventions)) | Same job for the surfaces the gateway check does not reach |
| **Server-actions check** | Every `"use server"` module, in every client, exports nothing but an async function | The framework registers every export of such a module as an action; the import graph cannot see which exports are functions |
| **Docs check** | Exactly one entry point per surface root; every document under `docs/` linked from the docs index ([§13](#13-documentation-system)) | Docs are part of the architecture, and an unlinked document is an unread one |
| **Ratchet** | The counts in [§15.3](#153-the-ratchet) | Incremental cleanup without a red gate |

Four configuration details are load-bearing. Each one is a way the gate silently passes while
checking nothing:

- **`tsPreCompilationDeps: true`.** With the default, `import type` edges are invisible - measured
  on a real gateway, 699 local edges become 853, so **18% of the graph is hidden**. A type-only
  import is exactly the shape of the client-to-database edge this blueprint exists to prevent.
- **Two cycle rules.** `scope` is a rule-level key, not a `to` restriction, and it defaults to
  `module`. A module-scope rule catches a file loop; only a second rule at `scope: "folder"` catches
  `<feature-a>/ ⟷ <feature-b>/`, which is the cycle that actually happens.
- **Assert a non-zero cruised-module count.** dependency-cruiser accepts a bounded compiler range.
  Outside it - too new counts, not just missing - it prints `0 modules cruised` and **exits 0**. A
  routine compiler bump disarms the primary gate with a green tick. Pair the assertion with the
  single pinned compiler version from [§6](#6-dependency-and-manifest-rules) rule 3, and write the
  accepted range beside the rule.
- **Exclude `*.spec.ts`** ([§7.2](#72-file-kind-rank)).

### 16.2 The pipeline

One pipeline, whose triggers are a decision of their own - record them in an ADR:

```
install → typecheck → lint → test → audit → build
```

A suite that needs a real database gets its own job with a service container pinned to the
production major version, pointed at a throwaway database
([§8](#8-data-tier-pattern)).

**The `audit` job blocks from the day it lands.** That is only safe because the ordering in
[§17.2](#172-audit-an-existing-repo) puts the violation fixes ahead of the gates. Landing a gate
red - or landing every rule at `warn` with a promotion step written down for later - teaches
everyone to ignore it, and the promotion step is never taken.

**Where the pipeline runs is a separate question from whether its jobs block.** Every job here
blocks on the branches the pipeline runs on. Which branches those are, and what a merge request
therefore does not verify, belongs in
that same ADR.

---

## 17. Adoption

### 17.1 Scaffold a new repo

Order matters; each step unblocks the next.

1. **Workspace skeleton.** Workspaces, task runner, `packages/config` with the base configs, root
   manifest with tooling only, one root lint and format config, one `engines` floor, one
   `packageManager`.
2. **The kernel, empty but real.** `packages/contracts` with the first domain type. Establishing
   "no framework, no runtime dependency in the kernel" on day one is far cheaper than extracting it
   later.
3. **The gateway with its full composition root.** Validation, exception filter, security headers,
   CORS, docs, shutdown hooks, health endpoint - before the first feature. Retrofitting a global
   error envelope after 40 endpoints means auditing 40 endpoints. **Delete the generator's sample
   controller and service in this step.** The `src` root ends it holding the process entry, the
   composition module, and any pre-boot init file - nothing more
   ([§7.1](#71-the-four-in-app-archetypes)) - and the health endpoint is a feature directory like
   any other.
4. **Data tier inside the gateway.** Schema, generated client re-exported through one index,
   migration tooling, and **both migration CI jobs before the first feature migration**.
5. **Auth end to end.** One vertical slice: session issue, authenticate guard, authorize guard with
   datastore-backed authority, one protected route.
6. **Enforcement.** The whole of [§16](#16-enforcement-and-ci), while the repo is small enough that
   every rule passes trivially. This is the step that is skipped, and skipping it is what makes
   every later step negotiable.
7. **First client, with its dialect written down.** Record the rendering strategy in the docs at the
   same time as the first page.
8. **Tokens before components.** Variables, semantic mapping, composed classes, then components -
   inside the client, since no package is triggered yet.
9. **Docs index and the companion doc.** Record the concrete choices.
10. **Second client.** The real test of the boundaries, and the event that triggers the first
    genuine `packages/*` extraction ([§5.5](#55-the-package-creation-trigger)).

Checkpoint: after step 9 you should be able to add a whole new app workspace in under an hour, with
zero edits to the task graph, the shared configs, or the lint config. If you cannot, fix that before
growing.

### 17.2 Audit an existing repo

Never a big-bang restructure. Let the two structures coexist, and mark the old one frozen.

**Phase 0 - measure.** Run the audit and work [§15.2](#152-judgement-invariants) by hand. Write
findings down with file and line. **Fix nothing yet.** Sort into: correctness risk, drift risk,
cosmetic.

**Phase 1 - tooling.** Task runner, `packages/config`, one root lint and format config with the
per-workspace `files` blocks written out in full, tools hoisted to the root manifest, per-app
configs deleted, engine floor and `packageManager` reconciled, dead code deleted.

**Phase 2 - the yes/no violations.** Every boolean invariant that is currently false: cycles,
upward imports, lazy-resolution helpers, a second data path. **This comes before the gates**, so the
gates land green.

Closing a second data path outranks everything else here. A cycle is closed by extracting the
missing module ([§2](#2-the-one-way-law)), and the extraction is finished when both former
participants import the new module and neither imports the other.

**Phase 3 - the gates.** All of [§16](#16-enforcement-and-ci), blocking, with the ratchet seeded at
today's counts.

**Phase 4 - the kernel.** Rename to `contracts`; route generated imports through one index. These
are independent mechanical renames with no broken intermediate state, so they land as separate
changes and the typecheck proves each one.

**Phase 5 - the shape.** The `src` root reduced to its three legal files, an archetype assigned to
every top-level directory, a directory per file kind, and ratchet counts driven to zero.

Order inside this phase: the `src` root first, because it is a handful of files and it is what makes
every directory-scoped rule complete; then archetype assignment, because the boundary rules read
that list; then the kind directories, which are the long tail and the one part a ratchet handles
well.

**Throughout:**
- **One structural change per merge request.** Never mix a boundary change with a feature change;
  the review becomes impossible and so does the revert.
- **Every rule adopted gets its mechanical check in the same change**, or it will not survive.
- **Log what you deliberately did not fix** in the deviation register, with a reason. An
  acknowledged deviation is manageable; an undocumented one becomes precedent, and precedent gets
  copied.

---

## 18. Deviation register

**A deviation is recorded in the code, at the violation.** A table in a document drifts from the
code the week after it is written; a suppression directive on the offending line cannot.

The mechanism is the task runner's boundary-suppression directive, and it carries two things:

```ts
// @boundaries-ignore <rule> - <reason>
```

**The reason is mandatory.** A suppression with no reason cannot be re-evaluated by anyone later,
which is precisely how debt becomes permanent. Where a project's conventions ban explanatory
comments, this is the carve-out and the convention document says so: a suppression directive is
tooling, and its reason is part of the directive.

The register in prose keeps only what a line comment cannot hold - the standing, repo-wide
deviations. It takes this shape, and these two rows are the shape rather than entries:

| Deviation | Where | Why it exists | May it be copied? |
|---|---|---|---|
| Legacy structure | `<path>` | Predates the blueprint | No - frozen; convert on next touch |
| Forced duplication | `<paths>` | Framework requires a static literal | Yes - copy, do not reinvent |

Rules for the register:
- Two columns are mandatory: **why it exists** and **whether it may be copied**.
- Deviations are scoped work, never fixed opportunistically inside an unrelated change.
- The suppression count is a ratchet metric ([§15.3](#153-the-ratchet)), so the total can only fall.
- A deviation with no owner and no status is undocumented debt with extra steps.

### 18.1 Standing deviations

The suppression count is zero, so no deviation is recorded at a violation. One standing deviation
is recorded here, because no line of code can carry it:

| Deviation | Where | Why it exists | May it be copied? |
|---|---|---|---|
| An entry point that carries rules as well as links | the repo root `CLAUDE.md` | It holds repo-wide working rules that have no numbered topic doc to move into yet, so making it *only* an index would delete them | No - the client entry points are the pattern; move each rule into a topic doc as it is next edited |

Retiring the four client-structure ratchets ([§15.4](#154-retiring-a-ratchet)) left nothing behind:
every client-structure count had reached zero, so each gate became a hard gate with no violation to
carry forward, and no client-structure exception was granted.

The register stays empty only while every gate grants exactly what a rule names, so the two are
read together. The app-root gate is the worked example: its allowlist once passed `CONTEXT.md`,
`README.md`, `next-env.d.ts`, `*.tsbuildinfo` and `.env*.local` at client roots, and the gateway's
own root sat outside the gate entirely, carrying a `README.md`, a `CONTEXT.md`, and a `docs/` tree
of its own that no rule named. The three untracked artefacts resolved by writing the rule - they
genuinely belong at an app root, so [§5.1](#51-application---apps) now says so - the docs files
resolved by withdrawing the grant, because [§13](#13-documentation-system) already puts them
elsewhere, and the gateway resolved by bringing it inside the same gate and the same docs tree the
clients already used, once and for every app workspace. Nothing is left merely tolerated, which is
why the row above names only the repo root. This register is a claim, not a leftover - a deviation
lands here in the change that accepts it, and leaves in the change that fixes it.

---

## 19. When not to use this

Adopt this deliberately, knowing the costs:

- **The gateway is a single point of failure and a single scaling unit.** That is the trade for
  having one place where invariants are enforced. Independent scaling or release cadence per domain
  means separate services, and their operational overhead.
- **A monorepo needs a caching task runner and disciplined dependency declaration.** Without both it
  is slower than separate repos, not faster.
- **A shared UI package is a coupling point.** Three clients with genuinely different design
  languages should share tokens and primitives, not one component library.
- **Per-audience rendering dialects need documentation to survive.** Undocumented, they read as
  inconsistency, and the next contributor will "fix" them into uniformity.
- **The enforcement in [§16](#16-enforcement-and-ci) is not optional overhead; it is the blueprint.**
  Without it this is a document that describes what the repo used to be.

The blueprint is worth adopting when the cost of two divergent write paths, N transport clients, and
N drifting component libraries exceeds the cost of the discipline above. In a multi-frontend
product it usually does, and earlier than expected.

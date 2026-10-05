// The architecture, as rules that fail.
//
// Blueprint §15.1 lists the mechanical invariants; this file is the ones a compiler cannot see.
// Every entry is a rank or a direction from the blueprint, quoted in the comment beside it, so a
// rule that is deleted later is a rule whose justification was read and rejected — not a rule that
// quietly stopped applying. That is the failure mode a lint config has that a compiler does not:
// a `files` pattern matching nothing is not an error.
//
// Paths are regexes matched against repo-relative paths, so each begins with `^` to anchor. Run
// it from the repository root; `scripts/audit-depcruise.mjs` does.
//
// The file is CommonJS, not ESM: the root manifest declares no `"type"`, so an `export default`
// here would be reparsed as an ES module on every run — a warning and an extra parse each time —
// and `.dependency-cruiser.js` is also the name the adoption plan and the reference kit give it.
//
// severity "error" on every rule but one. The exception, `no-infrastructure-from-support`, is a
// "warn" because the edge it names exists today and clearing it needs a decision the owner has not
// yet made (DEVIATION-REGISTER row 1). A rule that cannot be satisfied without that decision fails
// the audit forever, and a gate that fails forever is one people stop reading — while a warn on
// every run keeps the edge in front of whoever opens the report.

const { readdirSync } = require("node:fs");
const { join } = require("node:path");
const archetypes = require("./scripts/gateway-archetypes");

const HERE = __dirname;
const apps = readdirSync(join(HERE, "apps"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

// The four in-app archetype rules below build their patterns from `scripts/gateway-archetypes.js`
// rather than spelling the directory names here. The table is the single place the assignment
// lives, and `scripts/audit-structure.js` reads it too — so a rule written against a private copy
// of those names would be blind to any directory the copy did not know about, which is exactly
// the failure this file's header warns about, one level down.

/** `^apps/api/src/(a|b|c)/` for a set of directory names. */
const gatewayDirs = (names) => `^apps/api/src/(${names.join("|")})/`;

/**
 * A `pathNot` subtracting the given archetypes plus `generated/`. The far side is always the whole
 * gateway source tree, so the subtraction is what states what the archetype may reach.
 */
const gatewayReach = (...lists) =>
  `^apps/api/src/(${[...lists.flat(), ...archetypes.GENERATED_DIRS].join("|")})/`;

/** `^apps/api/src/(?:a|b)/[^/]*\.module\.ts$` — a `*.module.ts` sitting directly in those directories. */
const gatewayModuleFiles = (names) => `^apps/api/src/(?:${names.join("|")})/[^/]*\\.module\\.ts$`;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ---- Tier rank (§4). Ranks, highest first: packages/contracts (kernel), then packages/transport,
    // ---- packages/ui and packages/scraper-core (packages), then apps. packages/config is off the
    // ---- graph entirely: it holds JSON.

    {
      name: "no-kernel-dependency",
      comment:
        "§4: the kernel is tier 1 — pure domain contracts with no dependency on anything. A dependency declared here is inherited by every consumer in the repo, which is the one thing a kernel must not be. `path` narrows the target to this repo's own files: without it every third-party import counts, and the rule reads as a claim that zod is a violation.",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { path: "^(apps|packages)/", pathNot: "^packages/contracts/" },
    },
    {
      // O-3 / D-26: §4 puts the kernel at tier 1, "depends on nothing", and §10 mandates a schema
      // library in the kernel. Both cannot hold literally — zod and sanitize-html are what the
      // contracts validate with — so the allowance is written down as a rule with a name rather
      // than silenced with an exception: the kernel may depend on exactly those two, and a third
      // runtime dependency fails here. That is the difference between an allowance and a
      // suppression: this line can still fire, and a suppression cannot.
      name: "kernel-runtime-dependency-allowance",
      comment:
        "§4 vs §10 (plan O-3): the kernel declares `zod` and `sanitize-html`, which the blueprint's tier-1 rule forbids and §10 requires. Named here as the complete, closed set the kernel may depend on from outside the workspace. Anything else — a logger, a utility, a second validator — is a dependency inherited by every consumer in the repo and is not allowed by this rule.",
      severity: "error",
      from: { path: "^packages/contracts/" },
      to: { dependencyTypes: ["npm"], pathNot: "node_modules/\\.pnpm/(zod|sanitize-html)@" },
    },
    {
      name: "no-tier2-to-app",
      comment:
        "§4: a package sits below every app. A package that imports an app is an app wearing a package's name.",
      severity: "error",
      from: { path: "^packages/(transport|ui|scraper-core)/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-tier2-to-config",
      comment:
        "§5.3: packages/config is build-time only — JSON compiler presets. Source that imports it is reaching for its own compiler options by another route.",
      severity: "error",
      from: { path: "^packages/(transport|ui|scraper-core)/" },
      to: { path: "^packages/config/" },
    },
    // §5.1: an app has no exports field, so nothing imports an app, and two apps that need each
    // other's code need a package. One rule per app rather than one rule in total, because a
    // restriction cannot correlate the app a file came from with the app it reaches for — `from`
    // and `to` are separate patterns — so each app gets the whole of `apps/` on the far side with
    // itself subtracted. The list is read from disk, so a new app joins the fence without an edit
    // here.
    ...apps.map((app) => ({
      name: `no-${app}-imports-another-app`,
      comment: `§5.1: ${app} reaching for a file in another app. An app has no exports field; it cannot be a dependency.`,
      severity: "error",
      from: { path: `^apps/${app}/` },
      to: { path: "^apps/", pathNot: `^apps/${app}/` },
    })),
    {
      name: "no-client-to-data-tier",
      comment:
        "Founding rule 1, and §4's ❌: the clients reach the data tier over HTTP, never through the database client — including by type-only import, which is why `tsPreCompilationDeps` is on in the options below. Without it this edge is invisible.",
      severity: "error",
      from: { path: "^apps/(store|admin)/" },
      to: { path: "(generated|^apps/api/src/prisma/)" },
    },
    {
      name: "no-source-imports-entrypoint",
      comment:
        "§5.1: an entry point is the roof of its workspace. `main.ts` is what the process runs and `bin/` is what a person runs; both are the end of a dependency chain, not a library anything starts from.",
      severity: "error",
      from: {},
      to: { path: "^apps/api/src/main\\.ts$|^apps/[^/]+/bin/" },
    },

    // ---- In-app archetypes (§7.1), for the gateway's own source tree.
    //
    // Every pattern below is built by `gatewayDirs` / `gatewayReach` from
    // `scripts/gateway-archetypes.js`, so these rules and `scripts/audit-structure.js` agree about
    // which directory is support, infrastructure, a feature or generated by construction rather
    // than by two lists that have to be edited together.
    //
    // `payments`, `shipping`, `sms` and `storage` are filed as infrastructure, not support, which
    // is a correction rather than a preference: a port/adapter pair and a vendor HTTP client are
    // the shape §7.1 calls infrastructure. While they were filed as support, the rule below read as
    // a statement about `common` alone and let support reach a feature through four doors.

    {
      name: "no-support-reaches-feature",
      comment:
        "§7.1: support is shared machinery owned by no feature. The moment it names a feature it stops being support and becomes a feature with a misleading name. The far side subtracts support, infrastructure and generated/: support may reach support, infrastructure runs uphill and has its own warn below, and `generated/` is the ORM's output rather than anyone's dependency — a restriction that reports the same edge twice is one that gets read once.",
      severity: "error",
      from: { path: gatewayDirs(archetypes.SUPPORT_DIRS) },
      to: {
        path: "^apps/api/src/",
        pathNot: gatewayReach(archetypes.SUPPORT_DIRS, archetypes.INFRASTRUCTURE_DIRS),
      },
    },
    {
      name: "no-infrastructure-from-support",
      comment:
        "warn, deliberately. §7.1's rank puts infrastructure above support, so a support folder reaching for infrastructure runs uphill — and two edges do today: apps/api/src/common/guards/origin.guard.ts -> apps/api/src/config/config.service.ts, and (since P4 put the generated client behind one index) apps/api/src/common/audit.ts -> apps/api/src/prisma/index.ts, which is type-only: the audit helper types the client it is handed as Pick<Prisma.TransactionClient, \"adminAuditLog\">. Neither can be cleared without a decision the owner has not yet made. The guard's edge is the §7.1 contradiction in DEVIATION-REGISTER row 1: the clause forbids framework decorators in a support folder while the paragraph below it sends cross-cutting filters and middleware there… A gate that fails forever is a gate people stop reading — §16.1 — so this stays a warn and keeps the edge in front of whoever opens the report.",
      severity: "warn",
      from: { path: gatewayDirs(archetypes.SUPPORT_DIRS) },
      to: { path: gatewayDirs(archetypes.INFRASTRUCTURE_DIRS) },
    },
    {
      name: "no-infrastructure-reaches-feature",
      comment:
        "§7.1: infrastructure is the port/adapter layer — the ORM, the config, and the clients that speak to a vendor. It is allowed to reach support and other infrastructure, and to reach `generated/`, which it owns. It is not allowed to reach a feature: the moment it does, the dependency stops pointing at an adapter and starts pointing at a use case, so the port can no longer be swapped without editing whoever uses it.",
      severity: "error",
      from: { path: gatewayDirs(archetypes.INFRASTRUCTURE_DIRS) },
      to: {
        path: "^apps/api/src/",
        pathNot: gatewayReach(archetypes.INFRASTRUCTURE_DIRS, archetypes.SUPPORT_DIRS),
      },
    },
    {
      name: "no-support-imports-its-own-module",
      comment:
        "§7.1: a `*.module.ts` is what makes a directory a feature, so a module under support is a feature with a misleading name. It is named as its own rule rather than folded into the rule above because the edge has the shape of a permitted one — the target is inside support, so nothing in the far side would ever object — and because it is the one shape that hides from every other feature-scoped rule here: those are written against directories that are not features. `scripts/audit-structure.js` enforces the same thing statically, so a module in support fails both the cruise and the structure gate.",
      severity: "error",
      from: { path: gatewayDirs(archetypes.SUPPORT_DIRS) },
      to: { path: gatewayModuleFiles(archetypes.SUPPORT_DIRS) },
    },

    // ---- File kinds (§7.2), inside one feature. Two narrow rules, because §7.2 is explicit that
    // ---- a service may call a sibling service in the same feature. Only the kinds that invert —
    // ---- something reaching a module or a controller — are forbidden.

    {
      name: "no-lower-kind-imports-higher",
      comment:
        "§7.2: within a feature, controller > service > adapter > port > dto. A service, adapter, port or dto importing the feature's *.module.ts reaches above itself for wiring that belongs to the composition root.",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/(?!.*\\.module\\.ts$).*(service|adapter|port|dto)\\.ts$" },
      to: { path: "^apps/api/src/[^/]+/[^/]*\\.module\\.ts$" },
    },
    {
      name: "no-kind-imports-controller",
      comment:
        "§7.2: the module is the roof — it imports the controllers it registers and is read by nothing. Every other file in the feature sits below the controller, so importing one reaches up into the HTTP edge. The `pathNot` on the near side subtracts `*.module.ts`: that import is the wiring §7.2 describes, not a violation of it.",
      severity: "error",
      from: { path: "^apps/api/src/[^/]+/", pathNot: "^apps/api/src/[^/]+/[^/]*\\.module\\.ts$" },
      to: { path: "^apps/api/src/[^/]+/[^/]*\\.controller\\.ts$" },
    },

    // ---- Cycles, at two scopes. `scope` is a rule-level key that defaults to "module", so the
    // ---- folder rule is not redundant with the file rule: <feature-a>/ and <feature-b>/ can
    // ---- import each other through a different file on each side and never trip a file cycle.
    // ---- `generated/` is subtracted from `from` exactly as the reference kit subtracts it: the
    // ---- output is the generator's, not this repo's, and a cycle inside it is Prisma's to fix.

    {
      name: "no-file-cycle",
      comment: "No module may depend on itself by a longer path. One file, one way round.",
      severity: "error",
      scope: "module",
      from: { pathNot: "^apps/api/src/generated/" },
      to: { circular: true },
    },
    {
      name: "no-folder-cycle",
      comment:
        "No two folders may depend on each other. This is the one that catches a feature cluster quietly becoming one module split across directories.",
      severity: "error",
      scope: "folder",
      from: { pathNot: "^apps/api/src/generated/" },
      to: { circular: true },
    },

    // ---- §8 / §15.1: "re-export the generated client through one index. No other file imports a
    // ---- generated/ path."
    //
    // This rule could not exist until P4b. While `generated/` was excluded, an edge to it never
    // reached the report, so a rule about that edge could not fire — a line that reads as
    // enforcement and never will enforce, which is the failure mode this file's header warns
    // about. Two things happened together: every gateway module was repointed at
    // `apps/api/src/prisma/index.ts` (39 import sites, and the one wrapper that constructed the
    // client merged into that index so the index is not in a cycle with itself), and `generated/`
    // went back into the graph so this rule has something to catch. `scripts/audit.sh`'s labelled
    // KNOWN for the same invariant is cleared rather than duplicated: one owner, one metric.
    {
      name: "generated-prisma-outside-data-client-index",
      comment:
        "§8: changing the ORM, the generator version or the output layout must be a one-file edit, and that is only true while exactly one file names the generated path. Severity `error` since P4, so a second entry point cannot appear quietly.",
      severity: "error",
      from: { pathNot: ["^apps/api/src/prisma/index\\.ts$", "^apps/api/src/generated/"] },
      to: { path: "^apps/api/src/generated/" },
    },
  ],

  options: {
    // Everything that is not repo source, in one place, so the module count does not move when a
    // checkout gains a build directory: `dist` is the gateway's compiled output, `.next` is Next's,
    // `out` is the scraper's harvest. None of them is part of any architecture anyone wrote, and
    // all three are rebuilt on every run. `docs/` and `.claude/` are not listed because neither is
    // under `apps` or `packages` — the entry points the wrapper passes — and an exclusion that can
    // never match is a comment that reads as a rule.
    //
    // `apps/api/src/generated/` is deliberately NOT in this list any more. It used to be, which is
    // what made the §8 index rule unfireable; P4b routes every importer through the index, and a
    // rule with a reachable target is worth more than a quieter report.
    //
    // Tests are excluded for a different reason, and it is §16.1's fourth load-bearing detail: "Tests
    // sit outside the graph" (§7.2), so `*.spec.ts` is named there. This repo's suites are named
    // `*.test.ts` instead, and excluding only the blueprint's spelling would apply the rule to files
    // nobody writes while exempting the ones everybody does.
    exclude: "^(apps/[^/]+/(dist|out|\\.next)/|.*\\.spec\\.tsx?$|.*\\.test\\.tsx?$)",

    // Without this, type-only edges are invisible to the cruiser and `no-client-to-data-tier` is
    // decoration — measured on this tree: 1743 dependency edges with it on, 1559 without, so 184 of
    // them (11%) and five whole modules are reachable only as `import type`. A type-only import is
    // exactly the shape of the client-to-database edge this blueprint exists to prevent. The cost is
    // a type-aware pass, which is why the wrapper asserts a module count: outside the versions the
    // cruiser understands it reports `0 modules cruised` and exits 0.
    tsPreCompilationDeps: true,
    // The cruiser takes its compiler from the workspace and declares no peer range of its own in its
    // manifest, so there is no range to quote beside this line — which is exactly why §16.1 pairs
    // this option with an assertion rather than a version string. `scripts/audit-depcruise.mjs`
    // fails any cruise of zero modules, and that assertion is only meaningful next to the exact
    // `typescript` pin in the root manifest: widen the pin past what this cruiser understands and the
    // gate reports success without having read a line.
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "types", "node", "default"],
    },
    reporterOptions: { dot: { collapsePattern: "node_modules/[^/]+" } },
  },
};

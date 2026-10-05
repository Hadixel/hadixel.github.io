// One lint config for the whole repo. Every plugin is a root devDependency; no workspace
// carries a lint config of its own. `tseslint.config` preserves the order these blocks appear in,
// so `prettier` goes last and switches off every formatting rule.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/dist/**",
      "**/out/**",
      // Generated code is not ours to lint.
      "apps/api/src/generated/**",
      // The blueprint kit is a foreign repo's artefacts, not repo source.
      "docs/blueprint/**",
      ".scratch/**",
      "tracker/**",
    ],
  },

  js.configs.recommended,

  // TypeScript across every workspace. `recommended` is the non-type-checked set; the
  // type-aware block at the bottom enables the two rules that need a program, which is what
  // makes the compilerOptions in packages/config load-bearing rather than decorative.
  tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      // `_`-prefixed bindings are this codebase's way of saying "deliberately not used" —
      // `const { startsAt: _startsAt, ...withoutStart } = base` is how a test builds the
      // shape-without-a-field, and reporting it is noise on an intentional omission. A rest destructure
      // cannot avoid naming the key at all, so the prefix is the only tool available.
      //
      // `caughtErrors: "none"` for the same reason: a `catch (e)` that is deliberately ignored is
      // common and correct, and forcing every one of them to be renamed `_e` would be a worse signal
      // than the one being suppressed.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },

  {
    files: ["**/*.{ts,tsx,mts}"],
    plugins: { "react-hooks": reactHooks },
    // The two stable rules only. The plugin's newer React-Compiler-aware rules
    // (set-state-in-effect, static-components, use-memo, ...) are an opinionated codemod
    // target, not an invariant: adopting them would mean rewriting working components, which
    // is not what this phase is for.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    languageOptions: {
      parserOptions: {
        projectService: {
          // Files that belong to no tsconfig, so the service has to be told they may stand alone.
          //
          // One file now. The data-tier seed scripts used to be here as well, and typescript-eslint
          // caps this list at 8 — they were 9, so lint stopped working for the whole repository. They
          // have a project of their own now (`apps/api/seed/tsconfig.json`), which is the fix the old
          // comment predicted: a list like this is a to-do, not a configuration.
          //
          // `packages/transport/src/next.ts` is the deliberate one. The package's tsconfig excludes it
          // on purpose — a framework-free package should not depend on a framework to typecheck a thin
          // adapter — and each app typechecks it as part of itself, which is where the framework is. So
          // it belongs to no project, and saying so here is cheaper than pretending otherwise.
          allowDefaultProject: ["packages/transport/src/next.ts"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Type-aware rules. Two only, both of which catch a real class of bug in async code and
  // neither of which is a style opinion. This block is why the project service is configured.
  {
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  },

  // ---- Per-workspace blocks. The point of these is that the globals each surface is allowed to
  // ---- touch are stated, not inherited by accident.

  // The storefront. One block per app rather than one block with an `apps/*/` glob: the Next
  // plugin resolves `settings.next.rootDir` as a single path, so a glob makes it resolve once
  // and then match both apps — reporting every hit twice. A rule that double-counts is as wrong
  // as a rule that reports nothing.
  {
    files: ["apps/store/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: {
      // Without this the plugin looks for a pages directory at the repo root and warns once
      // per run. The App Router is the only routing here.
      next: { rootDir: "apps/store/" },
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },

  // The admin panel. Same rules, except that it renders user-uploaded media straight from the
  // storage bucket: next/image would need a `remotePatterns` allowlist that then has to track
  // every upload domain, and the panel has no LCP budget to protect. The storefront keeps it on.
  {
    files: ["apps/admin/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    settings: {
      next: { rootDir: "apps/admin/" },
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "@next/next/no-img-element": "off",
    },
  },

  // The component library: a browser package, though its own tooling config is Node.
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // The data tier: the client wrapper and the seeds, both Node-only.
  {
    files: ["apps/api/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The adapter package had a block here until it was dissolved into the gateway. A `files` pattern
  // matching nothing is not an error and not a warning — it is a rule that has quietly stopped
  // applying to anything, which is the one failure mode a lint config has that a compiler does not.

  // The scraper: a command-line tool, so Node and nothing else.
  {
    files: ["apps/scraper/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The scraper's library half, now a package: pure functions plus filesystem, DNS and HTTP, so
  // Node and nothing else. Its own block because the app's pattern names `apps/`, and a `files`
  // pattern that has stopped matching anything is a rule that has quietly stopped applying.
  {
    files: ["packages/scraper-core/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The kernel: pure domain contracts. Neither browser nor Node globals — if it ever reaches
  // for one, that is a signal the contract belongs in a client, not here.
  {
    files: ["packages/contracts/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {},
    },
  },

  // The config-only package holds JSON, nothing to lint.
  {
    files: ["packages/config/**/*"],
    ignores: ["packages/config/**/*"],
  },

  // Tooling config files at a workspace root.
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      sourceType: "module",
      globals: { ...globals.node },
    },
  },

  // The CommonJS gate scripts, and the one CommonJS file at the root, are CommonJS on purpose: the
  // root manifest declares no `"type"`, so `export default` in any of them is reparsed as an ES
  // module on every run — a warning and an extra parse each time — while `.dependency-cruiser.js`
  // is discovered by name and loaded either way. `node --test` loads a `scripts/*.test.js` the
  // same way.
  //
  // The exemption is scoped by path, not by turning the rule off for `*.js` everywhere: the rule
  // exists to keep the app and package sources on ESM, and a blanket `**/*.js` exemption would
  // extend that silence to any CommonJS file a future change drops in those trees. It is written
  // as an explicit list because each of these files is a deliberate exception and a new one should
  // be a decision someone makes twice — once here and once in review.
  {
    files: [
      ".dependency-cruiser.js",
      "scripts/fs-tree.js",
      "scripts/gateway-archetypes.js",
      "scripts/client-structure-config.js",
      "scripts/audit-structure.js",
      "scripts/audit-client-structure.js",
      "scripts/audit-app-root.js",
      "scripts/*.test.js",
    ],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  prettier,
);

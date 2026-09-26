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
      "packages/db/src/generated/**",
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
          // Files that belong to no tsconfig, so the service has to be told they may stand
          // alone: the data-tier seed scripts, which are linted here but stay outside the
          // typecheck project (P2 rewrites them when they move into the gateway).
          //
          // typescript-eslint caps allowDefaultProject at 8 files and hard-errors past that.
          // Eight seed scripts exist today, so this sits at the ceiling: the next one needs
          // either a tsconfig include or a split.
          allowDefaultProject: ["packages/db/seed/*.ts"],
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
    files: ["packages/db/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Outbound adapters: cloud, payment, SMS, shipping. All Node.
  {
    files: ["packages/adapters/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The scraper: a command-line tool, so Node and nothing else.
  {
    files: ["packages/scraper/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // The kernel: pure domain contracts. Neither browser nor Node globals — if it ever reaches
  // for one, that is a signal the contract belongs in a client, not here.
  {
    files: ["packages/schema/**/*.{ts,tsx}"],
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

  prettier,
);

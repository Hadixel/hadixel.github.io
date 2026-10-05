# Blueprint kit

A portable copy of the architecture blueprint, plus a working example of the checks that enforce it.
Drop this folder into another repo and use it to clean that repo up.

## What is here

| Path | What it is | Copy as-is? |
| --- | --- | --- |
| `ARCHITECTURE-BLUEPRINT.md` | The laws. This document decides. | Yes |
| `examples/BLUEPRINT-ADOPTION-PLAN.md` | How Noor was brought into line: an audit, then phases P0-P5. A worked example of §17.2. | No - read it, then write your own plan |
| `reference/` | Noor's real config and audit scripts. They show how §12 and §16 look in practice. | No - adapt paths and names first |

### `reference/` in detail

| File | Blueprint section |
| --- | --- |
| `turbo.json` | §12 task graph, §16 workspace boundary tags |
| `packages/config/` | §5.3 the shared config package (tsconfig presets per tier) |
| `eslint.config.mjs`, `.prettierrc`, `.prettierignore` | §6 one root lint and format config |
| `.dependency-cruiser.js` | §16.1 the primary gate: cycles, tier rules, archetype rules |
| `ratchet.json`, `scripts/ratchet.mjs` | §15.3 the ratchet |
| `scripts/audit.sh` | §16.1 the `audit` task - runs everything below |
| `scripts/audit-*.js` + `*.test.js` | §16.1 the custom checks, each with its own tests |
| `scripts/client-structure-config.js`, `scripts/gateway-structure-config.js` | The allowlists the audit scripts read |
| `package.json` | The root dev dependencies the checks need (`turbo`, `dependency-cruiser`, `@manypkg/cli`, ...) |

## Noor-specific things to change

The reference files name Noor's layout. Replace these with the target repo's names:

- Package scope `@noor/...` (for example `@noor/api`, `@noor/contracts`, `@noor/config`).
- App paths `apps/api`, `apps/admin`, `apps/storefront` - in `.dependency-cruiser.js`,
  `eslint.config.mjs`, `scripts/*-structure-config.js`.
- Prisma paths (`prisma/schema.prisma`, `src/generated/prisma`) in `turbo.json` and `eslint.config.mjs`.
- The allowlist entries in `scripts/audit-no-prose-em-dash.js`.
- The paths in `ratchet.json` commands.

## How to use it

1. Copy this folder into the other repo, for example as `docs/blueprint/`.
2. Tell the agent: "Read `docs/blueprint/ARCHITECTURE-BLUEPRINT.md` in **Audit** mode and follow §17.2."
3. The agent measures first (phase 0) and writes the findings down. No code changes yet.
4. Fix the violations **before** you turn a gate on. A gate that lands red gets ignored.
5. Use `reference/` as the model for the tooling. Use `examples/` as the model for the plan.

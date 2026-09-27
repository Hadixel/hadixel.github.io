// Marks the gateway's compiled output as CommonJS.
//
// apps/api/package.json declares "type": "module" because the rest of the workspace is ESM, so
// without this file Node reads every emitted dist/**/*.js as an ES module and refuses the
// `require` calls tsc emitted for CommonJS. A package.json in dist/ overrides the nearest one, and
// the emitted tree mirrors the repository layout (dist/apps/api/src/main.js), so this is written at
// the root of the output rather than beside the entry point.
//
// The gateway is CommonJS because NestJS dependency injection needs `design:paramtypes`, which only
// a real TypeScript emit produces, and the generated Prisma client resolves extensionless relative
// imports, which only the CommonJS resolver accepts. See apps/api/tsconfig.build.json, which
// records the whole chain, and the `moduleFormat = "cjs"` generator option it depends on.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "apps/api/dist");

mkdirSync(DIST, { recursive: true });
writeFileSync(resolve(DIST, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);

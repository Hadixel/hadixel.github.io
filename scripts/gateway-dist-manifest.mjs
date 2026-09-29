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

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "apps/api/dist");

mkdirSync(DIST, { recursive: true });
writeFileSync(resolve(DIST, "package.json"), `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`);

/* Second job: make the emitted require()s resolvable at runtime.
 *
 * tsconfig.build.json sets rootDir to the repository root so the workspace
 * packages enter the program and are emitted beside the app — dist/packages/
 * schema/src/index.js is right there. But the emitted code still says
 * require("@kmodern/schema"), and Node resolves that specifier through the
 * workspace symlink in node_modules to packages/schema, whose "exports" points
 * at "./src/index.ts". A Node process cannot require() TypeScript, so the boot
 * died with ERR_MODULE_NOT_FOUND on a file that had been compiled successfully
 * one directory away.
 *
 * So each workspace package gets a stub package.json in dist/node_modules that
 * redirects the bare specifier to the compiled copy. Written as a redirect
 * rather than a copy so the two can never drift, and only for packages that are
 * actually emitted into dist/packages, so a package that has no build of its own
 * is not silently pointed at nothing. */
const EMITTED_PACKAGES = ["schema"];

for (const name of EMITTED_PACKAGES) {
  const compiled = resolve(DIST, "packages", name, "src/index.js");
  if (!existsSync(compiled)) {
    console.warn(`gateway-dist-manifest: no compiled ${name} in dist; leaving its specifier alone`);
    continue;
  }
  const stubDir = resolve(DIST, "node_modules", "@kmodern", name);
  // Cleared first: a stale copy of the compiled tree would survive a rebuild in
  // which a module was deleted, and nothing would notice.
  rmSync(stubDir, { recursive: true, force: true });
  mkdirSync(stubDir, { recursive: true });
  /* "exports" targets must start with "./" and may not climb out with "..", so the
     stub cannot redirect to a sibling of its own directory. It redirects into its
     own tree instead, and the compiled tree is copied alongside it. Copying is
     safe here precisely because it is emitted by the same tsc pass into the same
     directory, so there is no second build to drift out of sync. */
  const target = resolve(stubDir, "src");
  cpSync(resolve(DIST, "packages", name, "src"), target, { recursive: true });
  /* A copy of the package still resolves its own dependencies by walking up from
     its real location, which is now inside dist — where there is no node_modules
     for @aws-sdk. So each dependency the source package declares is symlinked in
     from the source package, where pnpm has already installed it. A symlink
     rather than a copy so there is still one installed copy on disk. */
  const sourcePkg = JSON.parse(readFileSync(resolve(ROOT, "packages", name, "package.json"), "utf8"));
  for (const dep of Object.keys(sourcePkg.dependencies ?? {})) {
    const installed = resolve(ROOT, "packages", name, "node_modules", dep);
    if (!existsSync(installed)) continue;
    const linkPath = resolve(stubDir, "node_modules", dep);
    mkdirSync(dirname(linkPath), { recursive: true });
    if (!existsSync(linkPath)) symlinkSync(resolve(ROOT, "packages", name, "node_modules", dep), linkPath);
  }
  /* The source package's "exports" map is the contract, so the stub mirrors its
     shape rather than inventing one. The emitted code imports subpaths such as
     @kmodern/schema/setting-keys, and a stub declaring only "." fails with
     ERR_PACKAGE_PATH_NOT_EXPORTED on the first subpath it reaches. */
  const exportsMap = {};
  for (const [subpath, target] of Object.entries(sourcePkg.exports ?? { ".": "./src/index.ts" })) {
    if (typeof target !== "string" || !target.endsWith(".ts")) continue;
    const file = subpath === "." ? "index" : subpath.replace(/^\.\//, "").replace(/\.ts$/, "");
    exportsMap[subpath] = `./src/${file}.js`;
  }

  writeFileSync(
    resolve(stubDir, "package.json"),
    `${JSON.stringify(
      {
        name: `@kmodern/${name}`,
        version: "0.0.0-compiled",
        // CommonJS like everything else in dist, and without "type" the emitted
        // require()s are read as ESM the same way the root dist marker prevents.
        type: "commonjs",
        main: "./src/index.js",
        exports: exportsMap,
      },
      null,
      2,
    )}\n`,
  );
}

// Every relative import must resolve to a file that exists.
//
// This exists because of a real miss: moving the data tier into the gateway renamed two source
// modules, and the six data scripts that import them were deliberately outside the typecheck
// project, so nothing reported the break. A type error is a type project's job; a path that does
// not resolve is every project's job, including the ones no typecheck covers.
//
// It walks from the repository root rather than a named list of directories, so a new home for
// code cannot fall outside the check by simply not being listed. The exclusions below are the
// only exceptions: vendored trees, build output, generated code, and dot-directories.
//
// docs is excluded because the blueprint carries reference scripts that are illustrative fragments
// of an audit, not part of this build: they import a ./helper and a ./index that never existed
// here. They are quoted evidence, so they are held to no rule. It is excluded only at the top
// level, because a docs/ directory inside a package is ordinary package documentation whose
// imports are just as breakable as anyone else's.
//
// An import that points into generated/ is reported as deferred, not as a failure: the Prisma
// client is produced by the generate step and is not committed, so a fresh checkout has no such
// file to find. The count is printed so the deferral is visible instead of a silent pass — §16.1
// treats a green check that examined nothing as the failure mode to design against.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Anywhere in the tree: these are never source, at any depth.
const SKIP = new Set(["node_modules", "dist", "out", "generated"]);
// Only at the root: a directory with this name elsewhere is ordinary content.
const SKIP_AT_ROOT = new Set(["docs"]);
// Every extension this repo writes or runs. .mjs and .cjs are here because the root config files
// are .mjs — the header's claim that nothing can fall outside the walk is false without them.
const SOURCE = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
const EXT = [".ts", ".tsx", ".mts", ".js"];

function* sourceFiles(dir, depth) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP.has(entry.name) || (depth === 0 && SKIP_AT_ROOT.has(entry.name))) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full, depth + 1);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

function resolves(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier).replace(/\.(js|mjs)$/, "");
  for (const candidate of [
    base,
    ...EXT.map((ext) => base + ext),
    ...EXT.map((ext) => join(base, "index" + ext)),
  ]) {
    try {
      if (statSync(candidate).isFile()) return true;
    } catch {
      /* keep looking */
    }
  }
  return false;
}

const specifier = /(?:from|import|require)\s*\(?\s*['"](\.[^'"]+)['"]/g;
// A path segment, not a substring: a file called generated-helpers.ts is ordinary source.
const isGenerated = (path) => path.split(sep).includes("generated");
const broken = [];
const deferred = [];
let examined = 0;
for (const file of sourceFiles(ROOT, 0)) {
  examined++;
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(specifier)) {
    if (resolves(file, match[1])) continue;
    const line = `${relative(ROOT, file)} -> ${match[1]}`;
    if (isGenerated(resolve(dirname(file), match[1]))) deferred.push(line);
    else broken.push(line);
  }
}

// Zero files examined means the walk found nothing and every line above is a vacuous pass. Fail
// rather than print a green tick over an empty scan.
if (examined === 0) {
  console.error("examined 0 files: the walk is broken, not the tree");
  process.exit(1);
}

if (broken.length) {
  console.error(`${broken.length} relative import(s) do not resolve (of ${examined} files):`);
  for (const line of broken) console.error(`  ${line}`);
  process.exit(1);
}
const note = deferred.length ? `, ${deferred.length} deferred to the generate step` : "";
console.log(`all relative imports resolve (${examined} files${note})`);

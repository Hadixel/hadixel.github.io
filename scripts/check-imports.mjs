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
//
// The specifiers come from the parse tree, not from a regex over the text. A regex matches import
// syntax inside string literals too: the test that writes an ESM probe to prove the URL guard is
// enforced contains a whole import statement as a string, and a regex reports an import that does
// not exist. Stripping the strings first is the obvious repair and is worse — a hand-rolled string
// stripper mis-pairs an odd quote and swallows the real imports after it, which was verified by
// planting a broken import next to one: the regex version called the tree clean. A gate that cannot
// see a break is not a gate. The compiler is already a pinned root devDependency, so it does the
// reading.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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

// Every way source can name another module: a static import, a re-export, a dynamic `import()`,
// and a CommonJS `require()`. Read off the tree, so a string that merely looks like an import is
// not one.
const SCRIPT_KIND = { ".ts": ts.ScriptKind.TS, ".tsx": ts.ScriptKind.TSX, ".jsx": ts.ScriptKind.JSX, ".js": ts.ScriptKind.JS, ".mjs": ts.ScriptKind.JS, ".cjs": ts.ScriptKind.JS, ".mts": ts.ScriptKind.TS, ".cts": ts.ScriptKind.TS };

function specifiersOf(file, source) {
  const kind = SCRIPT_KIND[file.slice(file.lastIndexOf("."))] ?? ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, kind);
  const found = [];
  const literal = (node) => (ts.isStringLiteralLike(node) ? node.text : undefined);
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      const text = literal(node.moduleSpecifier);
      if (text !== undefined) found.push(text);
    } else if (
      ts.isCallExpression(node) &&
      (ts.isImportKeyword(node.expression) ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const text = literal(node.arguments[0]);
      if (text !== undefined) found.push(text);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

// A path segment, not a substring: a file called generated-helpers.ts is ordinary source.
const isGenerated = (path) => path.split(sep).includes("generated");
const broken = [];
const deferred = [];
let examined = 0;
for (const file of sourceFiles(ROOT, 0)) {
  examined++;
  const source = readFileSync(file, "utf8");
  for (const specifier of specifiersOf(file, source)) {
    if (!specifier.startsWith(".")) continue;
    if (resolves(file, specifier)) continue;
    const line = `${relative(ROOT, file)} -> ${specifier}`;
    if (isGenerated(resolve(dirname(file), specifier))) deferred.push(line);
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

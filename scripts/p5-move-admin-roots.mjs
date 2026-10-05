// P5 — one feature root per directory in the admin panel (`apps/admin`).
//
// Blueprint §9.4 ("Client structure conventions"):
//
//   src/
//   ├── app|routes/                # routing only - thin entries
//   │   ├── (group)/               # route groups carry auth, providers, layout
//   │   └── <route>/_components/   # route-local components (underscore = not a route)
//   ├── <feature-root>/            # one per feature: lib/, hooks/, components/, state, types.ts
//   ├── components/                # app-wide shared components
//   ├── lib/                       # app-level helpers, transport instance
//   └── types/                     # app-level types
//
// …"A route directory holds only the framework's own route files… Every other unit
// under a route lives in that route's `_components/` directory, or in the feature
// root." …"A feature has exactly one root directory, holding that feature's lib,
// hooks, components, state and `types.ts`. A `lib/<feature>/` beside a
// `store/<feature>/` is one feature with two homes, which founding rule 5 (§3)
// forbids." …"`src/lib/`, `src/components/` and `src/types/` are app-wide only."
//
// This script performs the moves in one pass and rewrites the import specifiers
// that pointed at them. It is **one-shot by construction**: it asserts, for every
// pair, that the `from` path exists and the `to` path does not, and a single
// mismatch aborts the run before a single file has been moved. Re-running it on
// the tree it already produced therefore fails on its first already-moved path,
// which is the behaviour that makes a partial run impossible to mistake for a
// complete one.
//
// Why every path is asserted rather than skipped:
//   * A `from` that is missing means the tree is not the one this table was
//     written against — a move already happened, or the table is stale. Skipping
//     it would leave that one file behind and still report success.
//   * A `to` that exists means the destination is occupied, and `renameSync`
//     would clobber it. That is data loss, not a merge conflict.
// So the assertion is all-or-nothing and runs up front: a table is only correct if
// every row of it is.
//
// The specifiers come off the parse tree with the TypeScript compiler API, the
// same way `scripts/check-imports.mjs` does and for the same reason: a regex over
// the text matches import syntax inside string literals too, and this tree has
// files that write whole import statements as strings. Every specifier is
// resolved *against the tree as it was before the moves* — otherwise the
// specifiers of the files that did not move (`./delete-post` beside the page that
// imports it, say) would resolve to nothing at all — and the resolved old path is
// then mapped through the table. Resolution is by path, never by string prefix
// matching on route segment text: route directories carry parentheses and brackets
// (`src/app/(panel)/…`, `src/app/(panel)/orders/[id]/…`) and a prefix match on
// that text is not a path match.
//
// Run from the repo root: `node scripts/p5-move-admin-roots.mjs`.

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = "apps/admin";
const SRC = join(ROOT, APP, "src");

/**
 * Every move, as `{ from, to }` pairs repo-relative and with the basenames as they
 * were. Three of them are renames, and each is forced rather than chosen:
 *
 *   * `orders/[id]/transitions.tsx` and `orders/new/form.tsx` cannot both land
 *     under the route directory they came from — a directory name may appear once
 *     per client — so each takes a name that says what it is.
 *   * `lib/actions/auth.ts` cannot land as `auth.ts`, because `lib/auth.ts`
 *     already owns that basename in the same feature root. It takes the name this
 *     repo already gives a `"use server"` adapter over a plain module
 *     (`product.ts`/`product-actions.ts`, `settings.ts`/`settings-actions.ts`).
 */
const MOVES = [
  // ---- components out of the app-wide shelf -------------------------------
  ["apps/admin/src/components/blog-editor.tsx", "apps/admin/src/content/components/blog-editor.tsx"],
  ["apps/admin/src/components/nav-editor.tsx", "apps/admin/src/content/components/nav-editor.tsx"],
  ["apps/admin/src/components/page-builder.tsx", "apps/admin/src/content/components/page-builder.tsx"],
  ["apps/admin/src/components/product-form.tsx", "apps/admin/src/catalogue/components/product-form.tsx"],
  ["apps/admin/src/components/discount-form.tsx", "apps/admin/src/discounts/components/discount-form.tsx"],
  ["apps/admin/src/components/scraper-panel.tsx", "apps/admin/src/scraper/components/scraper-panel.tsx"],
  ["apps/admin/src/components/settings-form.tsx", "apps/admin/src/settings/components/settings-form.tsx"],
  ["apps/admin/src/components/media-picker-button.tsx", "apps/admin/src/media/components/media-picker-button.tsx"],

  // ---- route-local units out of the route tree (§9.4) ---------------------
  ["apps/admin/src/app/login/login-form.tsx", "apps/admin/src/auth/components/login-form.tsx"],
  ["apps/admin/src/app/change-password/change-password-form.tsx", "apps/admin/src/auth/components/change-password-form.tsx"],
  ["apps/admin/src/app/(panel)/blog/delete-post.tsx", "apps/admin/src/content/components/delete-post.tsx"],
  ["apps/admin/src/app/(panel)/categories/categories-manager.tsx", "apps/admin/src/catalogue/components/categories-manager.tsx"],
  ["apps/admin/src/app/(panel)/collections/collections-manager.tsx", "apps/admin/src/catalogue/components/collections-manager.tsx"],
  ["apps/admin/src/app/(panel)/discounts/delete-discount.tsx", "apps/admin/src/discounts/components/delete-discount.tsx"],
  ["apps/admin/src/app/(panel)/inventory/adjust-form.tsx", "apps/admin/src/inventory/components/adjust-form.tsx"],
  ["apps/admin/src/app/(panel)/media/media-library.tsx", "apps/admin/src/media/components/media-library.tsx"],
  ["apps/admin/src/app/(panel)/media/media-upload.tsx", "apps/admin/src/media/components/media-upload.tsx"],
  ["apps/admin/src/app/(panel)/orders/[id]/transitions.tsx", "apps/admin/src/orders/components/order-transitions.tsx"],
  ["apps/admin/src/app/(panel)/orders/new/form.tsx", "apps/admin/src/orders/components/new-order-form.tsx"],
  ["apps/admin/src/app/(panel)/pages/delete-page.tsx", "apps/admin/src/content/components/delete-page.tsx"],

  // ---- feature libraries ---------------------------------------------------
  ["apps/admin/src/lib/auth.ts", "apps/admin/src/auth/lib/auth.ts"],
  ["apps/admin/src/lib/scraper-image-upload.ts", "apps/admin/src/scraper/lib/scraper-image-upload.ts"],
  ["apps/admin/src/lib/scraper-images.ts", "apps/admin/src/scraper/lib/scraper-images.ts"],
  ["apps/admin/src/lib/scraper-jobs.ts", "apps/admin/src/scraper/lib/scraper-jobs.ts"],
  ["apps/admin/src/lib/scraper-types.ts", "apps/admin/src/scraper/lib/scraper-types.ts"],

  // ---- one feature's server actions into that feature (§9.4) ---------------
  ["apps/admin/src/lib/actions/auth.ts", "apps/admin/src/auth/lib/auth-actions.ts"],
  ["apps/admin/src/lib/actions/category-actions.ts", "apps/admin/src/catalogue/lib/category-actions.ts"],
  ["apps/admin/src/lib/actions/category.ts", "apps/admin/src/catalogue/lib/category.ts"],
  ["apps/admin/src/lib/actions/collection-actions.ts", "apps/admin/src/catalogue/lib/collection-actions.ts"],
  ["apps/admin/src/lib/actions/collection.ts", "apps/admin/src/catalogue/lib/collection.ts"],
  ["apps/admin/src/lib/actions/product-actions.ts", "apps/admin/src/catalogue/lib/product-actions.ts"],
  ["apps/admin/src/lib/actions/product.ts", "apps/admin/src/catalogue/lib/product.ts"],
  ["apps/admin/src/lib/actions/discount-actions.ts", "apps/admin/src/discounts/lib/discount-actions.ts"],
  ["apps/admin/src/lib/actions/discount.ts", "apps/admin/src/discounts/lib/discount.ts"],
  ["apps/admin/src/lib/actions/media-actions.ts", "apps/admin/src/media/lib/media-actions.ts"],
  ["apps/admin/src/lib/actions/media.ts", "apps/admin/src/media/lib/media.ts"],
  ["apps/admin/src/lib/actions/nav-actions.ts", "apps/admin/src/content/lib/nav-actions.ts"],
  ["apps/admin/src/lib/actions/nav.ts", "apps/admin/src/content/lib/nav.ts"],
  ["apps/admin/src/lib/actions/page-actions.ts", "apps/admin/src/content/lib/page-actions.ts"],
  ["apps/admin/src/lib/actions/page.ts", "apps/admin/src/content/lib/page.ts"],
  ["apps/admin/src/lib/actions/post-actions.ts", "apps/admin/src/content/lib/post-actions.ts"],
  ["apps/admin/src/lib/actions/post.ts", "apps/admin/src/content/lib/post.ts"],
  ["apps/admin/src/lib/actions/order-status.ts", "apps/admin/src/orders/lib/order-status.ts"],
  ["apps/admin/src/lib/actions/orders.ts", "apps/admin/src/orders/lib/orders.ts"],
  ["apps/admin/src/lib/actions/settings-actions.ts", "apps/admin/src/settings/lib/settings-actions.ts"],
  ["apps/admin/src/lib/actions/settings.ts", "apps/admin/src/settings/lib/settings.ts"],

  // ---- the tests that drive them, which read their sources relatively ------
  // Each resolves `./<module>.ts` against its own location, so a test that stayed
  // behind would be reading a file that is no longer there.
  ["apps/admin/src/lib/actions/catalogue.test.ts", "apps/admin/src/catalogue/lib/catalogue.test.ts"],
  ["apps/admin/src/lib/actions/discount.test.ts", "apps/admin/src/discounts/lib/discount.test.ts"],
  ["apps/admin/src/lib/actions/media.test.ts", "apps/admin/src/media/lib/media.test.ts"],
  ["apps/admin/src/lib/actions/nav.test.ts", "apps/admin/src/content/lib/nav.test.ts"],
  ["apps/admin/src/lib/actions/order-status.test.ts", "apps/admin/src/orders/lib/order-status.test.ts"],
  ["apps/admin/src/lib/actions/page.test.ts", "apps/admin/src/content/lib/page.test.ts"],
  ["apps/admin/src/lib/actions/post.test.ts", "apps/admin/src/content/lib/post.test.ts"],
  ["apps/admin/src/lib/actions/product.test.ts", "apps/admin/src/catalogue/lib/product.test.ts"],
  ["apps/admin/src/lib/actions/settings.test.ts", "apps/admin/src/settings/lib/settings.test.ts"],
];

const EXT = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs", ".cjs"];
const SOURCE = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
const SKIP = new Set(["node_modules", ".next", ".turbo"]);
const SCRIPT_KIND = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".jsx": ts.ScriptKind.JSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
};

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** An absolute path with this app's module extensions stripped. */
function stem(path) {
  const ext = path.slice(path.lastIndexOf("."));
  return EXT.includes(ext) ? path.slice(0, -ext.length) : path;
}

// ---------------------------------------------------------------- assertion
// Every path is checked before anything moves. One mismatch aborts the run.
const problems = [];
for (const [from, to] of MOVES) {
  if (!isFile(join(ROOT, from))) {
    problems.push(`${from}: does not exist (already moved, or the table is stale)`);
  }
  if (existsSync(join(ROOT, to))) {
    problems.push(`${to}: already exists (renameSync would overwrite it)`);
  }
}
if (problems.length > 0) {
  console.error("p5-move-admin-roots: refusing to move anything —");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

// -------------------------------------------------------------------- moves
for (const [from, to] of MOVES) {
  const toAbs = join(ROOT, to);
  mkdirSync(dirname(toAbs), { recursive: true });
  renameSync(join(ROOT, from), toAbs);
}

// ------------------------------------------------------- import rewriting
/** old absolute path → new absolute path, for the files that moved. */
const MOVED = new Map(MOVES.map(([from, to]) => [join(ROOT, from), join(ROOT, to)]));
/** new absolute path → old absolute path, so a moved importer is recognised. */
const ORIGIN = new Map([...MOVED].map(([oldPath, newPath]) => [newPath, oldPath]));

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

const everySourceFile = [...sourceFiles(SRC)];

/**
 * Old location → current location, keyed by the extensionless path a specifier
 * would name. Built after the moves from the files as they now stand, because the
 * old tree no longer exists while the specifiers of the unmoved files still
 * describe it.
 */
const index = new Map();
for (const file of everySourceFile) {
  index.set(stem(ORIGIN.get(file) ?? file), { oldPath: ORIGIN.get(file) ?? file, file });
}

/** Where a specifier pointed before the moves, and where that file is now. */
function targetOf(oldFile, specifier) {
  const bare = specifier.replace(/\.(js|mjs)$/, "");
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(oldFile), specifier);
  else return null;
  const candidates = [
    base,
    ...EXT.map((ext) => base + ext),
    ...EXT.map((ext) => join(base, "index" + ext)),
  ];
  for (const candidate of candidates) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  return isFile(bare) ? { oldPath: bare, file: bare } : null;
}

/** `@/` + the path of `file` inside this app's src, without its extension. */
const asAlias = (file) => "@/" + relative(SRC, stem(file)).split(sep).join("/");

/** Module specifiers, read off the parse tree, with the node that carries each. */
function specifierNodes(file, source) {
  const kind = SCRIPT_KIND[file.slice(file.lastIndexOf("."))] ?? ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, kind);
  const found = [];
  const literal = (node) => (ts.isStringLiteralLike(node) ? node : undefined);
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const text = literal(node.moduleSpecifier);
      if (text) found.push({ node: text, text: text.text });
    } else if (
      ts.isCallExpression(node) &&
      (ts.isImportKeyword(node.expression) ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const text = literal(node.arguments[0]);
      if (text) found.push({ node: text, text: text.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

let rewrittenFiles = 0;
let rewritten = 0;
for (const file of everySourceFile) {
  const source = readFileSync(file, "utf8");
  // Specifiers are read against the importer's own *old* location; a relative one
  // in a file that moved would otherwise resolve from its new one.
  const oldFile = ORIGIN.get(file) ?? file;
  const edits = [];
  for (const { node, text } of specifierNodes(file, source)) {
    const target = targetOf(oldFile, text);
    if (target === null) continue;
    // Nothing to say unless the target moved or the importer's own position did.
    if (target.file === target.oldPath && !ORIGIN.has(file)) continue;
    const alias = asAlias(target.file);
    if (alias === text) continue;
    // `getStart` would hand back the position *inside* the quotes — the scanner
    // treats the opening quote as trivia before a string literal — so an edit
    // taken from there would drop them and leave a bare identifier in the source.
    // `node.pos` is the end of the previous token, and skipping trivia from
    // there lands on the opening quote, which is where the literal begins; the
    // replacement has to carry the same quote the file already used.
    const start = ts.skipTrivia(source, node.pos);
    const quote = source[start] === "'" ? "'" : '"';
    edits.push({ start, end: node.getEnd(), text: quote + alias + quote });
  }
  if (edits.length === 0) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  writeFileSync(file, out);
  rewrittenFiles += 1;
  rewritten += edits.length;
}

console.log(
  `p5-move-admin-roots: ${MOVES.length} files moved, ${rewritten} specifiers rewritten across ${rewrittenFiles} files`,
);

// P5 — give every `apps/store` feature one root directory, and empty the route
// directories of everything that is not a route file.
//
// Blueprint §9.4 ("Client structure conventions"), the rule this implements:
//
//   src/
//   ├── app|routes/                # routing only - thin entries
//   ├── <feature-root>/            # one per feature: lib/, hooks/, components/, state, types.ts
//   ├── components/                # app-wide shared components
//   ├── lib/                       # app-level helpers, transport instance
//   └── types/                     # app-level types
//
// and its two companions: "A feature has exactly one root directory" (founding
// rule 5, §3) and "`src/lib/`, `src/components/` and `src/types/` are app-wide
// only".
//
// ONE-SHOT BY CONSTRUCTION. This script is not idempotent and is not meant to
// be: it asserts that every `from` in the table below exists on disk and that
// every `to` does not, and it exits 1 on the first pair that does not match —
// before a single file has been moved. So a second run aborts immediately on
// the first already-moved path rather than half-applying itself to a tree that
// has already moved. Re-running a move script over a partially-moved tree is
// how half a feature ends up in two roots, which is the failure this ticket
// exists to remove; the assertion is the guard against it.
//
// WHY EVERY PATH IS ASSERTED. The alternative — skip what is missing, move what
// is there — turns a stale table into a silent half-migration: the script
// reports success, `import` lines keep pointing at the old homes, and the break
// surfaces later as a type error in a file nobody was looking at. Asserting the
// whole table *first*, and aborting before any mutation, means a wrong table is
// a no-op with a printed reason rather than a partially-moved tree. The `to`
// assertion matters for the same reason in the other direction: a destination
// that already exists means the table disagrees with the tree, and overwriting
// it would destroy a file the table never mentioned.
//
// The specifiers are read off the parse tree with the TypeScript compiler, the
// same way `scripts/check-imports.mjs` does it and for the same reason: a regex
// over the text also matches import syntax inside string literals, and a
// hand-rolled string stripper mis-pairs an odd quote and swallows the real
// imports after it. TypeScript is already a pinned root devDependency.
//
// Usage, from the repository root:
//
//     node scripts/p5-move-store-roots.mjs

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "apps/store/src");

/**
 * Every move, repo-relative, with basenames as they were.
 *
 * Deviations from the ticket's prescribed table, and why:
 *
 *   `src/components/listing-rail.tsx` → `src/catalogue/components/` — not in the
 *   prescribed table, but §9.4's "a file belongs to exactly one feature" covers
 *   it: its only importers are `product-listing.tsx` and
 *   `mobile-category-filter.tsx`, both of which the table sends to the catalogue
 *   root. Left in `src/components/` it would be app-wide chrome used by one
 *   feature.
 *
 *   `src/components/newsletter-form.tsx` → `src/content/components/` — same
 *   argument: its only importer is `block-renderer.tsx`, which the table sends
 *   to the content root.
 *
 *   `src/app/api/checkout/gateway.ts` → `src/checkout/lib/checkout-gateway.ts` —
 *   the rename is prescribed, and the reason is recorded here so it is not
 *   "tidied" back: the destination directory is new, so `gateway.ts` would be a
 *   second file of that name in the tree beside the transport instance
 *   `src/lib/gateway.ts`, and two `gateway.ts` files is exactly the ambiguity
 *   this ticket removes elsewhere. `checkout-gateway.ts` says which gateway it
 *   is at every import site.
 *
 * Not moved, deliberately: `src/app/global-error.tsx` stays, because Next.js only
 * picks the root error boundary up at `app/global-error.tsx` — moving it deletes
 * the boundary rather than moving it.
 */
const MOVES = [
  // ---- account ----
  ["apps/store/src/components/account-button.tsx", "apps/store/src/account/components/account-button.tsx"],
  ["apps/store/src/components/auth-modal.tsx", "apps/store/src/account/components/auth-modal.tsx"],
  ["apps/store/src/components/otp-modal.tsx", "apps/store/src/account/components/otp-modal.tsx"],
  ["apps/store/src/app/account/account-area.tsx", "apps/store/src/account/components/account-area.tsx"],
  ["apps/store/src/app/account/account-login.tsx", "apps/store/src/account/components/account-login.tsx"],
  ["apps/store/src/lib/customer-session.ts", "apps/store/src/account/lib/customer-session.ts"],

  // ---- cart ----
  ["apps/store/src/components/cart-button.tsx", "apps/store/src/cart/components/cart-button.tsx"],
  ["apps/store/src/components/cart-provider.tsx", "apps/store/src/cart/components/cart-provider.tsx"],
  ["apps/store/src/components/quantity-stepper.tsx", "apps/store/src/cart/components/quantity-stepper.tsx"],
  ["apps/store/src/lib/cart.ts", "apps/store/src/cart/lib/cart.ts"],

  // ---- checkout ----
  ["apps/store/src/app/checkout/checkout-client.tsx", "apps/store/src/checkout/components/checkout-client.tsx"],
  ["apps/store/src/app/api/checkout/gateway.ts", "apps/store/src/checkout/lib/checkout-gateway.ts"],

  // ---- orders ----
  ["apps/store/src/components/order-row.tsx", "apps/store/src/orders/components/order-row.tsx"],
  ["apps/store/src/components/pay-button.tsx", "apps/store/src/orders/components/pay-button.tsx"],
  ["apps/store/src/lib/my-orders.ts", "apps/store/src/orders/lib/my-orders.ts"],

  // ---- catalogue ----
  ["apps/store/src/components/product-grid.tsx", "apps/store/src/catalogue/components/product-grid.tsx"],
  ["apps/store/src/components/product-listing.tsx", "apps/store/src/catalogue/components/product-listing.tsx"],
  ["apps/store/src/components/category-tree.tsx", "apps/store/src/catalogue/components/category-tree.tsx"],
  ["apps/store/src/components/mobile-category-filter.tsx", "apps/store/src/catalogue/components/mobile-category-filter.tsx"],
  ["apps/store/src/components/sort-options.ts", "apps/store/src/catalogue/components/sort-options.ts"],
  ["apps/store/src/components/breadcrumbs.tsx", "apps/store/src/catalogue/components/breadcrumbs.tsx"],
  ["apps/store/src/components/product-buy-box.tsx", "apps/store/src/catalogue/components/product-buy-box.tsx"],
  ["apps/store/src/components/listing-rail.tsx", "apps/store/src/catalogue/components/listing-rail.tsx"],
  ["apps/store/src/lib/gateway-catalogue.ts", "apps/store/src/catalogue/lib/gateway-catalogue.ts"],

  // ---- search ----
  ["apps/store/src/components/search-bar.tsx", "apps/store/src/search/components/search-bar.tsx"],
  ["apps/store/src/components/search-suggestions.tsx", "apps/store/src/search/components/search-suggestions.tsx"],
  ["apps/store/src/components/mobile-search-button.tsx", "apps/store/src/search/components/mobile-search-button.tsx"],
  ["apps/store/src/components/mobile-search-modal.tsx", "apps/store/src/search/components/mobile-search-modal.tsx"],
  ["apps/store/src/lib/recent-searches.ts", "apps/store/src/search/lib/recent-searches.ts"],
  ["apps/store/src/lib/search-nav.ts", "apps/store/src/search/lib/search-nav.ts"],

  // ---- home ----
  ["apps/store/src/components/home-hero.tsx", "apps/store/src/home/components/home-hero.tsx"],
  ["apps/store/src/components/deal-grid.tsx", "apps/store/src/home/components/deal-grid.tsx"],
  ["apps/store/src/components/countdown-timer.tsx", "apps/store/src/home/components/countdown-timer.tsx"],
  ["apps/store/src/components/showcase-card.tsx", "apps/store/src/home/components/showcase-card.tsx"],
  ["apps/store/src/components/floating-product-card.tsx", "apps/store/src/home/components/floating-product-card.tsx"],
  ["apps/store/src/lib/home.ts", "apps/store/src/home/lib/home.ts"],

  // ---- content (blog and CMS pages) ----
  ["apps/store/src/components/block-renderer.tsx", "apps/store/src/content/components/block-renderer.tsx"],
  ["apps/store/src/components/post-body.tsx", "apps/store/src/content/components/post-body.tsx"],
  ["apps/store/src/components/post-card.tsx", "apps/store/src/content/components/post-card.tsx"],
  ["apps/store/src/components/newsletter-form.tsx", "apps/store/src/content/components/newsletter-form.tsx"],
  ["apps/store/src/lib/gateway-page.ts", "apps/store/src/content/lib/gateway-page.ts"],

  // ---- app-wide ----
  ["apps/store/src/app/providers.tsx", "apps/store/src/components/providers.tsx"],
];

const SOURCE = /\.(ts|tsx|mts|cts)$/;
const RESOLVABLE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const CANDIDATE_EXT = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx"];
const ALIAS = "@/";

/** `apps/store/src`-relative, POSIX-separated, no extension — the `@/…` form. */
const aliasOf = (absolute) => relative(SRC, absolute).split(sep).join("/").replace(RESOLVABLE, "");

const SCRIPT_KIND = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".jsx": ts.ScriptKind.JSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
};

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (SOURCE.test(entry.name)) yield full;
  }
}

/**
 * The absolute file a specifier names, or `undefined`.
 *
 * Only the two forms this app writes are resolved: a relative one, and the `@/…`
 * alias. A bare specifier is a package and belongs to node resolution, which is
 * not this script's business.
 */
function resolveSpecifier(fromFile, specifier) {
  const base = specifier.startsWith(ALIAS)
    ? join(SRC, specifier.slice(ALIAS.length))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : undefined;
  if (base === undefined) return undefined;
  for (const candidate of [
    base,
    ...CANDIDATE_EXT.map((ext) => base + ext),
    ...CANDIDATE_EXT.map((ext) => join(base, "index" + ext)),
  ]) {
    if (RESOLVABLE.test(candidate) && existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Every way this app names another module: static import, re-export, `import()`,
 * `require()`.
 *
 * Each hit carries the span of the *quoted* literal, not the literal's own
 * `getStart`/`getEnd` — those point between the quotes, so replacing that range
 * with a bare `@/…` silently deletes the quotes and leaves `from @/lib/nav`,
 * which is a syntax error in every file at once. The quote character is read off
 * the source and carried into the replacement, so a tree that writes `'…'` is
 * still writing `'…'` afterwards.
 */
function moduleSpecifiers(file, source) {
  const kind = SCRIPT_KIND[file.slice(file.lastIndexOf("."))] ?? ts.ScriptKind.TS;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false, kind);
  const found = [];
  const literal = (node) => (ts.isStringLiteralLike(node) ? node : undefined);
  const visit = (node) => {
    let text;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      text = literal(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      (ts.isImportKeyword(node.expression) ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      text = literal(node.arguments[0]);
    }
    if (text) {
      const end = text.getEnd();
      const quote = source[end - 1];
      found.push({
        start: text.getStart(tree),
        end,
        text: text.text,
        quote: quote === "'" || quote === '"' || quote === "`" ? quote : '"',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

// ---- 1. Assert the whole table, before touching anything ----

const destinationOf = new Map(MOVES.map(([from, to]) => [join(ROOT, from), join(ROOT, to)]));
const unmatched = [];

for (const [from, to] of MOVES) {
  if (!existsSync(join(ROOT, from))) unmatched.push(`${from} — source is not on disk`);
  if (existsSync(join(ROOT, to))) unmatched.push(`${to} — destination already exists`);
}
const duplicated = MOVES.map(([to]) => to).filter((to, i, all) => all.indexOf(to) !== i);
for (const to of new Set(duplicated)) unmatched.push(`${to} — two moves write to the same destination`);

if (unmatched.length > 0) {
  console.error("p5-move-store-roots: the table does not match the tree; no file was moved.");
  for (const reason of unmatched) console.error(`  - ${reason}`);
  console.error(
    'This script is one-shot: re-running it on an already-moved tree is expected to abort here.',
  );
  process.exit(1);
}

// ---- 2. Rewrite the specifiers, resolving against where each file IS ----
//
// Before the moves, deliberately: a moved file's relative specifiers must be
// resolved against the directory it is leaving, not the one it is moving into,
// or `./reactbits` in `block-renderer.tsx` would be looked for under
// `src/content/components/` and found nowhere.

let rewrittenFiles = 0;
let rewrittenSpecifiers = 0;

for (const file of sourceFiles(SRC)) {
  const source = readFileSync(file, "utf8");
  const edits = [];
  for (const { start, end, text, quote } of moduleSpecifiers(file, source)) {
    const target = resolveSpecifier(file, text);
    if (target === undefined) continue;
    const moved = destinationOf.get(target) ?? target;
    const next = `${quote}${ALIAS}${aliasOf(moved)}${quote}`;
    if (next === source.slice(start, end)) continue;
    edits.push({ start, end, next });
  }
  if (edits.length === 0) continue;
  let out = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.next + out.slice(edit.end);
    rewrittenSpecifiers += 1;
  }
  writeFileSync(file, out);
  rewrittenFiles += 1;
}

// ---- 3. Move ----

for (const [from, to] of MOVES) {
  const absoluteTo = join(ROOT, to);
  mkdirSync(dirname(absoluteTo), { recursive: true });
  renameSync(join(ROOT, from), absoluteTo);
}

console.log(
  `p5-move-store-roots: moved ${MOVES.length} files, rewrote ${rewrittenSpecifiers} ` +
    `specifiers across ${rewrittenFiles} files (every in-app import is now @/…).`,
);
for (const [from, to] of MOVES) console.log(`  ${from} → ${to}`);
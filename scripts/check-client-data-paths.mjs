// The clients' home and CMS-page reads come from the gateway, not the data tier.
//
// Criterion 8 of ticket 07 says the storefront's home page "never reads the database itself", and
// the blueprint's §15.1 lists "no client imports the database client" as a mechanical invariant.
// Neither was enforced by anything: the shim count in audit.sh is a ratchet that counts every
// remaining violation, so a *new* one added to the home path is invisible — the number it would
// change is not a gate, and nothing else looks at which files those are.
//
// So this names the files. The two routes that render CMS blocks are the ones that matter, because
// the block renderer they share resolves data for every block on the page. A component that opens a
// connection while rendering is the specific defect criterion 8 was written about: it is invisible
// in review, it holds a pool connection for the length of a render, and it bypasses every rule the
// gateway enforces about what a shopper may see.
//
// Scoped to the block-rendering path, not the whole client. The storefront still has 22 files that
// reach the data tier and they are ticket 11's work; a gate that failed on those would block every
// commit until the migration is done, which is the failure mode §15.3 warns about — a gate nobody
// can satisfy gets deleted, and a deleted gate protects nothing.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The files that render CMS blocks for a shopper. Each must reach the gateway and nothing lower. */
const GATED = [
  "apps/store/src/app/page.tsx",
  "apps/store/src/app/[slug]/page.tsx",
  "apps/store/src/components/block-renderer.tsx",
  "apps/store/src/lib/home.ts",
  "apps/store/src/lib/gateway.ts",
  "apps/store/src/lib/gateway-page.ts",
];

/**
 * The data tier's spellings, including the forwarding shim.
 *
 * `@/lib/queries` is listed because it is the store's own database module: a route that imports it
 * reaches the data tier without naming `@kmodern/db`, which is exactly the near-miss this gate
 * exists to catch. The shim is listed because it forwards to the gateway and is deleted in a later
 * phase; until then it is still the data tier by another name.
 *
 * Each pattern accepts a static import, a dynamic `import()` and a `require()`, because all three
 * reach the module and a dynamic import is idiomatic in a server component. A gate that only matched
 * `from "…"` would be defeated by changing one word, and the whole claim here is that criterion 8 is
 * now structural rather than a promise.
 */
const FORBIDDEN = [
  { pattern: /(?:from|import|require)\s*\(?\s*["']@kmodern\/db["']/, name: "@kmodern/db" },
  { pattern: /(?:from|import|require)\s*\(?\s*["']@\/lib\/queries["']/, name: "@/lib/queries" },
  { pattern: /(?:from|import|require)\s*\(?\s*["']@\/lib\/nav["']/, name: "@/lib/nav" },
  { pattern: /(?:from|import|require)\s*\(?\s*["'][^"']*apps\/api/, name: "apps/api (an app importing an app, §5.1)" },
];

const violations = [];

for (const rel of GATED) {
  let source;
  try {
    source = readFileSync(join(ROOT, rel), "utf8");
  } catch {
    violations.push(`${rel}: file not found. A gate that skips a missing file checks nothing.`);
    continue;
  }
  for (const line of source.split("\n")) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
    for (const { pattern, name } of FORBIDDEN) {
      if (pattern.test(line)) {
        violations.push(`${rel}: imports ${name} — the home read must go through the gateway.`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("client data-path gate failed:");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}

console.log(`ok  the CMS block path reaches the gateway only (${GATED.length} files)`);

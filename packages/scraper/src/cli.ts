#!/usr/bin/env npx tsx
// CLI entrypoint. Examples:
//   pnpm --filter @kmodern/scraper scrape                    # all sources
//   pnpm --filter @kmodern/scraper scrape --source datees     # one source
//   pnpm --filter @kmodern/scraper scrape --limit 5           # smoke run
//   SCRAPE_CACHE=1 pnpm … scrape                              # enable disk cache

import { runPipeline } from "./pipeline";

const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const sources = flag("source")?.split(",").map((s) => s.trim());
  const limit = Number(flag("limit")) || undefined;
  const quiet = args.includes("--quiet");
  const cacheDir = process.env.SCRAPE_CACHE ? ".scrape-cache" : undefined;

  const result = await runPipeline({
    sources,
    limit,
    quiet,
    fetchOpts: { cacheDir },
  });

  if (result.errors.length && !quiet) {
    console.error(`\n${result.errors.length} errors:`);
    for (const e of result.errors.slice(0, 10)) {
      console.error(`  ${e.url}: ${e.message}`);
    }
    if (result.errors.length > 10) console.error(`  …and ${result.errors.length - 10} more`);
  }

  process.exit(result.products.length === 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
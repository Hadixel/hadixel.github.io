# Catalog scraper

Scrape manufacturer data, normalize it to the storefront's Persian catalog
style, merge duplicates, and write the Prisma seed fragment.

## Interactive TUI

From the repository root:

```bash
pnpm scrape:tui
# equivalent: pnpm --filter @kmodern/scraper tui
```

The TUI lets you choose a source, enter a product limit, toggle the disk cache,
watch crawl progress, and review the merge result. Press `q` or `Esc` while a run
is active to cancel it. Press `r` on the result screen to run again.

## Non-interactive CLI

```bash
# Datees smoke run
pnpm --filter @kmodern/scraper scrape --source datees --limit 5

# All registered adapters
pnpm --filter @kmodern/scraper scrape

# Reuse cached HTML during development
SCRAPE_CACHE=1 pnpm --filter @kmodern/scraper scrape --source datees --limit 5
```

Outputs are written to `packages/scraper/out/`:

- `raw-scrape.json` — adapter records before refinement
- `catalog.fragment.json` — shape consumed by `packages/db/seed/catalog.json`
- `merge-report.json` — counts, conflicts, and page errors

The seed image preparation command accepts both local paths and HTTP(S) image
URLs, so the generated fragment can be handed to the database seed workflow.

# `apps/scraper` — the catalogue scraper

Three executables that read manufacturer data and normalise it to the storefront's Persian catalogue
style. It touches no database and binds no port: a run writes `catalog.fragment.json` and the files
under `out/`, which the gateway's seed reads and the admin panel reviews at `/scraper`.

Two stages, deliberately: a scrape reads what a product *is* — name, every image, specs — and
carries no price, and a second step fetches prices for the products an operator selected. The
scrape's output is therefore always content-complete, and a price is never a fact the scrape
discovered.

## Read this first

- [docs/scraper.md](../../docs/scraper.md) — the full CLI and TUI reference: filters, outputs, the
  price-list command, admin review and import.
- [docs/RANKS.md](../../docs/RANKS.md) — where this app sits and what it may import.
- [docs/COMPANION.md](../../docs/COMPANION.md) — this repo's concrete choices: ports, archetype
  assignment, token values, config tiers.

## Shape of the tree

```
bin/          three executables: scrape.ts, tui.ts, price-list.ts
tests/        vitest suites — these need no database
out/          untracked run output: raw-scrape.json, catalog.fragment.json, merge-report.json,
              price-list-report.json, images/<product-slug>/
.scrape-cache/  untracked disk cache, enabled with SCRAPE_CACHE=1
```

The adapters, the pipeline and the shared types live in `packages/scraper-core`, which the gateway
also imports for its `price-watch` feature — that shared workspace is what keeps the price-fetch and
refinement logic in one place instead of two.

## Commands

```bash
pnpm scrape:tui                                        # the interactive TUI
pnpm --filter @kmodern/scraper scrape --source datees --limit 5
pnpm --filter @kmodern/scraper price-list -- --file /path/to/D0249.xlsx --brand Datees --dry-run
npx vitest run                                         # from apps/scraper
```

Full filters, output shapes and the admin review flow are in
[docs/scraper.md](../../docs/scraper.md).

## Environment

One variable: `SCRAPE_CACHE`, which enables the on-disk HTML cache. See
[.env.example](.env.example); the repo root's `.env.example` holds the full inventory and the tier
each variable belongs to.

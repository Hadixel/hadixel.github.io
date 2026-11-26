# The catalogue scraper

The operational reference for [`apps/scraper`](../apps/scraper) — its entry point is
[`apps/scraper/AGENTS.md`](../apps/scraper/AGENTS.md), and this document holds the detail that
index points at. Scrape manufacturer data, normalise it to the storefront's Persian catalogue style,
merge duplicates, and write the seed fragment.

## Interactive TUI

From the repository root:

```bash
pnpm scrape:tui
# equivalent: pnpm --filter @kmodern/scraper tui
```

The TUI lets you choose a source, enter a product limit, toggle the disk cache and image downloads,
watch crawl progress, and review the merge result. Image downloads are enabled by default in the
TUI. Press `q` or `Esc` while a run is active to cancel it. Press `r` on the result screen to run
again.

## Non-interactive CLI

```bash
# Datees smoke run
pnpm --filter @kmodern/scraper scrape --source datees --limit 5

# All registered adapters
pnpm --filter @kmodern/scraper scrape

# Reuse cached HTML during development
SCRAPE_CACHE=1 pnpm --filter @kmodern/scraper scrape --source datees --limit 5

# Download product images
pnpm --filter @kmodern/scraper scrape --source datees --limit 5 --images

# Apply the same filters used by the admin review list
pnpm --filter @kmodern/scraper scrape --source datees --category oven --color black --content with-images

# Scrape the Schuffel catalog (its public WooCommerce Store API is used)
pnpm --filter @kmodern/scraper scrape --source schuffel --category hood
```

A scrape is content work: it reads what a product *is* and carries no price. The manufacturer's
pages have none, and the shop that does is a second site — so prices come from a separate step,
either the XLSX price list below or, in the admin panel, the price fetch applied to selected
products only.

Supported CLI filters are `--search`, `--manufacturer`, `--website`, `--category`,
`--subcategory`, `--color`, `--price`, `--content`, and `--sort`. Category/source filters can
exclude listing URLs before product pages are read; content, price, color, and search filters are
applied after each product page is parsed.

## Outputs

A run writes into an `out/` directory — the pipeline's default sits beside
`packages/scraper-core`, and it resolves that path from its own location rather than from the
working directory:

- `raw-scrape.json` — adapter records before refinement
- `catalog.fragment.json` — the shape `apps/api/seed/catalog.json` consumes
- `merge-report.json` — counts, conflicts, page errors, and image errors
- `price-list-report.json` — price-row matches, raw-only rows, and rejected conflicts
- `images/<product-slug>/` — downloaded image files when `--images` is enabled

When image downloads are enabled, `catalog.fragment.json` keeps the local paths in `image` for the
seed workflow and preserves the manufacturer URLs in `sourceImages`. Each product also carries
`sourceId`, `sourceUrl`, and `sourcePageUrl` so review filters can distinguish the manufacturer
adapter and website. The admin API serves downloaded local files through an authenticated preview
endpoint, so review does not depend on the manufacturer server. During import, images are written
locally for development or uploaded to the configured S3-compatible storage. The seed image
preparation command accepts both local paths and HTTP(S) URLs as well.

## Admin review and import

Owners can open `/scraper` in the admin app to run a crawl, inspect every refined product, filter by
manufacturer or source website, expand its specs/images, and select records for import. The Schuffel
adapter reads the public WooCommerce Store API and retains unavailable prices as zero/draft-safe
values. Click a result to edit its name, price, description, features, category, and specs before
import. Slug, model, brand, colors, and image identity remain server-owned so retries and variant
SKUs stay idempotent. Image downloads are enabled by default for admin runs; failed image requests
retain the manufacturer URL as a fallback. The explicit import action is idempotent by product slug
and variant SKU; leave "publish after import" off to create drafts, or enable it to publish the
selected records immediately. Published products must have a positive price. Datees
color-specific prices create separate color variants; manually editing the aggregate price clears
the imported price provenance for that product.

### Fetching prices for selected products

The run carries no price, so the review list opens with every product priced "نیازمند قیمت". Tick
the products you want priced and press «دریافت قیمت برای انتخاب‌شده‌ها»: the Datees Shop catalog API
is fetched, matched by normalized model, and the quotes are written into the review snapshot for
those products only — an unticked product keeps whatever price it had, including none. The fetch
refuses to run against a snapshot that changed since it was loaded, and products the shop lists
nothing for are reported rather than zeroed. Colour prices from the API also extend the product's
variant set, so a colour the page text never mentioned still imports with its own price. The price
step writes no row: importing remains the only action that touches the catalogue.

### Applying a new XLSX price list

The price-list command accepts an XLSX/XLS/CSV workbook with `model` and a consumer-price column
such as `consumer_price_toman`. It also accepts common Persian headers, including `مدل` and
`قیمت مصرف کننده`. Model matching normalizes spaces, hyphens, Persian/Arabic digits, bidi marks,
and common RTL-reversed forms such as `DG 598`/`598-DG`; word models such as `Volira` are supported
as well.

The command resolves every row against both `catalog.fragment.json` and the latest
`raw-scrape.json`. The admin preview/apply revision hashes both files, so a changed scrape or
catalog invalidates the preview before it can be applied:

```bash
# Preview and persist a review report without changing the catalog
pnpm --filter @kmodern/scraper price-list -- --file /path/to/D0249.xlsx --brand Datees --dry-run

# Apply only unambiguous catalog matches
pnpm --filter @kmodern/scraper price-list -- --file /path/to/D0249.xlsx --brand Datees
```

Use `--unit toman|rial` only when the workbook does not declare its unit. A consumer price in Rial
is converted to Toman. Repeated model rows, multiple model codes in one cell, cross-brand
collisions, raw/catalog conflicts, unmatched rows, and invalid rows are reported but never applied.
Re-running the same file is idempotent; aggregate XLSX prices clear stale color-price and stock
metadata because the file does not provide those facts.

The admin review page exposes the same operation at `/scraper`: upload a file, preview the report,
then explicitly apply it to the review snapshot. Applying a price list never publishes or imports
products; use the existing product selection flow afterwards. The full report is available as
`price-list-report.json`.

A scrape can apply a list in the same run when needed:

```bash
pnpm --filter @kmodern/scraper scrape --price-list /path/to/D0249.xlsx --price-brand Datees
```

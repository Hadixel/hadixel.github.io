# Catalog scraper

Scrape manufacturer data, normalize it to the storefront's Persian catalog
style, merge duplicates, and write the Prisma seed fragment.

## Interactive TUI

From the repository root:

```bash
pnpm scrape:tui
# equivalent: pnpm --filter @kmodern/scraper tui
```

The TUI lets you choose a source, enter a product limit, toggle the disk cache
and image downloads, watch crawl progress, and review the merge result. Image
downloads are enabled by default in the TUI. Press `q` or `Esc` while a run is
active to cancel it. Press `r` on the result screen to run again.

## Non-interactive CLI

```bash
# Datees smoke run
pnpm --filter @kmodern/scraper scrape --source datees --limit 5

# All registered adapters
pnpm --filter @kmodern/scraper scrape

# Reuse cached HTML during development
SCRAPE_CACHE=1 pnpm --filter @kmodern/scraper scrape --source datees --limit 5

# Download product images into packages/scraper/out/images
pnpm --filter @kmodern/scraper scrape --source datees --limit 5 --images

# Apply the same filters used by the admin review list
pnpm --filter @kmodern/scraper scrape --source datees --category oven --color black --content with-images

# Scrape the Schuffel catalog (its public WooCommerce Store API is used)
pnpm --filter @kmodern/scraper scrape --source schuffel --category hood

# Skip the Datees Shop price API when you only need manufacturer data
pnpm --filter @kmodern/scraper scrape --source datees --no-prices
```

Supported CLI filters are `--search`, `--manufacturer`, `--website`,
`--category`, `--subcategory`, `--color`, `--price`, `--content`, and `--sort`.
Category/source filters can exclude listing URLs before product pages are read;
content, price, color, and search filters are applied after each product page is
parsed. Datees prices are enriched from the public `dateesshop.com` catalog API
by normalized model; the original Datees product page remains the content
source. The API's integer prices are treated as Toman (the site's structured
IRR metadata is not used), and color-specific variant prices are retained for
variant imports.

Outputs are written to `packages/scraper/out/`:

- `raw-scrape.json` — adapter records before refinement
- `catalog.fragment.json` — shape consumed by `apps/api/seed/catalog.json`
- `merge-report.json` — counts, conflicts, page errors, and image errors
- `price-list-report.json` — price-row matches, raw-only rows, and rejected conflicts
- `images/<product-slug>/` — downloaded image files when `--images` is enabled

When image downloads are enabled, `catalog.fragment.json` keeps the local
paths in `image` for the seed workflow and preserves the manufacturer URLs in
`sourceImages`. Each product also carries `sourceId`, `sourceUrl`, and
`sourcePageUrl` so review filters can distinguish the manufacturer adapter and
website. The admin API serves downloaded local files through an authenticated
preview endpoint, so review does not depend on the manufacturer server. During
import, images are written locally for development or uploaded to the
configured S3-compatible storage. The seed image preparation command accepts
both local paths and HTTP(S) URLs as well.

## Admin review and import

Owners can open `/scraper` in the admin app to run a crawl, inspect every
refined product, filter by manufacturer or source website, expand its
specs/images, and select records for import. Datees runs enrich prices from
`dateesshop.com`; the Schuffel adapter reads the public WooCommerce Store API
and retains unavailable prices as zero/draft-safe values. Click a result to
edit its name, price, description, features, category, and specs before import.
Slug, model, brand, colors, and image identity remain server-owned so retries
and variant SKUs stay idempotent. Image downloads are enabled by default for
admin runs; failed image requests retain the manufacturer URL as a fallback.
The explicit import action is idempotent by product slug and variant SKU; leave
"publish after import" off to create drafts, or enable it to publish the
selected records immediately. Published products must have a positive price.
Datees color-specific prices create separate color variants; manually editing
the aggregate price clears the imported price provenance for that product.

### Applying a new XLSX price list

The price-list command accepts an XLSX/XLS/CSV workbook with `model` and a
consumer-price column such as `consumer_price_toman`. It also accepts common Persian headers,
including `مدل` and `قیمت مصرف کننده`. Model matching normalizes spaces,
hyphens, Persian/Arabic digits, bidi marks, and common RTL-reversed forms such
as `DG 598`/`598-DG`; word models such as `Volira` are supported as well.

The command resolves every row against both `catalog.fragment.json` and the
latest `raw-scrape.json`. The admin preview/apply revision hashes both files,
so a changed scrape or catalog invalidates the preview before it can be
applied:

```bash
# Preview and persist a review report without changing the catalog
pnpm --filter @kmodern/scraper price-list -- --file /path/to/D0249.xlsx --brand Datees --dry-run

# Apply only unambiguous catalog matches
pnpm --filter @kmodern/scraper price-list -- --file /path/to/D0249.xlsx --brand Datees
```

Use `--unit toman|rial` only when the workbook does not declare its unit. A
consumer price in Rial is converted to Toman. Repeated model rows, multiple
model codes in one cell, cross-brand collisions, raw/catalog conflicts,
unmatched rows, and invalid rows are reported but never applied. Re-running
the same file is idempotent; aggregate XLSX prices clear stale color-price and
stock metadata because the file does not provide those facts.

The admin review page exposes the same operation at `/scraper`: upload a file,
preview the report, then explicitly apply it to the review snapshot. Applying a
price list never publishes or imports products; use the existing product
selection flow afterwards. The full report is available as
`price-list-report.json`.

A scrape can apply a list in the same run when needed:

```bash
pnpm --filter @kmodern/scraper scrape --price-list /path/to/D0249.xlsx --price-brand Datees
```

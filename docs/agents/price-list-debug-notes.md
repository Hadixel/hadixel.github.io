# Price-list upload debug notes

Updated: 2026-09-25

## User-visible symptom

- Admin `/scraper` price-list card accepts `D0249.xlsx`.
- User reports: `no price list failed!` (the admin request returns the generic `price_list_failed` response).

## Reproduction already passing outside Next.js

```bash
pnpm --filter @kmodern/scraper price-list -- \
  --file /home/asd/Downloads/D0249.xlsx \
  --out-dir /tmp/opencode/price-list-repro \
  --brand Datees --dry-run
```

The scraper CLI and `scraperJobs.applyPriceList()` both process the workbook successfully when run from the admin working directory. Current dry-run result is 47 matched, 0 raw-only, 75 unmatched, 2 duplicate groups, and 3 invalid rows.

## Primary investigation

1. The admin server is already running on port 3001 from `/home/asd/dev/projects/react/E-commerce/apps/admin`.
2. The route catches all implementation errors and returns only `price_list_failed`, so the actual server-side exception is currently hidden.
3. The compiled admin bundle contains the XLSX adapter and the route, so the next check is runtime request behavior rather than the parser alone.
4. The route uses the composite catalog/raw revision and requires the browser's `catalogRevision` form field.
5. The server has been running since before the latest code changes; hot-reload/global state may be stale.

## Confirmed cause and fix

- The real multipart request reproduced the failure: `422 price_list_failed`.
- The running Next server had stale compiled code. In the bundled SheetJS copy, `XLSX.readFile(path)` has no usable Node `fs` binding and throws `Cannot access file ...`.
- `readRows()` now reads the upload with `node:fs/promises.readFile()` and calls `XLSX.read(buffer, { type: "buffer" })`, which works in the Next server bundle.
- The admin dev server was restarted and the exact multipart preview request then returned HTTP 200 with 47 matches, 75 unmatched, and 3 invalid rows.
- The server log also recorded `POST /api/admin/scraper/prices 200` after the fix.
- A clean multipart replay with a temporary, revoked owner session returned HTTP 200 again on the persistent port-3001 server.
- Temporary `[DEBUG-price-list]` logging and response details were removed; normal server-side error logging remains.

## Remaining questions for tomorrow

- None required for the reproduced failure. If the browser still shows an old error, refresh the admin page once so the restarted server/client bundle is loaded.

## Final verification to run after the last cleanup

- Scraper tests and typecheck.
- Admin typecheck/build.
- Re-run the multipart preview request if needed; it should remain HTTP 200.

## Relevant files

- `apps/admin/src/app/api/admin/scraper/prices/route.ts`
- `apps/admin/src/lib/scraper-jobs.ts`
- `apps/admin/src/components/scraper-panel.tsx`
- `packages/scraper/src/price-list.ts`
- `packages/scraper/tests/price-list.test.ts`
- Commit: `801daf1` (feature implementation; no push)
- Fix commit: `4424ba4` (buffer-based workbook loading in the admin server; no push)

## Suggested skills for the next agent

- `diagnosing-bugs`
- `implement`
- `code-review`

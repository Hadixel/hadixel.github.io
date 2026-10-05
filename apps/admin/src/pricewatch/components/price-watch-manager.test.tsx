/** @vitest-environment node */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/navigation must exist in the SSR environment; the manager calls useRouter.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));

// The actions module reaches the gateway (cookies()), so it is stubbed here: this test holds the
// rendering, not the gateway round trip.
vi.mock("@/pricewatch/lib/price-watch-actions", () => ({
  savePriceWatch: vi.fn(),
  runPriceWatchNow: vi.fn(),
  applyPriceChanges: vi.fn(),
  ignorePriceChanges: vi.fn(),
  applyAllPendingPriceChanges: vi.fn(),
}));

const overview = {
  config: {
    enabled: false,
    mode: "INTERVAL" as const,
    intervalMinutes: 360,
    dailyAt: null,
    lastRunAt: null,
    nextRunAt: null,
    timezone: "Asia/Tehran",
  },
  runs: [],
  pendingChanges: 1,
};

const row = {
  id: "row-1",
  runId: "run-1",
  variantId: "v-1",
  productId: "p-1",
  sku: "DATEES-falcon-BLACK",
  productName: "هود توکار مخفی داتیس سری فالکون",
  colorName: "مشکی",
  fromPrice: 28_798_000,
  toPrice: 34_426_000,
  sourceUrl: "https://dateesshop.com/product/x",
  status: "PENDING" as const,
  detectedAt: new Date().toISOString(),
  appliedAt: null,
};

const changes = { rows: [row], total: 1, page: 1, size: 20 };

/** Count forms that open while already inside a form. */
function nestedFormCount(html: string): number {
  let depth = 0;
  let nested = 0;
  const tag = /<form\b[^>]*>|<\/form>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(html)) !== null) {
    if (m[0].startsWith("</")) depth -= 1;
    else {
      depth += 1;
      if (depth > 1) nested += 1;
    }
  }
  return nested;
}

describe("price watch queue rendering", () => {
  it("renders a pending row's actions without nesting any form inside another", async () => {
    const { PriceWatchManager } = await import("./price-watch-manager");
    const html = renderToStaticMarkup(
      createElement(PriceWatchManager, {
        overview,
        changes,
        changesError: null,
        status: undefined,
        range: { from: null, to: null },
        page: 1,
      }),
    );
    // A pending row puts both the selection form and the row's own two action forms on the
    // page; the regression this holds is that none of them ends up inside another — a form
    // inside a form is dropped by the HTML parser, and the row's buttons go dead silently.
    expect(nestedFormCount(html), "forms nested inside forms in rendered markup").toBe(0);
    // And the row really did render its own action forms (the fixture has a PENDING row).
    expect((html.match(/<form\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

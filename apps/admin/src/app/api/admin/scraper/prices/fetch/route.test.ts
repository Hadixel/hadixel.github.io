// `POST /api/admin/scraper/prices/fetch` — the second step, as the route serves it.
//
// The manager under test is a fake: this route's behaviour is the request contract, not the fetch
// — who may call it, which selection it accepts, which snapshot revision it insists on, and which
// of those outcomes leaves a line in the audit trail. The crawl is never involved, so nothing here
// needs the real job manager, and a test that started one would be testing the manager twice.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { DateesPriceFetchReport } from "@kmodern/scraper-core";
import { POST } from "@/app/api/admin/scraper/prices/fetch/route";
import type * as ScraperJobs from "@/scraper/lib/scraper-jobs";

const { fetchDateesPricesMock, isRunningMock } = vi.hoisted(() => ({
  fetchDateesPricesMock: vi.fn(),
  isRunningMock: vi.fn(() => false),
}));

vi.mock("@/scraper/lib/scraper-jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof ScraperJobs>();
  return {
    ...actual,
    scraperJobs: { ...actual.scraperJobs, isRunning: isRunningMock, fetchDateesPrices: fetchDateesPricesMock },
  };
});

vi.mock("@/auth/lib/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ ok: true, ctx: { admin: { role: "OWNER", mustChangePassword: false } } })),
}));

vi.mock("@/lib/origin", () => ({
  sameOrigin: vi.fn(() => true),
}));

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn(async () => ({ recorded: true })) }));

vi.mock("@/lib/gateway", () => ({
  fromGateway: (call: (client: { post: typeof postMock }) => Promise<unknown>) =>
    call({ post: postMock }).then(
      (data) => ({ ok: true as const, message: "", data }),
      (error: unknown) => ({ ok: false as const, message: String(error) }),
    ),
}));

const REVISION = "a".repeat(64);

function report(overrides: Partial<DateesPriceFetchReport> = {}): DateesPriceFetchReport {
  return {
    sourceId: "dateesshop",
    sourceUrl: "https://dateesshop.com/api/shop/products?limit=200&page=1",
    requested: 2,
    matched: 2,
    unmatched: 0,
    skipped: 0,
    fetchedAt: 1_700_000_000_000,
    ...overrides,
  };
}

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(
    new NextRequest("http://localhost:3101/api/admin/scraper/prices/fetch", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );
}

beforeEach(() => {
  fetchDateesPricesMock.mockReset();
  fetchDateesPricesMock.mockResolvedValue(report());
  postMock.mockClear();
  isRunningMock.mockReturnValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/scraper/prices/fetch", () => {
  it("fetches prices for the posted selection and reports what it found", async () => {
    const response = await post({ slugs: ["datees-dg-596", "datees-hd-700"], catalogRevision: REVISION });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.mode).toBe("fetch");
    expect(body.report.matched).toBe(2);
    expect(fetchDateesPricesMock).toHaveBeenCalledWith(
      expect.objectContaining({ slugs: ["datees-dg-596", "datees-hd-700"], expectedRevision: REVISION }),
    );
  });

  it("records who fetched the prices, through the gateway's audit line", async () => {
    await post({ slugs: ["datees-dg-596"], catalogRevision: REVISION });
    expect(postMock).toHaveBeenCalledWith(
      "/scraper/actions",
      expect.objectContaining({ action: "SCRAPER_PRICES_FETCHED", meta: expect.objectContaining({ matched: 2 }) }),
    );
  });

  it("writes no line when the fetch changed nothing", async () => {
    fetchDateesPricesMock.mockResolvedValue(report({ matched: 0, unmatched: 2 }));
    const response = await post({ slugs: ["datees-dg-596", "datees-hd-700"], catalogRevision: REVISION });
    expect(response.status).toBe(200);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("refuses a selection it cannot act on", async () => {
    expect((await post({ slugs: [], catalogRevision: REVISION })).status).toBe(400);
    expect((await post({ slugs: ["ok-slug"], catalogRevision: "short" })).status).toBe(400);
    expect((await post({ slugs: ["Bad_Slug"], catalogRevision: REVISION })).status).toBe(400);
    // Distinct slugs: a capped selection counts what it is asked to price, not what it repeats.
    expect((await post({ slugs: Array.from({ length: 501 }, (_v, index) => `slug-${index}`), catalogRevision: REVISION })).status).toBe(400);
    expect(fetchDateesPricesMock).not.toHaveBeenCalled();
  });

  it("refuses while a run is in flight, rather than repricing a snapshot being rewritten", async () => {
    isRunningMock.mockReturnValue(true);
    expect((await post({ slugs: ["datees-dg-596"], catalogRevision: REVISION })).status).toBe(409);
    expect(fetchDateesPricesMock).not.toHaveBeenCalled();
  });

  it("reports a snapshot that changed instead of repricing a different one", async () => {
    fetchDateesPricesMock.mockRejectedValue(new Error("CATALOG_CHANGED"));
    expect((await post({ slugs: ["datees-dg-596"], catalogRevision: REVISION })).status).toBe(409);
  });

  it("answers 403 for an operator who is not the owner", async () => {
    const { requireAdminApi } = await import("@/auth/lib/auth");
    vi.mocked(requireAdminApi).mockResolvedValueOnce({
      ok: true,
      ctx: { admin: { role: "MANAGER", mustChangePassword: false } },
    } as unknown as Awaited<ReturnType<typeof requireAdminApi>>);
    expect((await post({ slugs: ["datees-dg-596"], catalogRevision: REVISION })).status).toBe(403);
    expect(fetchDateesPricesMock).not.toHaveBeenCalled();
  });

  it("refuses a cross-site post before it reads the body", async () => {
    const { sameOrigin } = await import("@/lib/origin");
    vi.mocked(sameOrigin).mockReturnValueOnce(false);
    const response = await post({ slugs: ["datees-dg-596"], catalogRevision: REVISION }, { Origin: "https://elsewhere.example" });
    expect(response.status).toBe(403);
    expect(fetchDateesPricesMock).not.toHaveBeenCalled();
  });
});

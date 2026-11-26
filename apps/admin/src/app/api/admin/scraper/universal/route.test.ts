import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import type * as ScraperJobs from "@/scraper/lib/scraper-jobs";

const { runUniversalScrapeMock } = vi.hoisted(() => ({
  runUniversalScrapeMock: vi.fn(),
}));

vi.mock("@/scraper/lib/scraper-jobs", async (importOriginal) => {
  const actual = await importOriginal<typeof ScraperJobs>();
  return {
    ...actual,
    scraperJobs: {
      ...actual.scraperJobs,
      runUniversalScrape: runUniversalScrapeMock,
    },
  };
});

vi.mock("@/auth/lib/auth", () => ({
  requireAdminApi: vi.fn(async () => ({
    ok: true,
    ctx: { admin: { role: "OWNER", mustChangePassword: false } },
  })),
}));

vi.mock("@/lib/origin", () => ({
  sameOrigin: vi.fn(() => true),
}));

function makeRequest(body: unknown): Request {
  return new Request("https://admin.kmodern.ir/api/admin/scraper/universal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/scraper/universal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects request without url", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("url_required");
  });

  it("rejects invalid url protocol", async () => {
    const res = await POST(makeRequest({ url: "ftp://example.com" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("invalid_url_protocol");
  });

  it("calls runUniversalScrape and returns result", async () => {
    runUniversalScrapeMock.mockResolvedValueOnce({
      kind: "single",
      url: "https://example.com/product/1",
      products: [
        {
          slug: "datees-df-695",
          name: "فر برقی داتیس مدل DF-695",
          brand: "Datees",
          price: 18500000,
          categorySlug: "oven",
          subCategorySlug: "built-in",
          colors: ["black"],
          imageUrls: ["https://example.com/img.jpg"],
          description: "فر توکار",
          features: ["۱۰ برنامه"],
          specs: [],
        },
      ],
      totalDiscovered: 1,
      errors: [],
    });

    const res = await POST(
      makeRequest({ url: "https://example.com/product/1", brand: "Datees", limit: 5 }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.productsCount).toBe(1);
    expect(data.products[0].name).toBe("فر برقی داتیس مدل DF-695");
    expect(runUniversalScrapeMock).toHaveBeenCalledWith("https://example.com/product/1", {
      brand: "Datees",
      limit: 5,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/queries", () => ({
  getPublishedProducts: vi.fn(),
}));

import { GET } from "@/app/api/search/route";
import { getPublishedProducts } from "@/lib/queries";
type Results = Awaited<ReturnType<typeof getPublishedProducts>>;

const query = vi.mocked(getPublishedProducts);

function req(url: string) {
  return new NextRequest(`http://localhost:3100${url}`);
}

const hit = (i: number) => ({
  id: `p${i}`,
  slug: `slug-${i}`,
  name: `محصول ${i}`,
  brand: "داتیس",
  model: `m${i}`,
  category: { id: "c1", name: "خانه", slug: "home" },
  price: 1000 * i,
  maxPrice: 1200 * i,
  available: true,
  image: null,
  variantCount: 1,
  dots: [],
  discount: null,
}) as unknown as Results[number];

describe("GET /api/search", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("returns mapped results for a typed query", async () => {
    query.mockResolvedValue([hit(1)]);
    const res = await GET(req("/api/search?q=فر"));
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith({ search: "فر", limit: 6 });
    const body = await res.json();
    expect(body.results).toEqual([
      { slug: "slug-1", name: "محصول 1", price: 1000, maxPrice: 1200, discount: null, image: null },
    ]);
  });

  it("returns an empty list with 200 for a nonsense query", async () => {
    query.mockResolvedValue([]);
    const res = await GET(req("/api/search?q=xyzzy123"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ results: [] });
  });

  it("short-circuits missing and short queries without touching the catalog", async () => {
    for (const url of ["/api/search", "/api/search?q=", "/api/search?q=%20", "/api/search?q=ف"]) {
      const res = await GET(req(url));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ results: [] });
    }
    expect(query).not.toHaveBeenCalled();
  });

  it("hot mode requests the newest published products (limit 5)", async () => {
    const five = [1, 2, 3, 4, 5].map(hit);
    query.mockResolvedValue(five);
    const res = await GET(req("/api/search?hot=1"));
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith({ limit: 5 });
    expect(query.mock.calls[0][0]).not.toHaveProperty("search");
    const body = await res.json();
    expect(body.results).toHaveLength(5);
    expect(body.results.map((r: { slug: string }) => r.slug)).toEqual(five.map((p) => p.slug));
  });

  it("hot mode runs even when a short query is present", async () => {
    query.mockResolvedValue([hit(1)]);
    const res = await GET(req("/api/search?hot=1&q=ف"));
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith({ limit: 5 });
  });

  it("omits maxPrice when it does not exceed price", async () => {
    const p = hit(1);
    query.mockResolvedValue([{ ...p, maxPrice: p.price }]);
    const res = await GET(req("/api/search?q=فر"));
    const body = await res.json();
    expect(body.results[0].maxPrice).toBeUndefined();
  });
});

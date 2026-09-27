// The storefront's request path, driven against a stubbed gateway.
//
// Criterion 9's first half. These tests assert the thing that is easy to get quietly wrong: that the
// home page reaches the gateway over HTTP, asks for the read the gateway actually serves, and — when
// the gateway is not there — reports that instead of quietly producing a page from somewhere else.
// There is no data-tier import anywhere in the path under test, so there is nothing to fall back to;
// these tests pin the reporting half of that, and the absence of the import is what makes the
// guarantee structural rather than a promise.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "http://gateway.test:3102";

/** The parts of a `Response` the client touches, so a stub need not be a real one. */
function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

const product = {
  id: "p1",
  slug: "yeksay",
  name: "یخسال",
  brand: "داتیس",
  model: "M1",
  category: { id: "c1", name: "خانه", slug: "home" },
  price: 1000,
  maxPrice: 1200,
  available: true,
  image: null,
  variantCount: 1,
  dots: [],
};

const deal = {
  product,
  label: "۲۰٪",
  discountedPrice: 800,
  endsAt: null,
};

const homeBody = {
  blocks: [
    {
      id: "b1",
      type: "productGrid",
      props: { title: "پرفروش‌ها" },
      data: { products: [product] },
    },
    {
      id: "b2",
      type: "dealGrid",
      props: { title: "تخفیف ویژه" },
      data: { deals: [deal] },
    },
  ],
  products: [product],
  deals: [deal],
};

describe("the storefront's home read", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  async function load() {
    // Imported lazily so each test picks up the base URL set above.
    const { loadHome } = await import("@/lib/home");
    return loadHome();
  }

  it("reads the home content from the gateway over HTTP", async () => {
    fetchMock.mockResolvedValue(stubResponse(homeBody));

    const home = await load();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url.startsWith(`${BASE}/content/home`)).toBe(true);
    expect(init.headers).toMatchObject({ accept: "application/json" });
    expect(init.cache).toBe("no-store");
    expect(home.failure).toBeNull();
  });

  it("returns the blocks, the products and the deals the page renders", async () => {
    fetchMock.mockResolvedValue(stubResponse(homeBody));

    const home = await load();

    expect(home.blocks.map((b) => b.id)).toEqual(["b1", "b2"]);
    // The deals ride along with the blocks rather than needing a second call, which is what makes
    // the featured-deals section work without the page making a request per section.
    expect(home.deals).toEqual([deal]);
    expect(home.products).toEqual([product]);
  });

  it("reports failure when the gateway is stopped, and renders no stale content", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    const home = await load();

    expect(home.failure).toContain("ECONNREFUSED");
    // Empty, not repopulated from anywhere: there is no second source to repopulate it from, and a
    // test that let one through would be the only warning that a fallback had been reintroduced.
    expect(home.blocks).toEqual([]);
    expect(home.products).toEqual([]);
    expect(home.deals).toEqual([]);
  });

  it("surfaces the gateway's own Persian message from the error envelope", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 503, message: "درگاه موقتاً در دسترس نیست.", timestamp: "2026-09-27T10:00:00.000Z" },
        { status: 503 },
      ),
    );

    const home = await load();

    expect(home.failure).toBe("درگاه موقتاً در دسترس نیست.");
  });

  it("treats a 200 that is not the documented shape as a failure, not an empty page", async () => {
    // A silent empty home page is the failure mode worth guarding: it looks like the CMS simply has
    // no blocks, and nobody looks at the gateway.
    fetchMock.mockResolvedValue(stubResponse({ blocks: "not-an-array" }));

    const home = await load();

    expect(home.failure).not.toBeNull();
    expect(home.blocks).toEqual([]);
  });

  it("falls back to a default base URL rather than calling a relative path", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    fetchMock.mockResolvedValue(stubResponse(homeBody));

    await load();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith("http://")).toBe(true);
  });
});

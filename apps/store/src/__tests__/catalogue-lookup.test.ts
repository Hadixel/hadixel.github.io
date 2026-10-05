// The storefront's catalogue reads, driven against a stubbed gateway.
//
// The half of the move that is easiest to get wrong in a way nobody sees: a category that does not
// exist and a gateway that is not answering must not look alike. Both arrive as "no row", and
// answering "not found" to an outage turns a five-minute blip into a category page full of dead links
// that look deliberate — or, worse, a product grid with nothing in it, which reads as a shop that is
// empty rather than a shop that is broken.
//
// So the last two cases drive the page itself rather than the helper: `notFound()` and "threw for the
// error boundary" are different answers, and only one of them is a 404.
//
// The URL is pinned for the reason it is pinned in `page-gateway.test.ts`: the two halves of one
// contract cannot be compared in a single process without an app importing another app.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CategoryPage from "@/app/category/[slug]/page";
import { lookupCategory, lookupCollection } from "@/catalogue/lib/gateway-catalogue";

const BASE = "http://gateway.test:3102";

// The product list and the category tree are separate reads, through the hub, and are stubbed so
// what is asserted here is what the page does with the *category* — not the list's own filtering.
vi.mock("@/lib/queries", () => ({
  getPublishedProducts: vi.fn().mockResolvedValue([]),
  getCategoryTree: vi.fn().mockResolvedValue({ roots: [], all: [] }),
}));

/** What a page raised, in the two shapes the assertions care about. */
interface Raised {
  digest?: string;
  message?: string;
}

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

const notFoundBody = {
  statusCode: 404,
  message: "دسته‌بندی مورد نظر پیدا نشد.",
  timestamp: null,
};

const categoryBody = { id: "c1", name: "موبایل", slug: "mvbayl", parentId: null };
const collectionBody = { id: "k1", name: "پیشنهاد", slug: "offers" };

/** The error a page raised, or null when it rendered. */
async function raisedBy(render: Promise<unknown>): Promise<Raised | null> {
  return render.then(
    () => null,
    (raised: Raised) => raised,
  );
}

describe("the storefront's catalogue reads", () => {
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

  it("asks the gateway for the path the gateway serves", async () => {
    fetchMock.mockResolvedValue(stubResponse(categoryBody));

    const result = await lookupCategory("mvbayl");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/catalogue/categories/mvbayl`);
    expect(result).toEqual({ kind: "ok", category: categoryBody });
  });

  it("encodes the slug, so a slug cannot become a path", async () => {
    fetchMock.mockResolvedValue(stubResponse(categoryBody));

    await lookupCategory("a/b?c=1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/catalogue/categories/a%2Fb%3Fc%3D1`);
  });

  it("reads a 404 as a category that is absent", async () => {
    fetchMock.mockResolvedValue(stubResponse(notFoundBody, { status: 404 }));

    expect(await lookupCategory("no-such-category")).toEqual({ kind: "missing" });
  });

  // The distinction the module exists for: an outage must not be reported as a category that is
  // absent, because the page would then render not-found over a gateway blip.
  it("reads a gateway error as unavailable, not as a category that is absent", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 500, message: "خطای داخلی", timestamp: null }, { status: 500 }),
    );

    expect((await lookupCategory("mvbayl")).kind).toBe("unavailable");
  });

  it("reads a stopped gateway as unavailable, not as a category that is absent", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    expect((await lookupCategory("mvbayl")).kind).toBe("unavailable");
  });

  // A 200 the gateway did not document is not a category. Reading it as one puts an empty heading and
  // an empty grid on the page, which is the answer this whole distinction exists to avoid.
  it("reads a 200 that is not the documented shape as unavailable", async () => {
    fetchMock.mockResolvedValue(stubResponse({ slug: "mvbayl" }));

    expect((await lookupCategory("mvbayl")).kind).toBe("unavailable");
  });

  it("asks for a collection under the same prefix, and keeps the same three answers", async () => {
    fetchMock.mockResolvedValue(stubResponse(collectionBody));
    expect(await lookupCollection("offers")).toEqual({ kind: "ok", collection: collectionBody });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/catalogue/collections/offers`);

    fetchMock.mockResolvedValue(stubResponse(notFoundBody, { status: 404 }));
    expect(await lookupCollection("offers")).toEqual({ kind: "missing" });

    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 503, message: "در دسترس نیست", timestamp: null }, { status: 503 }),
    );
    expect((await lookupCollection("offers")).kind).toBe("unavailable");
  });
});

describe("the category page's two refusals", () => {
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

  const renderPage = (slug: string) =>
    CategoryPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });

  it("renders Next's not-found for a slug no category holds", async () => {
    fetchMock.mockResolvedValue(stubResponse(notFoundBody, { status: 404 }));

    const error = await raisedBy(renderPage("no-such-category"));

    // `notFound()` raises Next's own HTTP-fallback error, whose digest carries the 404. A page that
    // raised a plain error here would be sending a genuine 404 to its error boundary instead.
    expect(error?.digest).toMatch(/404/);
  });

  it("raises for the error boundary when the gateway is down, and does not render not-found", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    const error = await raisedBy(renderPage("mvbayl"));

    // A plain raised error, with no Next digest at all: the opposite of a not-found, and the only
    // one of the two that reaches the error boundary.
    expect(error?.digest).toBeUndefined();
    expect(error?.message).toMatch(/gateway unavailable/);
  });
});

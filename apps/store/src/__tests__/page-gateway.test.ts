// The storefront's CMS-page read, driven against a stubbed gateway.
//
// The half of criterion 8's route that is not the home page, and the part of it that is easiest to get
// wrong in a way nobody sees: a page that does not exist and a gateway that is not answering must not
// look alike. Both arrive as "no page", and answering "not found" to an outage turns a five-minute
// blip into a site full of dead links that look deliberate.
//
// The URL is pinned here for the same reason it is pinned in the gateway's own suite: the two halves
// of one contract cannot be compared in a single process without an app importing another app, which
// §5.1 forbids. A prefix added to the controller lands on this path too, and the two drifting apart
// is a 404 in production and a green suite here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "http://gateway.test:3102";

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

const pageBody = {
  slug: "about",
  title: "درباره ما",
  blocks: [{ id: "b1", type: "richText", props: { html: "<p>سلام</p>" }, data: {} }],
};

describe("the storefront's page read", () => {
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

  async function lookup(slug: string) {
    const { lookupPage } = await import("@/content/lib/gateway-page");
    return lookupPage(slug);
  }

  it("asks the gateway for the path the gateway serves", async () => {
    fetchMock.mockResolvedValue(stubResponse(pageBody));

    const result = await lookup("about");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/content/pages/about`);
    expect(result).toEqual({ kind: "ok", page: pageBody });
  });

  it("encodes the slug, so a slug cannot become a path", async () => {
    fetchMock.mockResolvedValue(stubResponse(pageBody));

    await lookup("a/b?c=1");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${BASE}/content/pages/a%2Fb%3Fc%3D1`);
  });

  it("reads a 404 as a page that is absent", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 404, message: "صفحه مورد نظر پیدا نشد.", timestamp: null }, { status: 404 }),
    );

    expect(await lookup("nope")).toEqual({ kind: "missing" });
  });

  // The distinction the module exists for: an outage must not be reported as a missing page.
  it("reads a gateway error as unavailable, not as a page that is absent", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 500, message: "خطای داخلی", timestamp: null }, { status: 500 }),
    );

    const result = await lookup("about");

    expect(result.kind).toBe("unavailable");
  });

  it("reads a stopped gateway as unavailable, not as a page that is absent", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    const result = await lookup("about");

    expect(result.kind).toBe("unavailable");
  });

  it("reads a 200 that is not the documented shape as unavailable", async () => {
    fetchMock.mockResolvedValue(stubResponse({ slug: "about" }));

    const result = await lookup("about");

    expect(result.kind).toBe("unavailable");
  });
});

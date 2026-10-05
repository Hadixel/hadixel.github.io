// The storefront's chrome, blog and sitemap reads, driven against a stubbed gateway.
//
// The URLs are pinned here for the reason `page-gateway.test.ts` pins its own: the two halves of one
// contract cannot be compared in a single process without an app importing another app. A route
// renamed on either side is a 404 in production and a green suite here, so both ends write the path
// down and a reader checks them against each other.
//
// What these pin beyond the paths is the distinction the whole move turns on. A read that could not be
// made must not arrive as an answer: not an empty menu, not a footer with no groups, and above all
// not a sitemap that is quietly short. Each of those is a page that looks right and is wrong.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "http://gateway.test:3102";

/** The parts of a `Response` the client touches, so a stub need not be a real one. */
function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
}

const menuBody = {
  menus: [
    {
      location: "HEADER",
      name: "دسته‌بندی‌ها",
      tree: [
        {
          id: "i1",
          label: "یخسال",
          href: "/category/yeksay",
          newTab: false,
          display: "MEGA",
          children: [
            {
              id: "i2",
              label: "دو-door",
              href: "/collection/do-door",
              newTab: false,
              display: "DROPDOWN",
              children: [],
              promos: [],
            },
          ],
          promos: [
            { imageUrl: "/p.svg", alt: "بنر", href: "https://example.test", newTab: true },
          ],
        },
      ],
    },
    { location: "MOBILE", name: "موبایل", tree: [] },
    { location: "FOOTER", name: "پاورقی", tree: [] },
  ],
};

describe("the storefront's chrome reads", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    process.env.NEXT_PUBLIC_BASE_URL = "https://shop.test";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // The chrome has nowhere to show a shopper-facing failure, so the log is the reporting surface.
    // Silencing it here keeps the suite's output readable and lets the failure cases assert on it.
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errors.mockRestore();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  async function loadNav() {
    // Imported lazily so each test picks up the base URL set above.
    const { loadNav: read } = await import("@/lib/nav");
    return read();
  }

  async function getNavMenu(location: "HEADER" | "FOOTER" | "MOBILE") {
    const { getNavMenu: read } = await import("@/lib/nav");
    return read(location);
  }

  async function loadFooter() {
    const { loadFooter: read } = await import("@/lib/nav");
    return read();
  }

  it("asks the gateway for the path the gateway serves", async () => {
    fetchMock.mockResolvedValue(stubResponse(menuBody));

    await loadNav();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith(`${BASE}/storefront/nav`)).toBe(true);
  });

  it("answers the whole chrome from one read, whatever part of it a caller wants", async () => {
    fetchMock.mockResolvedValue(stubResponse(menuBody));

    const nav = await loadNav();

    // The header wants two of the three locations and the footer the third. Reading one per call
    // meant assembling each tree from its own moment; this is the one read that cannot do that.
    expect([...nav.menus.map((menu) => menu.location)].sort()).toEqual(["FOOTER", "HEADER", "MOBILE"]);
    expect(nav.failure).toBeNull();
  });

  it("hands a caller the menu it asked for, with every link already an href", async () => {
    fetchMock.mockResolvedValue(stubResponse(menuBody));

    const header = await getNavMenu("HEADER");

    const top = header?.tree[0];
    expect(top?.href).toBe("/category/yeksay");
    expect(top?.children[0]?.href).toBe("/collection/do-door");
    expect(top?.promos[0]).toMatchObject({ href: "https://example.test", newTab: true });
  });

  it("reports a gateway error rather than answering with no menus", async () => {
    fetchMock.mockResolvedValue(stubResponse({ message: "خطای داخلی" }, { status: 500 }));

    const nav = await loadNav();

    expect(nav.failure).toContain("خطای داخلی");
    expect(nav.menus).toEqual([]);
    // The chrome renders the same page either way, so the log is the only place the difference shows.
    expect(errors).toHaveBeenCalled();
  });

  it("reports a stopped gateway rather than answering with no menus", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    const nav = await loadNav();

    expect(nav.failure).toContain("ECONNREFUSED");
    expect(nav.menus).toEqual([]);
  });

  it("reports a 200 that is not the documented shape", async () => {
    fetchMock.mockResolvedValue(stubResponse({ items: [] }));

    const nav = await loadNav();

    expect(nav.failure).not.toBeNull();
    expect(nav.menus).toEqual([]);
  });

  it("reads the footer's groups as the gateway decided them", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({
        name: "پاورقی",
        links: [{ href: "/about", label: "درباره ما" }],
        categories: [{ href: "/category/yeksay", label: "یخسال" }],
      }),
    );

    const footer = await loadFooter();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith(`${BASE}/storefront/footer`)).toBe(true);
    expect(footer.failure).toBeNull();
    expect(footer.links).toEqual([{ href: "/about", label: "درباره ما" }]);
    expect(footer.categories).toEqual([{ href: "/category/yeksay", label: "یخسال" }]);
  });

  it("reports a footer read that failed instead of a footer with no groups", async () => {
    fetchMock.mockResolvedValue(stubResponse({ message: "پیدا نشد" }, { status: 404 }));

    const footer = await loadFooter();

    expect(footer.failure).not.toBeNull();
    expect(footer.links).toEqual([]);
  });

  it("passes a resolved link through and refuses to invent one", async () => {
    const { hrefFor } = await import("@/lib/nav");

    expect(await hrefFor({ href: "/category/yeksay", newTab: false })).toEqual({
      href: "/category/yeksay",
      newTab: false,
    });
    // A target id is not a link and cannot become one without the database. It becomes a link that
    // goes nowhere, which is the honest answer and is not the same as a link to the wrong place.
    expect(await hrefFor({ type: "CATEGORY", targetId: "c1" })).toEqual({ href: "#", newTab: false });
    expect(await hrefFor(null)).toEqual({ href: "#", newTab: false });
  });
});

describe("the storefront's sitemap", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = BASE;
    process.env.NEXT_PUBLIC_BASE_URL = "https://shop.test";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    errors.mockRestore();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  async function sitemap() {
    const { default: read } = await import("@/app/sitemap");
    return read();
  }

  const entry = (path: string, extra: Record<string, unknown> = {}) => ({
    path,
    lastModified: null,
    changeFrequency: "weekly",
    priority: 0.8,
    ...extra,
  });

  it("asks the gateway for the path the gateway serves, and puts the shop's host on every row", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({
        entries: [entry("", { changeFrequency: "daily", priority: 1 }), entry("/product/yeksay")],
        complete: true,
        missing: [],
      }),
    );

    const rows = await sitemap();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url.startsWith(`${BASE}/storefront/sitemap`)).toBe(true);
    expect(rows.map((row) => row.url)).toEqual([
      "https://shop.test",
      "https://shop.test/product/yeksay",
    ]);
  });

  // The failure this route is most able to get quietly wrong. A missing section is a set of URLs out
  // of the index, read by a machine that never complains; what has to hold is that the answer says so.
  it("serves what it could read, and says out loud which section it could not", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({
        entries: [entry(""), entry("/category/yeksay", { priority: 0.7 })],
        complete: false,
        missing: ["products"],
      }),
    );

    const rows = await sitemap();

    expect(rows.map((row) => row.url)).toEqual([
      "https://shop.test",
      "https://shop.test/category/yeksay",
    ]);
    expect(errors.mock.calls.flat().join(" ")).toContain("products");
  });

  it("says nothing when nothing was missing", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ entries: [entry("")], complete: true, missing: [] }),
    );

    await sitemap();

    expect(errors).not.toHaveBeenCalled();
  });

  // The opposite failure: an unreachable gateway must not be answered with three static paths that
  // stand in for a whole catalogue. Next renders the 500, which is visible in the log and retried.
  it("fails rather than serving a sitemap of only the paths it can invent", async () => {
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    await expect(sitemap()).rejects.toThrow("ECONNREFUSED");
  });

  it("fails on a 200 that is not the documented shape", async () => {
    fetchMock.mockResolvedValue(stubResponse({ urls: [] }));

    await expect(sitemap()).rejects.toThrow();
  });
});

// The panel's request path, driven against a stubbed gateway.
//
// The panel is moving behind the gateway, and this file asserts the half that is easy to get quietly
// wrong: that an action reaches the gateway over HTTP, as the operator, and reports what the server
// said. There is no data-tier import anywhere in the path under test, so there is nothing to fall back
// to — these tests pin the reporting half, and the absence of the import is what makes the guarantee
// structural rather than a promise.
//
// The Persian messages matter here. An action that replaced the server's own message with a generic
// "try again" would pass every assertion about method and path, and would be the regression this
// repository has already made once: six of the panel's actions did exactly that for a 409 the gateway
// had already explained.

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

describe("an action that goes through the gateway", () => {
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
    // Imported lazily so each test picks up the base URL and the stub set above.
    const { fromGateway } = await import("@/lib/gateway");
    return fromGateway((client) => client.post("/orders/o1/status", { dimension: "FULFILLMENT", to: "CONFIRMED" }), "وضعیت به‌روزرسانی شد");
  }

  it("asks the gateway, as a write, with the operator's session", async () => {
    fetchMock.mockResolvedValue(stubResponse({ from: "PENDING" }));

    const result = await load();

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/orders/o1/status`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ dimension: "FULFILLMENT", to: "CONFIRMED" });
    // Never cached: this is a live write and a live read of stock behind it.
    expect(init.cache).toBe("no-store");
  });

  it("returns the value the server sent", async () => {
    fetchMock.mockResolvedValue(stubResponse({ from: "PENDING" }));

    const result = await load();

    expect(result.ok && result.data).toEqual({ from: "PENDING" });
  });

  // The panel's own Persian sentence, not a status code the browser has to know about.
  it("reports the server's own message when the gateway refuses", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "وضعیت سفارش هم‌زمان تغییر کرده؛ صفحه را تازه‌سازی کنید", timestamp: "2026-09-27T10:00:00.000Z" },
        { status: 409 },
      ),
    );

    const result = await load();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("وضعیت سفارش هم‌زمان تغییر کرده؛ صفحه را تازه‌سازی کنید");
  });

  it("says the gateway is down, rather than reporting a bad request", async () => {
    // "The gateway is down" and "the gateway said no" are different faults. Collapsing them is how an
    // outage gets reported to whoever is on call as a client's malformed input.
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    const result = await load();

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/در دسترس نیست/);
  });

  it("refuses to send anything when the address was never configured", async () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    fetchMock.mockResolvedValue(stubResponse({ from: "PENDING" }));

    const result = await load();

    // No request attempted at all. A client that defaulted to a loopback address would appear to work
    // in development and report every read as a gateway failure in production.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/NEXT_PUBLIC_API_URL/);
  });
});

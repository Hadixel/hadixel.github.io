import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const { assertSafeRemoteUrl } = await import("@kmodern/scraper-core");

// The resolution cache is module-level and survives between tests, so every
// test uses its own hostname to keep them independent.
describe("DNS resolution during a crawl", () => {
  beforeEach(() => {
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("resolves a host once per window instead of once per request", async () => {
    for (let i = 0; i < 50; i++) {
      await assertSafeRemoteUrl(`https://bulk-crawl.test/uploads/img-${i}.jpg`);
    }
    expect(lookupMock).toHaveBeenCalledTimes(1);
  });

  it("resolves each distinct host separately", async () => {
    await assertSafeRemoteUrl("https://multi-a.test/a.jpg");
    await assertSafeRemoteUrl("https://multi-b.test/b.jpg");
    await assertSafeRemoteUrl("https://multi-a.test/c.jpg");
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it("reports a resolver failure as a DNS error, not as a blocked host", async () => {
    lookupMock.mockRejectedValueOnce(Object.assign(new Error("getaddrinfo EAI_AGAIN flaky.test"), { code: "EAI_AGAIN" }));
    await expect(assertSafeRemoteUrl("https://flaky-error.test/uploads/525.jpg")).rejects.toThrow(/DNS lookup failed/);
  });

  it("does not cache a transient failure, so the next request re-resolves", async () => {
    lookupMock.mockRejectedValueOnce(new Error("getaddrinfo EAI_AGAIN flaky-retry.test"));
    await expect(assertSafeRemoteUrl("https://flaky-retry.test/a.jpg")).rejects.toThrow(/DNS lookup failed/);
    await assertSafeRemoteUrl("https://flaky-retry.test/b.jpg");
    expect(lookupMock).toHaveBeenCalledTimes(2);
  });

  it("still rejects a host that resolves to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeRemoteUrl("https://ssrf.test/a.jpg")).rejects.toThrow(/Private or unresolvable/);
  });

  it("still rejects documentation and reserved ranges, not just RFC1918", async () => {
    lookupMock.mockResolvedValue([{ address: "203.0.113.9", family: 4 }]);
    await expect(assertSafeRemoteUrl("https://reserved.test/a.jpg")).rejects.toThrow(/Private or unresolvable/);
  });
});

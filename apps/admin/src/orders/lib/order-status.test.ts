// The order status module, driven against a stubbed gateway.
//
// What is asserted here is the shape of the panel's half of the move: that the request the panel builds
// is the request the gateway serves, and that the panel's own copies of the rules are gone rather than
// merely unused. The rule itself — which transitions exist, and what each one does to stock — is the
// gateway's, and apps/api/tests/order-transitions.test.ts is where that is pinned.
//
// The last test is the one that would have caught the original defect. The panel used to carry its own
// FULFILLMENT_NEXT and PAYMENT_NEXT tables in two files, validate a transition against them, and then
// write the change itself. Any of those three things reappearing is a copy of a rule that can drift.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("changing an order's status", () => {
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
    const { setOrderStatus } = await import("@/orders/lib/order-status");
    return setOrderStatus;
  }

  it("asks the gateway for the endpoint that applies the change", async () => {
    fetchMock.mockResolvedValue(stubResponse({ from: "PENDING" }));

    const setOrderStatus = await load();
    const result = await setOrderStatus({ orderId: "o1", dimension: "FULFILLMENT", to: "CONFIRMED" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/orders/o1/status`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ dimension: "FULFILLMENT", to: "CONFIRMED" });
  });

  it("sends the note when the operator gave one, and omits it otherwise", async () => {
    fetchMock.mockResolvedValue(stubResponse({ from: "PENDING" }));
    const setOrderStatus = await load();

    await setOrderStatus({ orderId: "o1", dimension: "PAYMENT", to: "PAID", note: "کارت به کارت" });
    expect(JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).note).toBe("کارت به کارت");

    await setOrderStatus({ orderId: "o1", dimension: "PAYMENT", to: "PAID" });
    expect(JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body)).note).toBeUndefined();
  });

  // The panel is not asked to decide legality, so it must not report a refusal of its own for a
  // transition the gateway has an opinion about. An impossible transition is the gateway's to refuse,
  // and its reason is the one the operator is shown.
  it("sends any transition to the gateway rather than deciding legality itself", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 400, message: "این انتقال وضعیت مجاز نیست" }, { status: 400 }),
    );

    const setOrderStatus = await load();
    const result = await setOrderStatus({ orderId: "o1", dimension: "FULFILLMENT", to: "DELIVERED" });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe("این انتقال وضعیت مجاز نیست");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses a malformed request itself, without a round trip", async () => {
    const setOrderStatus = await load();

    expect((await setOrderStatus({ orderId: "", dimension: "FULFILLMENT", to: "CONFIRMED" })).ok).toBe(false);
    expect(
      (await setOrderStatus({ orderId: "o1", dimension: "BOGUS" as never, to: "CONFIRMED" })).ok,
    ).toBe(false);
    expect((await setOrderStatus({ orderId: "o1", dimension: "FULFILLMENT", to: "" })).ok).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a concurrent change with the gateway's sentence", async () => {
    fetchMock.mockResolvedValue(
      stubResponse(
        { statusCode: 409, message: "وضعیت سفارش هم‌زمان تغییر کرده؛ صفحه را تازه‌سازی کنید" },
        { status: 409 },
      ),
    );

    const setOrderStatus = await load();
    const result = await setOrderStatus({ orderId: "o1", dimension: "FULFILLMENT", to: "CONFIRMED" });

    expect(result.ok === false && result.error).toMatch(/هم‌زمان/);
  });
});

describe("the transitions the form offers", () => {
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

  it("are read from the gateway, so the form cannot offer one the server would refuse", async () => {
    fetchMock.mockResolvedValue(
      stubResponse({ fulfillment: ["CONFIRMED", "CANCELLED"], payment: ["PAID", "FAILED"] }),
    );

    const { readOrderTransitions } = await import("@/orders/lib/order-status");
    const transitions = await readOrderTransitions("o1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${BASE}/orders/o1/transitions`);
    expect(transitions).toEqual({ fulfillment: ["CONFIRMED", "CANCELLED"], payment: ["PAID", "FAILED"] });
  });

  it("offers nothing for a terminal state, because the gateway said so", async () => {
    fetchMock.mockResolvedValue(stubResponse({ fulfillment: [], payment: [] }));

    const { readOrderTransitions } = await import("@/orders/lib/order-status");

    expect(await readOrderTransitions("o1")).toEqual({ fulfillment: [], payment: [] });
  });
});

describe("the panel no longer carries its own copy of the rules", () => {
  it("has no transition table in the action module or the form", () => {
    // The defect, stated as a test. Two byte-identical tables in two files, free to drift from the
    // gateway's and from each other, is what this whole move exists to end.
    for (const file of ["./order-status.ts", "../components/order-transitions.tsx"]) {
      const source = sourceOf(file);
      expect(source, `${file} must not carry a transition table`).not.toMatch(/FULFILLMENT_NEXT|PAYMENT_NEXT/);
      expect(source, `${file} must not tabulate transitions`).not.toMatch(/PENDING:\s*\[/);
    }
  });

  it("does not import the data tier to apply a change", () => {
    // A rule enforced by the panel against its own tables is a second implementation of it, whether
    // or not the tables look like the gateway's.
    expect(sourceOf("./order-status.ts")).not.toMatch(/@kmodern\/db/);
  });
});

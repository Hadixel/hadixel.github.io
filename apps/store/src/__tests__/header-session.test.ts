// The header's session read, which is the difference between a signed-out corner icon and a storefront
// that is entirely down.
//
// `SiteHeader` renders inside the root layout, and per the Next docs `app/error.tsx` does not wrap the
// layout above it — so anything the header throws escapes to `global-error.tsx` and takes every page
// with it. The header is asked one question ("is there an account icon?"), and it has to have an answer
// even when the gateway cannot be reached or the build never had a gateway address to begin with.
//
// These tests pin that: a gateway fault produces signed-out chrome and a log line, never a throw. The
// throw stays where it belongs, in `currentCustomer`, for the pages that would rather show a retry.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: cookiesMock, headers: vi.fn().mockResolvedValue(null) }));

import { GatewayError } from "@kmodern/transport/client";
import { currentCustomer, currentCustomerForChrome } from "@/account/lib/customer-session";

const TOKEN = "gateway-token";

function stubResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe("the header's session read", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logged: unknown[];

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://gateway.test:3102";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  function signedIn() {
    cookiesMock.mockResolvedValue({ get: (n: string) => (n === "kmodern_customer" ? { value: TOKEN } : undefined) });
  }

  function signedOut() {
    cookiesMock.mockResolvedValue({ get: () => undefined });
  }

  it("returns the shopper when the gateway answers", async () => {
    signedIn();
    fetchMock.mockResolvedValue(stubResponse({ customerId: "c1", phone: "09120000000" }));

    await expect(currentCustomerForChrome()).resolves.toEqual({
      customer: { id: "c1", phone: "09120000000" },
    });
  });

  it("does not call the gateway at all when there is no session cookie", async () => {
    signedOut();

    await expect(currentCustomerForChrome()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders signed-out chrome instead of throwing when the address is not configured", async () => {
    // The reported failure: a build without NEXT_PUBLIC_API_URL. Before this, the client factory threw
    // from inside the root layout and every page in the storefront went to global-error.
    signedIn();
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(currentCustomerForChrome()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logged).toHaveLength(1);
  });

  it("renders signed-out chrome when the gateway is unreachable", async () => {
    signedIn();
    fetchMock.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102"));

    await expect(currentCustomerForChrome()).resolves.toBeNull();
    expect(logged).toHaveLength(1);
  });

  it("renders signed-out chrome on a gateway error status, without logging it as a fault", async () => {
    signedIn();
    fetchMock.mockResolvedValue(
      stubResponse({ statusCode: 503, message: "درگاه موقتاً در دسترس نیست." }, { status: 503 }),
    );

    await expect(currentCustomerForChrome()).resolves.toBeNull();
    expect(logged).toHaveLength(1);
  });

  it("reports a signed-out shopper as null and stays quiet", async () => {
    signedIn();
    fetchMock.mockResolvedValue(stubResponse({ statusCode: 401, message: "unauthorized" }, { status: 401 }));

    await expect(currentCustomerForChrome()).resolves.toBeNull();
    expect(logged).toHaveLength(0);
  });

  it("still lets currentCustomer throw, so the account page can show a retry", async () => {
    // The distinction the chrome read gives up on purpose. A page about the shopper must be able to tell
    // "signed out" from "the gateway is down"; if this stopped throwing, a blip would sign everyone out.
    signedIn();
    delete process.env.NEXT_PUBLIC_API_URL;

    await expect(currentCustomer()).rejects.toBeInstanceOf(GatewayError);
  });

  it("does not swallow a non-gateway fault", async () => {
    signedIn();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.reject(new SyntaxError("Unexpected token")),
    } as unknown as Response);

    await expect(currentCustomerForChrome()).rejects.toBeInstanceOf(SyntaxError);
  });
});

// The behaviour above only protects the storefront if the header actually calls the safe read. The
// component is a .tsx and this runner only collects *.test.ts, so the wiring is pinned by reading the
// source rather than by rendering it — a green unit test on the helper is worth nothing if the header
// silently went back to the throwing one.
describe("the header is wired to the safe read", () => {
  it("reads the session through currentCustomerForChrome, not currentCustomer", async () => {
    const source = await readFile(
      fileURLToPath(new URL("../components/site-header.tsx", import.meta.url)),
      "utf8",
    );
    expect(source).toContain("currentCustomerForChrome()");
    expect(source).not.toMatch(/\bcurrentCustomer\(\)/);
  });
});

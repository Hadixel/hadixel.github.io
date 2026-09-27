// The transport's contract, from the consumer's side.
//
// A transport is only worth having if the things it owns stay owned. These tests are written as the
// properties a caller relies on and each of them fails if that responsibility moves back out to a call
// site: the Persian message reaching the caller, an empty body not becoming a parse error, a missing
// base URL refusing loudly instead of defaulting to loopback, and a query that does not send `null`.

import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, GatewayError } from "@kmodern/transport/client";

const BASE = "http://gateway.test:3102";

function stub(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

function client(overrides: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  return createApiClient({
    baseUrl: BASE,
    tokenName: "kmodern_customer",
    getToken: () => "tok",
    ...overrides,
  });
}

describe("the base URL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses to build a client without one, naming the variable", () => {
    // A client that defaulted to loopback would produce a deployed build that calls nothing and reports
    // every read as a failure — the failure would point at the gateway rather than at the build.
    expect(() => createApiClient({ baseUrl: "", tokenName: "c", getToken: () => null })).toThrow(
      /NEXT_PUBLIC_API_URL|gateway base URL/,
    );
    expect(() => createApiClient({ baseUrl: "   ", tokenName: "c", getToken: () => null })).toThrow();
  });

  it("does not double a trailing slash into a double slash in every path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    await client({ baseUrl: `${BASE}/` }).get("/content/home");
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/content/home`);
  });
});

describe("a successful read", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub({ blocks: [] })));
    await expect(client().get("/content/home")).resolves.toEqual({ blocks: [] });
  });

  it("treats an empty body as null rather than a parse error", async () => {
    // A sign-out or a delete answers with no body. Reporting that as malformed JSON makes a
    // successful operation look like a broken one.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub(undefined)));
    await expect(client().post("/auth/sign-out")).resolves.toBeNull();
  });

  it("treats a non-JSON body as null rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub("<html>502</html>")));
    await expect(client().get("/content/home")).resolves.toBeNull();
  });

  it("is never cached, because this is a live read of stock and sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/content/home");
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });

  it("carries a timeout, so a wedged gateway does not hang a render", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/content/home");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("a query", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes values and drops the ones that are not there", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/checkout/quote", { query: { limit: 24, coupon: "AB C", empty: undefined } });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/checkout/quote?limit=24&coupon=AB+C`);
    expect(url).not.toContain("empty");
  });

  it("keeps a query the path already carries", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/content/home?a=1", { query: { b: 2 } });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/content/home?a=1&b=2`);
  });
});

describe("a failure", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The reason the envelope is parsed at all: a message a human reads must be the server's sentence,
  // not this library's guess at what a status code means.
  it("carries the server's own Persian message and status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        stub({ statusCode: 409, message: "یک سفارش در انتظار پرداخت دارید.", timestamp: "2026-01-01T00:00:00.000Z" }, { status: 409 }),
      ),
    );

    const error = await client().post("/checkout").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GatewayError);
    const failure = error as GatewayError;
    expect(failure.message).toBe("یک سفارش در انتظار پرداخت دارید.");
    expect(failure.statusCode).toBe(409);
    expect(failure.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("prefers the envelope's status over the HTTP one when they disagree", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(stub({ statusCode: 409, message: "تعارض" }, { status: 500 })),
    );
    const error = (await client().post("/checkout").catch((e: unknown) => e)) as GatewayError;
    expect(error.statusCode).toBe(409);
  });

  it("falls back to a sentence, never to a bare status code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub({}, { status: 500 })));
    const error = (await client().get("/x").catch((e: unknown) => e)) as GatewayError;
    expect(error.message).toMatch(/درگاه/);
    expect(error.message).not.toBe("500");
  });

  it("tells a gateway that was never reached apart from one that said no", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:3102")));

    const error = (await client().get("/x").catch((e: unknown) => e)) as GatewayError;

    expect(error).toBeInstanceOf(GatewayError);
    // 0 and `unreachable`, because "the gateway is down" and "the gateway refused this" call for
    // different responses, and collapsing them reports an outage as a bad request.
    expect(error.statusCode).toBe(0);
    expect(error.unreachable).toBe(true);
  });

  it("classifies the two statuses a client branches on", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub({ message: "نیست" }, { status: 404 })));
    const notFound = (await client().get("/orders/x").catch((e: unknown) => e)) as GatewayError;
    expect(notFound.notFound).toBe(true);
    expect(notFound.unauthorized).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub({ message: "واریز" }, { status: 401 })));
    const unauthorized = (await client().get("/orders/mine").catch((e: unknown) => e)) as GatewayError;
    expect(unauthorized.unauthorized).toBe(true);
    expect(unauthorized.notFound).toBe(false);
  });

  it("reports through the hook, so both entry points report the same way", async () => {
    const onError = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(stub({ message: "نه" }, { status: 403 })));
    await client({ onError }).get("/x").catch(() => undefined);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(GatewayError);
  });
});

describe("the credential", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("travels as the cookie the audience is named by", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/orders/mine");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).cookie).toBe("kmodern_customer=tok");
  });

  it("prefers a forwarded cookie jar over one rebuilt from a value", async () => {
    // A session that also carries something else stops working if the jar is rebuilt from one value —
    // and that failure looks like a gateway bug rather than a transport one.
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client({ getCookieHeader: () => "kmodern_customer=tok; other=keep" }).get("/orders/mine");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers && ((fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>).cookie).toBe(
      "kmodern_customer=tok; other=keep",
    );
  });

  it("sends no credential at all rather than an empty one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client({ getToken: () => null }).get("/content/home");
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.cookie).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
  });

  it("is read per request, so a sign-out takes effect immediately", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    let token: string | null = "first";
    const api = client({ getToken: () => token });
    await api.get("/orders/mine");
    token = null;
    await api.get("/orders/mine");
    const second = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(second.cookie).toBeUndefined();
  });
});

describe("writing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("encodes a body as JSON and says so", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().post("/checkout", { items: [{ variantId: "v1", qty: 2 }] });
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ items: [{ variantId: "v1", qty: 2 }] });
  });

  it("sends no body for a call that has none", async () => {
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    await client().post("/auth/otp");
    expect((fetchMock.mock.calls[0][1] as RequestInit).body).toBeUndefined();
  });

  it("sends an upload body untouched, with the content type the caller chose", async () => {
    // A JSON encoder applied to FormData produces a stringified object, which is how a media upload
    // silently posts the literal text "[object FormData]".
    const fetchMock = vi.fn().mockResolvedValue(stub({}));
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.set("file", "contents");
    await client().upload("/media", form, { contentType: "multipart/form-data" });
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.body).toBe(form);
    expect(init.headers["content-type"]).toBe("multipart/form-data");
  });

  it("offers the verbs the gateway actually uses", () => {
    const api = client();
    for (const verb of ["get", "post", "put", "patch", "delete", "upload"] as const) {
      expect(typeof api[verb]).toBe("function");
    }
  });
});

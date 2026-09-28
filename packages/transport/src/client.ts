// One typed client for the gateway, for both clients.
//
// Every request to the gateway used to be a hand-written `fetch`: the URL assembled from an env var, a
// timeout invented per call site, a response parsed by hand, and the error handling wherever the caller
// happened to put it. Thirteen of them in the storefront. The consequences are the ones this package
// exists to remove — a site with a cached home page, a Persian error message rendered as a class name,
// and a body that had to be checked for emptiness at fourteen separate call sites.
//
// So the factory owns all of it: base URL, the credential, JSON encoding, empty responses, timeouts,
// and one error type that keeps the server's Persian message. A caller names a path and a shape and
// gets back a shape or a `GatewayError`.
//
// The two entry points are not duplication. A browser caller holds its credential in browser storage
// and attaches it; a server-side caller holds it on the incoming request and forwards it. Same
// request, two places the credential can be read from — §10 names this the one legitimate duplication,
// and keeping them in one file is what makes it legible as such rather than as a second factory.

/** A gateway failure, carrying the server's own message and status. */
export class GatewayError extends Error {
  readonly statusCode: number;
  readonly timestamp: string | null;
  /**
   * 0 means the gateway was never reached — a refused connection, a timeout, a DNS failure. Distinct
   * from a real HTTP status, because "the gateway is down" and "the gateway said no" call for
   * different responses and collapsing them is how an outage is reported as a bad request.
   */
  readonly unreachable: boolean;

  constructor(
    message: string,
    statusCode: number,
    timestamp: string | null = null,
    unreachable = false,
    misconfigured = false,
  ) {
    super(message);
    this.name = "GatewayError";
    this.statusCode = statusCode;
    this.timestamp = timestamp;
    this.unreachable = unreachable;
    this.misconfigured = misconfigured;
  }

  /** No such thing, or the caller may not see it. The one case a client renders as a 404. */
  get notFound(): boolean {
    return this.statusCode === 404;
  }

  /** The caller is not signed in, or their session has ended. */
  get unauthorized(): boolean {
    return this.statusCode === 401;
  }

  /**
   * The client was built without a usable gateway address, so nothing was attempted.
   *
   * A separate flag from `unreachable` because the two demand opposite responses. A gateway that is
   * down is an operational problem to retry; an unconfigured address is a build fault that no retry will
   * fix, and reporting it as an outage sends someone to the wrong machine. It is still an error rather
   * than a silent default, and still reaches the caller as a `GatewayError`, so a page that reports
   * failure reports this too — with a message that names the variable.
   */
  misconfigured: boolean;
}

export interface RequestOptions {
  /** Query values. `undefined` and `null` are dropped, so an optional filter is not sent as "null". */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Extra headers. Merged over the defaults; `headers` is how a caller sets a content type. */
  headers?: Record<string, string>;
  /** Overrides the default timeout. A quote that waits on a carrier may want longer. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** The cookie this audience's credential travels in. Identity, per §10. */
  tokenName: string;
  /**
   * The credential value, or null. Read at call time so a sign-in or sign-out takes effect on the next
   * request rather than the next page load.
   */
  getToken: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * A verbatim `Cookie` header, used instead of a synthesised one.
   *
   * This is what a server-side hop forwards. The gateway authenticates a shopper by reading a cookie,
   * so a client that holds the caller's whole cookie jar should pass it through rather than rebuild it
   * from one value — otherwise a session the gateway also keeps something in stops working for reasons
   * that look like a gateway bug.
   */
  getCookieHeader?: () => string | null | undefined | Promise<string | null | undefined>;
  timeoutMs?: number;
  /** A hook for an error reporter, so both entry points report the same way. */
  onError?: (error: GatewayError, request: { method: string; url: string }) => void;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  /**
   * Send a body verbatim, for media and other non-JSON payloads.
   *
   * Separate from `post` because a JSON encoder applied to a `FormData` or a `ReadableStream` produces
   * a stringified object, and because an upload needs a content type the caller supplies rather than
   * one the factory guesses.
   */
  upload<T>(path: string, body: BodyInit, options?: RequestOptions & { contentType?: string }): Promise<T>;
  /** The base URL every path on this client is resolved against. Exposed so a caller can log it. */
  readonly baseUrl: string;
}

export const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * A gateway address, or a typed failure saying there is none.
 *
 * Deliberately not a default and not a bare `Error`. Defaulting to a loopback address produces a deployed
 * build that calls nothing and reports every read as a gateway failure — pointing an operator at the
 * gateway when the build is what is wrong. A bare `Error` would also escape a caller that is written to
 * report gateway failures, turning a configuration fault into a 500 instead of a page that says the shop
 * is unavailable. `GatewayError` with `misconfigured` set is both: reported, and identifiable.
 */
function requireBaseUrl(value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new GatewayError(
      "نشانی درگاه پیکربندی نشده است. متغیر NEXT_PUBLIC_API_URL در زمان ساخت باید تنظیم شود.",
      0,
      null,
      false,
      true,
    );
  }
  return value.trim().replace(/\/+$/, "");
}

function withQuery(path: string, query: RequestOptions["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  // A path that already carries a query keeps it: a caller passing one knows why.
  if (!search) return path;
  return path.includes("?") ? `${path}&${search}` : `${path}?${search}`;
}

/**
 * The factory.
 *
 * `tokenName` is the identity per §10: one name per audience, and nothing else varies between the two
 * clients. The value is the credential, however the caller obtained it — a cookie's contents from
 * browser storage, or the same cookie read off an incoming request.
 */
export function createApiClient(config: ApiClientConfig): ApiClient {
  const baseUrl = requireBaseUrl(config.baseUrl);
  const defaultTimeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(
    method: string,
    path: string,
    init: { body?: BodyInit; options?: RequestOptions; contentType?: string },
  ): Promise<unknown> {
    const { options, contentType } = init;
    const url = `${baseUrl}${withQuery(path, options?.query)}`;

    const headers: Record<string, string> = { accept: "application/json", ...options?.headers };
    if (contentType) headers["content-type"] = contentType;

    // The gateway reads the audience's cookie, so the credential travels as a cookie. A forwarded jar
    // wins when there is one; otherwise the single value is put in the cookie the config named. Both
    // are also offered as a bearer header, because that is what a non-browser caller can carry.
    const forwarded = config.getCookieHeader ? await config.getCookieHeader() : null;
    const token = await config.getToken();
    if (forwarded) {
      headers.cookie = forwarded;
    } else if (token) {
      headers.cookie = `${config.tokenName}=${token}`;
      headers.authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: init.body,
        // Never cached. This is a live read of stock, orders and sessions, and a cached home page is
        // one showing a sold-out product as available. Explicit rather than defaulted, because the
        // default changes if the app later turns on Cache Components.
        cache: "no-store",
        signal: options?.signal ?? AbortSignal.timeout(options?.timeoutMs ?? defaultTimeout),
      });
    } catch (cause) {
      // Next throws a sentinel from inside `fetch` to say "this route cannot be rendered statically,
      // switch it to dynamic". It is control flow, not a fault: swallowed here it becomes an
      // "unreachable gateway", and every server component that catches one would report a working
      // server as down — and a build would fail on a route that is correct at runtime. So it is
      // recognised by its own shape and passed straight back up, where Next is listening for it.
      if (isDynamicSignal(cause)) throw cause;
      const error = new GatewayError(
        `درگاه در دسترس نیست: ${cause instanceof Error ? cause.message : String(cause)}`,
        0,
        null,
        true,
      );
      config.onError?.(error, { method, url });
      throw error;
    }

    const text = await response.text();
    const body = text === "" ? null : safeParse(text);

    if (!response.ok) {
      const error = new GatewayError(
        envelopeMessage(body) ?? defaultMessage(response.status),
        envelopeStatus(body) ?? response.status,
        envelopeTimestamp(body),
      );
      config.onError?.(error, { method, url });
      throw error;
    }
    // A 200 with no body is a legitimate answer — a sign-out, a delete — and is `null` rather than a
    // parse error. Callers that need a value ask for an endpoint that returns one.
    return body;
  }

  const json = (body: unknown): BodyInit | undefined =>
    body === undefined ? undefined : JSON.stringify(body);

  return {
    baseUrl,
    get: <T>(path: string, options?: RequestOptions) => send("GET", path, { options }) as Promise<T>,
    post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      send("POST", path, { body: json(body), options, contentType: "application/json" }) as Promise<T>,
    patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      send("PATCH", path, { body: json(body), options, contentType: "application/json" }) as Promise<T>,
    put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
      send("PUT", path, { body: json(body), options, contentType: "application/json" }) as Promise<T>,
    delete: <T>(path: string, options?: RequestOptions) => send("DELETE", path, { options }) as Promise<T>,
    upload: <T>(path: string, body: BodyInit, options?: RequestOptions & { contentType?: string }) =>
      send("POST", path, { body, options, contentType: options?.contentType }) as Promise<T>,
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The server's own message, when it sent one.
 *
 * Prefers the envelope's Persian message over anything invented here, because the server knows why it
 * refused and this does not. Falls back to a per-status sentence rather than a status number, so a
 * message a human reads is always a sentence.
 */
function envelopeMessage(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return typeof body.message === "string" && body.message !== "" ? body.message : null;
}

function envelopeStatus(body: unknown): number | null {
  if (!isRecord(body)) return null;
  return typeof body.statusCode === "number" ? body.statusCode : null;
}

function envelopeTimestamp(body: unknown): string | null {
  if (!isRecord(body)) return null;
  return typeof body.timestamp === "string" ? body.timestamp : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultMessage(status: number): string {
  if (status === 401) return "نشست شما معتبر نیست؛ دوباره وارد شوید.";
  if (status === 403) return "به این بخش دسترسی ندارید.";
  if (status === 404) return "موردی که خواستید پیدا نشد.";
  if (status === 409) return "این کار قبلاً انجام شده یا با وضعیت فعلی سازگار نیست.";
  if (status >= 500) return "درگاه خطای داخلی دارد؛ کمی بعد دوباره تلاش کنید.";
  return `درگاه درخواست را نپذیرفت (کد ${status}).`;
}

/**
 * Whether a thrown value is Next's "render this dynamically" sentinel rather than a fault.
 *
 * Matched on the message and the `digest` together because neither is a documented contract: Next has
 * changed the wording across versions, and a check against only one of them is a check that will
 * quietly stop working. The cost of a false negative is the behaviour this replaced — a build
 * failing on "gateway unreachable" — and the cost of a false positive is that a real network error
 * whose message happens to match is reported as dynamic, which Next will then act on by rendering the
 * route dynamically. Both are recoverable; neither is worth a more elaborate guess.
 */
function isDynamicSignal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as Error & { digest?: unknown }).digest;
  const tagged = typeof digest === "string" && /NEXT_DYNAMIC|Bailout|BAILOUT/i.test(digest);
  return tagged || /dynamic server usage|couldn't be rendered statically/i.test(error.message);
}

// The one origin check, for the panel's state-changing route handlers.
//
// Five byte-identical copies of this function existed, one per route handler, and the count is the
// point rather than the duplication: a check that is written out is a check that is *maintained* five
// times, and the five can only agree by accident. A proxy that sets `x-forwarded-host` on one host and
// not another would have made one route refuse a legitimate POST and four accept it, and nothing would
// have said which.
//
// Why the check exists at all, since the session cookie is `SameSite=lax`: lax still sends the cookie
// on a top-level POST, which is exactly the shape a cross-site form submission has. So a page on
// another origin could make an operator's browser POST to a panel route that mutates, and the browser
// would attach the operator's session. Reading `Origin` and comparing it to the host is what refuses
// that.
//
// A missing `Origin` is allowed, and deliberately. Browsers send it on every cross-origin request and
// on same-origin POSTs in every current browser, so its absence means a non-browser client — curl, a
// server-to-server call, a test — which has no ambient authority to abuse. Refusing it would break
// those callers to defend against nothing. This is the one permissive branch and it is the one worth
// arguing about, so it is stated here rather than buried.

/**
 * Whether a request came from this panel's own origin.
 *
 * `x-forwarded-host` is preferred over `host` because behind a proxy the two disagree and the browser
 * only ever saw the public one. Both are comma-joined by proxies that append, so the first entry is
 * the one the client actually addressed.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .split(",")[0]
    .trim();
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    // An `Origin` that is not a URL is not this site's origin, whatever the host says.
    return false;
  }
}

import { describe, expect, it } from "vitest";
import { linkRefSchema } from "@kmodern/contracts";
import { sanitizeAdminHtml } from "@kmodern/contracts/sanitize";
import { pageParam } from "../lib/pagination";
import { sameOrigin } from "../lib/origin";

describe("admin input safety", () => {
  it("removes active HTML and unsafe URL protocols", () => {
    const clean = sanitizeAdminHtml('<p onclick="alert(1)">سلام</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    expect(clean).toContain("سلام");
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    expect(linkRefSchema.safeParse({ type: "EXTERNAL", url: "javascript:alert(1)" }).success).toBe(false);
  });


  it("bounds malformed pagination values", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("Infinity")).toBe(1);
    expect(pageParam("2")).toBe(2);
    expect(pageParam("999999")).toBe(100_000);
  });
});

/**
 * The origin check, once.
 *
 * This was five byte-identical copies, one per state-changing route handler, and the count was the
 * problem: a check written out is a check maintained five times, and the copies can only agree by
 * accident. The one definition now lives in `lib/origin.ts`, and these hold its decisions rather than
 * its implementation.
 */
describe("cross-origin requests", () => {
  const request = (headers: Record<string, string>) => new Request("http://panel.test/api", { headers });

  it("accepts a request that names this host as its origin", () => {
    expect(sameOrigin(request({ origin: "https://admin.kmodern.ir", host: "admin.kmodern.ir" }))).toBe(true);
  });

  it("refuses a request from another origin, which is the whole attack", () => {
    expect(sameOrigin(request({ origin: "https://evil.example", host: "admin.kmodern.ir" }))).toBe(false);
  });

  it("compares the port too, so a different service on the same host is not this panel", () => {
    expect(sameOrigin(request({ origin: "https://admin.kmodern.ir:8443", host: "admin.kmodern.ir" }))).toBe(false);
  });

  it("trusts the forwarded host, which is the one the browser actually addressed", () => {
    // Behind a proxy the internal `host` is not the public name, and the browser only ever saw the
    // public one — comparing against `host` would refuse every legitimate request in that deployment.
    expect(
      sameOrigin(request({ origin: "https://admin.kmodern.ir", host: "10.0.0.7:3000", "x-forwarded-host": "admin.kmodern.ir" })),
    ).toBe(true);
    expect(
      sameOrigin(request({ origin: "https://evil.example", host: "10.0.0.7:3000", "x-forwarded-host": "admin.kmodern.ir" })),
    ).toBe(false);
  });

  it("reads the first entry of a proxy-appended header list", () => {
    expect(
      sameOrigin(request({ origin: "https://admin.kmodern.ir", "x-forwarded-host": "admin.kmodern.ir, 10.0.0.7" })),
    ).toBe(true);
  });

  it("refuses an Origin that is not a URL at all", () => {
    // A header the browser would never send, so its presence means something is forging the request.
    expect(sameOrigin(request({ origin: "null", host: "admin.kmodern.ir" }))).toBe(false);
  });

  it("refuses when the host is unknown, rather than defaulting to a match", () => {
    expect(sameOrigin(request({ origin: "https://admin.kmodern.ir" }))).toBe(false);
  });

  it("allows a request with no Origin, which is a non-browser client", () => {
    // curl, a server-to-server call and the tests all look like this, and none of them has an ambient
    // session to ride. Refusing it would defend against nothing and break every one of them.
    expect(sameOrigin(request({ host: "admin.kmodern.ir" }))).toBe(true);
  });
});

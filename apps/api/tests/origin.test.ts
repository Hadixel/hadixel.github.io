// Who may make a change.
//
// CORS already answers "which browser may *read* this response". It does not answer "which page may
// *ask* for this to change" — a server answers CORS to the requester, but the damage of a cross-site
// POST is done by the time anyone answers, so an endpoint that relies on CORS to keep a browser away
// from a mutation is relying on the browser to be polite about the response it ignores.
//
// The panel had this check, five times, in five route handlers, each with its own idea of what the
// host header should be compared against. The gateway needs it once, on every mutating route, and the
// reason it is a rule rather than a convention is that a missing check is invisible: nothing fails,
// the endpoint simply answers.
//
// The rule, and the reasoning behind the one judgement call in it:
//
//   - An Origin that is not on the allowlist is refused. A cross-site page can make the browser send
//     its own origin, so its presence is the thing being checked.
//   - No Origin at all is allowed through. A browser always attaches one to a cross-site request, so
//     its absence means this did not come from a page — it is the panel's own server calling, or a
//     script with no referrer. Refusing those would break the one legitimate server-to-server caller
//     to defend against a browser attack that cannot present the header it is being checked for.

import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/common/origin.js";
import { OriginGuard } from "../src/common/guards/origin.guard.js";

const ALLOWED = ["http://localhost:3100", "http://localhost:3101"];

describe("the origin check on a mutating request", () => {
  it("refuses an origin that is not on the allowlist", () => {
    // The attack: a page on the shop's own domain, or anywhere at all, posting to the gateway.
    expect(originAllowed("https://evil.example", ALLOWED)).toBe(false);
  });

  it("refuses an allowlisted origin sent by the wrong scheme or port", () => {
    // Comparing loosely — a prefix match, or stripping the port — would let
    // `https://localhost:3100.evil.example` and `http://localhost:3100` through on a list that meant
    // to allow exactly two loopback addresses.
    expect(originAllowed("https://localhost:3100", ALLOWED)).toBe(false);
    expect(originAllowed("http://localhost:3102", ALLOWED)).toBe(false);
  });

  it("allows an origin that is on the allowlist", () => {
    expect(originAllowed("http://localhost:3100", ALLOWED)).toBe(true);
    expect(originAllowed("http://localhost:3101", ALLOWED)).toBe(true);
  });

  it("allows a request that carries no origin at all", () => {
    // The panel's own server action, forwarding the operator's session with no browser involved.
    expect(originAllowed(null, ALLOWED)).toBe(true);
  });

  it("refuses everything when the allowlist is empty, rather than allowing everything", () => {
    // A gateway booted with no configured origins is misconfigured, and the safe reading of that is
    // "nobody may write" — not "anybody may". An empty list must not be a wildcard.
    expect(originAllowed("http://localhost:3100", [])).toBe(false);
    expect(originAllowed(null, [])).toBe(false);
  });

  it("compares the whole origin, so a lookalike host is not an allowed host", () => {
    expect(originAllowed("http://localhost:3100.evil.example", ALLOWED)).toBe(false);
    expect(originAllowed("http://evil.example/?x=http://localhost:3100", ALLOWED)).toBe(false);
  });
});

// The wiring, which is the half that can be wrong while every rule above still passes. A guard applied
// to reads, or to nothing, would leave `originAllowed` perfectly correct and every mutating route
// unguarded — so these assert which requests it actually intercepts.
describe("the guard as it is actually installed", () => {
  function guard(allowed = ALLOWED) {
    return new OriginGuard({ corsOrigins: allowed } as never);
  }

  function request(method: string, origin?: string) {
    // A real `ExecutionContext` rather than a bare request object: the guard reads the request the way
    // Nest hands it over, and a fixture that skipped that would let the guard be written against
    // whatever shape the test happened to pass.
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers: origin === undefined ? {} : { origin },
        }),
      }),
    } as never;
  }

  it("blocks a write from a page that is not allowed to make one", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(() => guard().canActivate(request(method, "https://evil.example"))).toThrow();
    }
  });

  it("lets an allowed page through to every mutating method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(guard().canActivate(request(method, "http://localhost:3100"))).toBe(true);
    }
  });

  // Reads are not the attack this defends against, and refusing them would break the storefront's
  // cached pages the first time a shopper arrived from a link.
  it("does not interfere with reading", () => {
    expect(guard().canActivate(request("GET", "https://evil.example"))).toBe(true);
    expect(guard().canActivate(request("HEAD", "https://evil.example"))).toBe(true);
    // The CORS preflight carries no session and changes nothing.
    expect(guard().canActivate(request("OPTIONS", "https://evil.example"))).toBe(true);
  });

  it("lets the panel's own server-to-server call through, because it sends no origin", () => {
    expect(guard().canActivate(request("POST"))).toBe(true);
  });
});

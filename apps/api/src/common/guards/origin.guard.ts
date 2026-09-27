// The origin check, installed once for the whole gateway.
//
// A guard applied per controller is a guard somebody forgets. This one is registered globally, so a
// mutating route added next year is covered by the fact that it is mutating — there is nothing to
// remember and nothing to review. The cost of that choice is that the guard has to decide which
// requests it applies to, and that decision is the whole of tests/origin.test.ts's second half.

import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { ConfigService } from "../../config/config.service.js";
import { assertAllowedOrigin } from "../origin.js";

/** Read-only: a request that has not been read cannot have its origin checked. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method: string; headers: Record<string, unknown> }>();

    // Reads are left to CORS, which answers the browser rather than the requester. Refusing a GET here
    // would buy nothing — the response is already withheld from a disallowed page — and would cost the
    // storefront its pages for anyone arriving from a link.
    if (SAFE_METHODS.has(request.method)) return true;

    assertAllowedOrigin(
      typeof request.headers.origin === "string" ? request.headers.origin : null,
      this.config.corsOrigins,
    );
    return true;
  }
}

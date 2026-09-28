import { HttpStatus } from "@nestjs/common";
// Extensionless, and not by accident: `inventory.service.ts` is re-exported by `prisma/index.ts`,
// which `packages/db` forwards, which both clients bundle. A `.js` specifier type-checks and then
// fails the Next build, because the consuming bundler does not map `.js` onto the `.ts` source — the
// note at the top of `inventory.service.ts` says so, and this file is in its import graph.
import { GatewayException } from "../../common/exceptions/gateway.exception";

/**
 * A variant that is not there.
 *
 * Thrown by the shared stock primitive rather than signalled with a bare `Error("VARIANT_NOT_FOUND")`
 * and translated by each caller. There were three callers about to exist — the manual adjustment, the
 * product form's variant diff, and the order path — and three copies of a `message.includes(...)`
 * chain is three places for the wording to drift.
 */
export class VariantNotFoundException extends GatewayException {
  constructor(message = "تنوع پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

/**
 * A change that would take stock below what is already promised.
 *
 * A refusal rather than a clamp, and the distinction matters: silently reducing the change would write
 * a number nobody asked for, and an operator who typed "3" and got "7" has no way to learn that a
 * reservation was the reason.
 *
 * A 409, not a 400: the operator's number was fine and the world moved underneath it.
 */
export class StockReservedException extends GatewayException {
  constructor(message = "موجودی نمی‌تواند کمتر از مقدار رزروشده باشد") {
    super(HttpStatus.CONFLICT, message);
  }
}

/**
 * The row moved between the read and the write.
 *
 * Distinct from a 404 and from a rule violation, because the operator's input was not the problem and
 * the correct response is to re-read rather than retype. A plain read-then-write would let a change
 * computed from a stale row overwrite a hold taken in between — which is how a sold unit reappears.
 */
export class StockConflictException extends GatewayException {
  constructor(message = "موجودی هم‌زمان تغییر کرده؛ دوباره تلاش کنید") {
    super(HttpStatus.CONFLICT, message);
  }
}

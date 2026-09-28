// What the gateway accepts when a shopper opens a payment window.
//
// A class, because the decorators below run in the global validation pipe and nowhere else: a body
// read by a hand-written `request.json()` in a route handler is validated by nothing, which is how an
// unbounded provider reference ends up in a column.

import { IsString, Length } from "class-validator";

/**
 * The payment provider's reference for the window that was just opened.
 *
 * Bounded because it is written to a column and echoed back by the window's own status read, and
 * because a provider that answers with a megabyte of HTML is not a reference. The emptiness rule is
 * the point: an authority that is blank is not a reference, and recording one would replace a real
 * provider reference with nothing.
 */
export class PaymentAuthorityDto {
  @IsString({ message: "شناسه درگاه پرداخت معتبر نیست." })
  @Length(1, 200, { message: "شناسه درگاه پرداخت معتبر نیست." })
  authority!: string;
}

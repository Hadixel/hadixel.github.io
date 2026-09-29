// What the gateway accepts when a shopper opens a payment window.
//
// A class, because the decorators below run in the global validation pipe and nowhere else: a body
// read by a hand-written `request.json()` in a route handler is validated by nothing, which is how an
// unbounded provider reference ends up in a column.

import { IsString, Length, Matches } from "class-validator";

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

/**
 * Where the provider should send the shopper back.
 *
 * Bounded and shape-checked because it is handed to a third-party provider as a URL, and a callback
 * that is not an `http(s)` address is a redirect to a scheme the browser will act on. The gateway does
 * not verify that the host is the storefront's — it is the storefront that supplies this, and a
 * storefront that supplied its own attacker's URL would be attacking itself.
 */
export class StartPaymentDto {
  @IsString({ message: "آدرس بازگشت پرداخت معتبر نیست." })
  @Matches(/^https?:\/\/[^\s]+$/, { message: "آدرس بازگشت پرداخت معتبر نیست." })
  @Length(1, 500, { message: "آدرس بازگشت پرداخت معتبر نیست." })
  callbackUrl!: string;
}

/**
 * The provider's reference, on the way back.
 *
 * Bounded for the same reason as `PaymentAuthorityDto` — it is the same string, arriving from the
 * provider's query string rather than from our own body.
 */
export class VerifyPaymentDto {
  @IsString({ message: "شناسه درگاه پرداخت معتبر نیست." })
  @Length(1, 200, { message: "شناسه درگاه پرداخت معتبر نیست." })
  authority!: string;
}

// What the gateway accepts about an order request.
//
// Inbound shapes are classes, because the global validation pipe validates the instance and reads the
// DTO to decide which keys are known. Outbound shapes are plain types — nothing validates a response,
// and a class would imply otherwise.

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

/**
 * Paging, bounded.
 *
 * Bounded rather than trusted so one caller cannot ask the gateway to read every order in the shop into
 * memory. The ceiling is the largest page the panel's table renders without paging becoming a
 * rendering problem of its own.
 */
export class OrderQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  @Type(() => Number)
  offset: number = 0;
}

/** The panel's filters. Optional because the list is useful with none of them. */
export class OrderAdminQueryDto extends OrderQueryDto {
  @IsOptional()
  @IsIn(["AWAITING", "PAID", "REFUNDED", "FAILED"])
  paymentStatus?: string;

  @IsOptional()
  @IsIn(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"])
  fulfillmentStatus?: string;

  /**
   * An order number or a phone number.
   *
   * Bounded tightly: this is a substring match against a column, and an unbounded pattern is a scan
   * the operator triggers by accident.
   */
  @IsOptional()
  @IsString()
  @Length(1, 40)
  @Matches(/^[0-9\-+() ]{0,20}$|^1404-\d{1,8}$/, { message: "عبارت جست‌وجو معتبر نیست." })
  q?: string;
}

/** Which of the two status dimensions a change applies to. */
export class TransitionDimensionDto {
  @IsIn(["FULFILLMENT", "PAYMENT"], { message: "بُعد وضعیت معتبر نیست." })
  dimension!: "FULFILLMENT" | "PAYMENT";
}

/**
 * A payment outcome the storefront is reporting after the provider redirected the shopper back.
 *
 * The `refId` is optional because a failure has no reference to record. A success does, and it is what
 * a later refund has to quote back to the provider, so it is bounded rather than free-form.
 */
export class SettlePaymentBodyDto {
  @IsIn(["PAID", "FAILED"], { message: "نتیجه پرداخت معتبر نیست." })
  outcome!: "PAID" | "FAILED";

  @IsOptional()
  @IsString()
  @Length(0, 200)
  refId?: string;
}

/**
 * A requested status change.
 *
 * `to` is deliberately *not* validated against the transition table here. The table is the rule and it
 * lives with the code that applies the change; validating the target against a second copy of it in
 * the DTO is the drift this slice exists to remove. The service refuses an impossible transition, and
 * the panel is rendered from the transitions the gateway serves.
 */
export class StatusChangeDto extends TransitionDimensionDto {
  @IsString()
  @Length(1, 32)
  to!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}

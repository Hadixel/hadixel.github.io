// The manual-order form, as the gateway validates it.
//
// The panel used to check this in the action: enums against a list written beside the form, quantities
// as `Number.isInteger(...) && qty > 0 && qty <= 1000`, a duplicate-variant scan, a 100-line cap, and a
// note-length check. All of it was a fast-fail in the client — a rule the gateway could not see, and
// therefore a rule it could not enforce. A caller who skipped the panel's action got none of it.
//
// The bounds are here for a reason worth stating: an operator-placed order is the one write where a
// caller supplies a line count, and a body that says "a thousand lines" or "a million of this variant"
// has to be refused before it reaches a transaction rather than after.

import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from "class-validator";
import type { DeliveryFeeMode, PaymentMethod, ShippingMethod } from "../../generated/prisma/enums.js";

/** The most lines one manual order may carry. A telephone order, not a warehouse transfer. */
export const MAX_MANUAL_ORDER_LINES = 100;

/** The most of any one variant. Above this the order is a stock transfer and not an order. */
export const MAX_MANUAL_LINE_QTY = 1000;

export class ManualOrderLineDto {
  @IsString()
  @Length(1, 64)
  variantId!: string;

  @Type(() => Number)
  @IsInt({ message: "تعداد باید عدد صحیح باشد." })
  @Min(1, { message: "تعداد باید حداقل ۱ باشد." })
  @Max(MAX_MANUAL_LINE_QTY, { message: "تعداد یک تنوع بیش از حد است." })
  qty!: number;
}

export class ManualOrderDto {
  @IsString()
  @Length(1, 64)
  customerId!: string;

  /** An address object, validated by the schema package's own `addressSchema` in the service. */
  @IsObject()
  address!: Record<string, unknown>;

  @IsIn(["ONLINE", "CARD_TO_CARD", "COD"])
  paymentMethod!: PaymentMethod;

  @IsIn(["LOCAL", "POST", "BARBERI"])
  shippingMethod!: ShippingMethod;

  @IsIn(["FREE", "FLAT", "API_QUOTE", "FALLBACK_FLAT", "FREIGHT_COLLECT"])
  deliveryFeeMode!: DeliveryFeeMode;

  @Type(() => Number)
  @IsInt({ message: "هزینه ارسال نامعتبر است." })
  @Min(0, { message: "هزینه ارسال نامعتبر است." })
  deliveryFee!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "یادداشت ادمین بیش از حد طولانی است." })
  adminNote?: string;

  @IsArray()
  @ArrayMinSize(1, { message: "حداقل یک آیتم اضافه کنید." })
  @ArrayMaxSize(MAX_MANUAL_ORDER_LINES, { message: "تعداد آیتم‌های سفارش بیش از حد است." })
  @ValidateNested({ each: true })
  @Type(() => ManualOrderLineDto)
  lines!: ManualOrderLineDto[];
}

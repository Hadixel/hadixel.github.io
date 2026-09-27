// What the gateway accepts about a checkout, and what it returns.
//
// Response shapes are plain types: nothing validates a response, and a class would imply otherwise.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import type { OrderTotals } from "../totals.js";

/** A basket line. Bounded, because an unbounded quantity is a request to reserve a warehouse. */
export class CartLineDto {
  @IsString()
  @Length(1, 64)
  variantId!: string;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

/**
 * The delivery address.
 *
 * A class rather than the `addressSchema` the storefront used, because the global validation pipe
 * reflects over the instance: a zod schema would either be bypassed by the pipe or would have to be
 * re-run by hand, and a rule enforced in two places is a rule that will be enforced in one.
 */
export class AddressDto {
  @IsString()
  @Length(1, 200, { message: "نام گیرنده الزامی است." })
  recipientName!: string;

  @Matches(/^09\d{9}$/, { message: "شماره موبایل نامعتبر است." })
  recipientPhone!: string;

  @IsString()
  @Length(1, 64)
  province!: string;

  @IsString()
  @Length(1, 64)
  city!: string;

  @IsString()
  @Length(5, 500, { message: "آدرس کوتاه است." })
  addressLine!: string;

  @Matches(/^\d{10}$/, { message: "کد پستی باید ۱۰ رقم باشد." })
  postalCode!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 64)
  label?: string;
}

export class QuoteRequestDto {
  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;

  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  items!: CartLineDto[];

  @IsOptional()
  @IsString()
  @Length(0, 40)
  couponCode?: string;
}

export class PlaceOrderRequestDto extends QuoteRequestDto {
  @IsIn(["ONLINE", "CARD_TO_CARD", "COD"], { message: "روش پرداخت معتبر نیست." })
  paymentMethod!: "ONLINE" | "CARD_TO_CARD" | "COD";
}

/** A basket enriched with what the storefront needs to draw it: names, prices, stock, images. */
export class EnrichRequestDto {
  @ValidateNested({ each: true })
  @Type(() => CartLineDto)
  @ArrayMaxSize(100)
  items!: CartLineDto[];
}

export interface CheckoutQuote {
  totals: OrderTotals;
  weightKg: number;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod: string;
  shippingMethod: string;
  deliveryFee: number;
  /** Set when a code was entered and refused. The order is still placed, without the discount. */
  couponError?: string;
}

export interface CartLine {
  variantId: string;
  qty: number;
  price: number;
  productId: string;
  productName: string;
  categoryId: string;
  colorName: string | null;
  sku: string | null;
  image: string | null;
  weightKg: number;
  allowBackorder: boolean;
}

export interface EnrichedLine {
  variantId: string;
  productId: string;
  slug: string;
  productName: string;
  colorName: string | null;
  sku: string | null;
  price: number;
  qty: number;
  lineTotal: number;
  image: string | null;
  available: boolean;
  /** What the shopper may still add: free stock, or nothing for a sold-out line. */
  maxAddable: number;
}

export interface EnrichedCart {
  lines: EnrichedLine[];
  subtotal: number;
  totalCount: number;
  /** Lines the gateway could not resolve, so a cart can say what is missing rather than shrinking. */
  unavailable: { variantId: string; qty: number }[];
}

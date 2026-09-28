// What the gateway accepts about a discount.
//
// The split between this file and the service is the one the rest of the gateway keeps: a DTO holds
// what a field *is* and the service holds what a discount *means*. `@IsEnum` on `type` is a shape —
// it is one of three strings — and "a percentage may not be 101" is a rule about money, so it belongs
// with the rest of the shop's rules rather than in a decorator list that cannot see the other fields.
//
// The panel held all of it in `discountSchema`, a zod contract, and ran it itself. Two consequences
// worth recording, because they are why this exists rather than the panel's schema being reused:
//
//   - The zod contract was reachable from the storefront, so the same rule was enforceable only by a
//     client that could also simply not call it. A rule a client may skip is a convention.
//   - Its existence check ran in the panel, in a read that happened before the write — see
//     `discounts.service.ts` for what that allowed.
//
// Both classes are written out flat rather than sharing a base or using `PartialType`, for the
// reason `UpdateCategoryDto` gives: the update DTO is not the create DTO with the required flags
// dropped, because an absent field means "leave it alone" and the fields that may be *cleared* are
// exactly the nullable ones — a distinction `PartialType` cannot express.

// The canonicaliser lives with the rest of the rules and is imported rather than re-declared, so the
// pipe's judgement of the code and the service's stored value cannot come to disagree.
import { canonicalDiscountCode } from "../canonical-code.js";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from "class-validator";

/**
 * A code with something in it.
 *
 * The `/\S/` the other names in the gateway carry, and for the same reason: `@IsNotEmpty` accepts
 * three spaces, and a code of `"   "` is a code no shopper can type and no operator can explain. A
 * literal rather than a class holding an invisible code point, because such a class does not survive
 * being written to a file.
 */
const HAS_CONTENT = /\S/;

/**
 * The bounds on an id list.
 *
 * 200, because each list is checked against the catalogue inside the transaction, and an unbounded
 * `in` clause is a query whose cost a client decides. A discount naming more than 200 products is
 * not a discount, it is a mistake.
 */
const MAX_TARGETS = 200;

/** How a discount takes its value off. */
export enum DiscountTypeDto {
  PERCENT = "PERCENT",
  FIXED = "FIXED",
  FREE_DELIVERY = "FREE_DELIVERY",
}

/** What it applies to. Decides which id list the till reads. */
export enum DiscountScopeDto {
  ALL = "ALL",
  PRODUCTS = "PRODUCTS",
  CATEGORIES = "CATEGORIES",
  COLLECTIONS = "COLLECTIONS",
}

/** Whether a shopper has to produce a code for it. */
export enum DiscountModeDto {
  COUPON = "COUPON",
  AUTOMATIC = "AUTOMATIC",
}

export enum DiscountStatusDto {
  ACTIVE = "ACTIVE",
  DISABLED = "DISABLED",
}

/**
 * The code, canonicalised, for the pipe to judge.
 *
 * Trim then lowercase, and the order is the point: this is the write path, and the till matches on
 * the raw column. `Discount_code_idx` is an *ordinary* index, not a unique one — the model's comment
 * claims "unique nullable" and the migration says otherwise — so the only thing standing between two
 * spellings of one code and two rows the till serves arbitrarily is that this produces one string.
 *
 * A `@Transform` is necessary here and is deliberately *not* sufficient: the character class below
 * would otherwise see `" SUMMER "`, whose spaces are not in the class, and refuse a code that only
 * needed trimming. The same rule is applied again by `canonicalDiscountCode` in the service, because
 * a transform runs inside the validation pipe and nowhere else — a controller reached directly, or
 * any future writer that does not go through HTTP, would otherwise store the raw spelling. The
 * function is defined once and called from both.
 */
const CANONICAL_CODE = ({ value }: { value: unknown }): unknown =>
  canonicalDiscountCode(typeof value === "string" ? value : null);

/**
 * An ISO-8601 string that names its own offset — `Z` or `±HH:MM`.
 *
 * Required *alongside* `@IsISO8601` rather than instead of it, and the reason is measured rather
 * than remembered: run the two decorators over `"2026-01-01T00:00"` and both accept it, because
 * `strict: true` checks the format and not the presence of a zone. A bare local time is a time only
 * relative to a reader, and a discount's start is precisely the field where guessing wrong is a
 * discount that opens on the wrong day.
 */
const WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

export class SaveDiscountDto {
  @IsEnum(DiscountTypeDto, { message: "نوع تخفیف نامعتبر است." })
  type!: DiscountTypeDto;

  @IsEnum(DiscountScopeDto, { message: "دامنه تخفیف نامعتبر است." })
  scope!: DiscountScopeDto;

  @IsEnum(DiscountModeDto, { message: "حالت تخفیف نامعتبر است." })
  mode!: DiscountModeDto;

  /**
   * The coupon code.
   *
   * Judged *after* the transform, which is what makes the bounds mean anything: "SUMMER " is judged
   * as "summer", so padding cannot smuggle in a 33rd character past a length checked beforehand.
   */
  @IsOptional()
  @IsString({ message: "کد تخفیف باید متن باشد." })
  @Transform(CANONICAL_CODE)
  @Matches(HAS_CONTENT, { message: "کد تخفیف الزامی است." })
  @Matches(/^[a-z0-9_-]{3,32}$/, { message: "کد تخفیف ۳ تا ۳۲ حرف/رقم" })
  code?: string;

  /**
   * How much off: a percentage, a TOMAN amount, or nothing at all for free delivery.
   *
   * Bounded here because an unbounded `Float` is a row a later calculation multiplies against without
   * limit. What the number *means* — that a percentage is 1..100 and free delivery is 0 — is the
   * service's, because it cannot be decided without reading `type`.
   */
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "مقدار تخفیف باید عدد باشد." },
  )
  @Min(0, { message: "مقدار تخفیف نمی‌تواند منفی باشد." })
  @Max(100_000_000, { message: "مقدار تخفیف بیش از حد بزرگ است." })
  value!: number;

  /** A cap on what a percentage discount may take off, in TOMAN. */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "سقف تخفیف باید عدد باشد." },
  )
  @Min(0, { message: "سقف تخفیف نمی‌تواند منفی باشد." })
  maxAmount?: number;

  @IsOptional()
  @IsArray({ message: "شناسه محصولات باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد محصولات بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه محصول تکراری است" })
  @IsString({ each: true, message: "شناسه محصول باید متن باشد." })
  productIds?: string[];

  @IsOptional()
  @IsArray({ message: "شناسه دسته‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد دسته‌ها بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه دسته تکراری است" })
  @IsString({ each: true, message: "شناسه دسته باید متن باشد." })
  categoryIds?: string[];

  @IsOptional()
  @IsArray({ message: "شناسه مجموعه‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد مجموعه‌ها بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه مجموعه تکراری است" })
  @IsString({ each: true, message: "شناسه مجموعه باید متن باشد." })
  collectionIds?: string[];

  /**
   * When it starts, as an ISO-8601 instant.
   *
   * Required, and `@IsISO8601` rather than a string the service tries to parse, because "a string
   * that is a date" is a shape and shapes belong to the pipe. The panel sent the browser's
   * `datetime-local` value and guessed at the zone with a regex in its own action; interpreting a
   * wall-clock string is a browser convention, so it stays the panel's translation. What the gateway
   * stores is an instant.
   */
  @IsISO8601({ strict: true }, { message: "زمان شروع باید تاریخ معتبر باشد." })
  // Paired with `@IsISO8601` rather than trusting it alone: with `strict: true` it *accepts*
  // `"2026-01-01T00:00"`, which is exactly the wall-clock string this rule exists to refuse. A bare
  // local time means something different to every reader, and a discount's start is the field where
  // guessing wrong opens the discount on the wrong day.
  @Matches(WITH_ZONE, { message: "زمان شروع باید با منطقهٔ زمانی مشخص شود." })
  startsAt!: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "زمان پایان باید تاریخ معتبر باشد." })
  @Matches(WITH_ZONE, { message: "زمان پایان باید با منطقهٔ زمانی مشخص شود." })
  endsAt?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "حداقل مبلغ سبد باید عدد باشد." },
  )
  @Min(0, { message: "حداقل مبلغ سبد نمی‌تواند منفی باشد." })
  minOrderSubtotal?: number;

  @IsOptional()
  @IsInt({ message: "سقف استفاده کل باید عدد صحیح باشد." })
  @Min(1, { message: "سقف استفاده کل باید بزرگ‌تر از صفر باشد." })
  maxUsesTotal?: number;

  @IsOptional()
  @IsInt({ message: "سقف استفاده هر مشتری باید عدد صحیح باشد." })
  @Min(1, { message: "سقف استفاده هر مشتری باید بزرگ‌تر از صفر باشد." })
  maxUsesPerCustomer?: number;

  @IsOptional()
  @IsEnum(DiscountStatusDto, { message: "وضعیت تخفیف نامعتبر است." })
  status?: DiscountStatusDto;
}

/**
 * The same discount, partially.
 *
 * Every field optional, and an absent field means *unchanged* — which is the difference from a
 * create, and the reason the mode is resolved against the stored row on this path rather than being
 * read from the body alone.
 */
export class UpdateDiscountDto {
  @IsOptional()
  @IsEnum(DiscountTypeDto, { message: "نوع تخفیف نامعتبر است." })
  type?: DiscountTypeDto;

  @IsOptional()
  @IsEnum(DiscountScopeDto, { message: "دامنه تخفیف نامعتبر است." })
  scope?: DiscountScopeDto;

  @IsOptional()
  @IsEnum(DiscountModeDto, { message: "حالت تخفیف نامعتبر است." })
  mode?: DiscountModeDto;

  /** Canonicalised and bounded exactly as on create — see `SaveDiscountDto.code`. */
  @IsOptional()
  @IsString({ message: "کد تخفیف باید متن باشد." })
  @Transform(CANONICAL_CODE)
  @Matches(HAS_CONTENT, { message: "کد تخفیف الزامی است." })
  @Matches(/^[a-z0-9_-]{3,32}$/, { message: "کد تخفیف ۳ تا ۳۲ حرف/رقم" })
  code?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "مقدار تخفیف باید عدد باشد." },
  )
  @Min(0, { message: "مقدار تخفیف نمی‌تواند منفی باشد." })
  @Max(100_000_000, { message: "مقدار تخفیف بیش از حد بزرگ است." })
  value?: number;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "سقف تخفیف باید عدد باشد." },
  )
  @Min(0, { message: "سقف تخفیف نمی‌تواند منفی باشد." })
  maxAmount?: number;

  @IsOptional()
  @IsArray({ message: "شناسه محصولات باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد محصولات بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه محصول تکراری است" })
  @IsString({ each: true, message: "شناسه محصول باید متن باشد." })
  productIds?: string[];

  @IsOptional()
  @IsArray({ message: "شناسه دسته‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد دسته‌ها بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه دسته تکراری است" })
  @IsString({ each: true, message: "شناسه دسته باید متن باشد." })
  categoryIds?: string[];

  @IsOptional()
  @IsArray({ message: "شناسه مجموعه‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_TARGETS, { message: "تعداد مجموعه‌ها بیش از حد مجاز است." })
  @ArrayUnique((id: unknown) => id, { message: "شناسه مجموعه تکراری است" })
  @IsString({ each: true, message: "شناسه مجموعه باید متن باشد." })
  collectionIds?: string[];

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "زمان شروع باید تاریخ معتبر باشد." })
  @Matches(WITH_ZONE, { message: "زمان شروع باید با منطقهٔ زمانی مشخص شود." })
  startsAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "زمان پایان باید تاریخ معتبر باشد." })
  @Matches(WITH_ZONE, { message: "زمان پایان باید با منطقهٔ زمانی مشخص شود." })
  endsAt?: string;

  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "حداقل مبلغ سبد باید عدد باشد." },
  )
  @Min(0, { message: "حداقل مبلغ سبد نمی‌تواند منفی باشد." })
  minOrderSubtotal?: number;

  @IsOptional()
  @IsInt({ message: "سقف استفاده کل باید عدد صحیح باشد." })
  @Min(1, { message: "سقف استفاده کل باید بزرگ‌تر از صفر باشد." })
  maxUsesTotal?: number;

  @IsOptional()
  @IsInt({ message: "سقف استفاده هر مشتری باید عدد صحیح باشد." })
  @Min(1, { message: "سقف استفاده هر مشتری باید بزرگ‌تر از صفر باشد." })
  maxUsesPerCustomer?: number;

  @IsOptional()
  @IsEnum(DiscountStatusDto, { message: "وضعیت تخفیف نامعتبر است." })
  status?: DiscountStatusDto;
}

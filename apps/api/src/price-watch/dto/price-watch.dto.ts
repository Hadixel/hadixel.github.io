// What the gateway accepts for the price watch.
//
// Two shapes, and the split is the same one every other feature's DTOs make: a field's *type* and
// *bounds* are decorators here, and a decision that needs a second field is the service's. "A daily
// schedule needs a time" is a sentence about `mode` and `dailyAt` together, so it cannot be a
// decorator on either — the pipe is given one field at a time.
//
// Every `message:` is Persian because it is the sentence the operator reads. `common/validation.ts`
// is what makes that true: the pipe raises a `GatewayException` carrying the first failure, and the
// error filter trusts a message only from that class. Remove that factory and every `message:`
// below becomes decorative again, which is a fact about this file worth knowing before editing it.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

/** The two schedules. Declared here as a runtime object because the generated Prisma enums are string unions. */
export const PRICE_WATCH_MODES = ["INTERVAL", "DAILY"] as const;
export type PriceWatchModeInput = (typeof PRICE_WATCH_MODES)[number];

/** The queue's own filters, so the panel can ask for "what is pending" without a second vocabulary. */
export const PRICE_CHANGE_STATUSES = ["PENDING", "APPLIED", "IGNORED"] as const;
export type PriceChangeStatusInput = (typeof PRICE_CHANGE_STATUSES)[number];

export const PRICE_CHANGE_STATUS_LABELS: Record<PriceChangeStatusInput, string> = {
  PENDING: "در انتظار بررسی",
  APPLIED: "اعمال‌شده",
  IGNORED: "رد‌شده",
};

// A date carries its zone, and this matters more here than anywhere else in the gateway: the
// operator's queue is rendered in Tehran wall-clock time and a bare `"2026-10-01T00:00"` would mean
// something different to every reader. `@IsISO8601({ strict: true })` *accepts* that bare string —
// measured, not remembered, and recorded in ADR-0003 — so the zone regex runs alongside it and
// refuses a value without one. The panel converts the browser's `datetime-local` field, which is
// Tehran wall-clock, into an instant before it asks.
const WITH_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** The review list's page. */
export class PriceChangesQueryDto {
  @IsOptional()
  @IsIn(PRICE_CHANGE_STATUSES, { message: "وضعیت تغییر قیمت شناخته نشده است." })
  status?: PriceChangeStatusInput;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "تاریخ شروع بازهٔ زمانی نامعتبر است." })
  @Matches(WITH_ZONE, { message: "تاریخ شروع بازهٔ زمانی باید با منطقهٔ زمانی مشخص شود." })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: "تاریخ پایان بازهٔ زمانی نامعتبر است." })
  @Matches(WITH_ZONE, { message: "تاریخ پایان بازهٔ زمانی باید با منطقهٔ زمانی مشخص شود." })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "شمارهٔ صفحه نامعتبر است." })
  @Min(1, { message: "شمارهٔ صفحه نامعتبر است." })
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "اندازهٔ صفحه نامعتبر است." })
  @Min(1, { message: "اندازهٔ صفحه نام无效 است." })
  @Max(100, { message: "اندازهٔ صفحه نامعتبر است." })
  size = 50;
}

export class SavePriceWatchConfigDto {
  @IsBoolean({ message: "وضعیت فعال بودن نظارت قیمت نامعتبر است." })
  enabled!: boolean;

  @IsIn(PRICE_WATCH_MODES, { message: "حالت زمان‌بندی شناخته نشده است." })
  mode!: PriceWatchModeInput;

  /**
   * Minutes between runs.
   *
   * The bounds are an hour and a week. An hour is below the point where a check is worth anything —
   * it is a fetch of a third party's whole catalogue — and a week is above the point where a
   * competitor's price change is still news. Both ends are also what the two schedules above them
   * mean: a "daily" watch at an hourly interval is the same thing written twice, and the panel
   * can offer both.
   *
   * The unit is minutes because it is the unit the arithmetic is done in; the panel shows hours and
   * converts. A column named `intervalHours` holding `360` for "every six hours" was the alternative
   * and it is a field whose name and value disagree.
   */
  @IsInt({ message: "فاصلهٔ زمانی باید عدد صحیح باشد." })
  @Min(60, { message: "فاصلهٔ زمانی کمتر از یک ساعت نامعتبر است." })
  @Max(10080, { message: "فاصلهٔ زمانی بیشتر از یک هفته نامعتبر است." })
  intervalMinutes!: number;

  /**
   * Tehran `HH:mm`, meaningful only in DAILY mode.
   *
   * A pattern rather than a parsed time because a `Date` here would be an instant on some unnamed
   * day, and the value is a wall clock in a named zone. The zone is not an offset in this field and
   * is not derivable from one: see `price-watch.schedule.ts`.
   */
  @IsOptional()
  @IsString({ message: "ساعت اجرا باید متن باشد." })
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { message: "ساعت اجرا باید به شکل ساعت:دقیقه باشد." })
  dailyAt?: string;
}

/**
 * Apply recorded changes.
 *
 * `ids` is capped rather than length-checked: `@Length` on an array reads the *number of elements*
 * as a string's length and refuses the empty list outright, which is the one input this route is
 * built around — "apply everything pending" is expressed by sending no ids at all. The ADR records
 * that mistake costing a round trip in the other features' collection DTOs.
 */
export class ApplyPriceChangesDto {
  @IsOptional()
  @IsArray({ message: "فهرست شناسه‌ها باید آرایه باشد." })
  @ArrayMaxSize(500, { message: "در هر بار حداکثر ۵۰۰ تغییر قیمت می‌توان اعمال کرد." })
  @IsString({ each: true, message: "شناسهٔ تغییر قیمت باید متن باشد." })
  @MaxLength(64, { each: true, message: "شناسهٔ تغییر قیمت بیش از حد طولانی است." })
  ids?: string[];
}

/** Set some changes aside without applying them. Same body as the apply, which is the point. */
export class IgnorePriceChangesDto extends ApplyPriceChangesDto {}

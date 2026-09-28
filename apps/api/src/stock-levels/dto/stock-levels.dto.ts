// What the gateway accepts about a stock request.
//
// A class, because the global validation pipe validates the instance and reads the DTO to decide
// which keys are known — and a query string is a client, in exactly the way a form body is.

import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

/**
 * The page size the panel's table asks for, and the most this read will serve.
 *
 * A default and a ceiling rather than one number. The panel's 50 rows is a rendering decision it is
 * entitled to make; a caller picking its own ceiling would be picking how much of the shop's stock
 * the gateway holds in memory, which is not a decision a caller makes.
 */
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * The stock list's search and its paging.
 *
 * There is no threshold parameter, and that is the point of the feature: the line is the shop's
 * setting, resolved in one place, and a caller able to send its own number would be a second place
 * to resolve it — the panel sending `threshold=0` to see everything in red, and the badge counting
 * a different set of rows from the one the operator is looking at.
 */
export class StockLevelQueryDto {
  /** A SKU or part of a product name. Empty means "no filter", as an empty search box means. */
  @IsOptional()
  @IsString({ message: "عبارت جست‌وجو باید متن باشد." })
  @Length(0, 200, { message: "عبارت جست‌وجو بیش از حد طولانی است." })
  q?: string;

  @IsOptional()
  @IsInt({ message: "شمارهٔ صفحه باید عدد صحیح باشد." })
  @Min(1, { message: "شمارهٔ صفحه باید از ۱ شروع شود." })
  @Max(100_000, { message: "شمارهٔ صفحه بیش از حد بزرگ است." })
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt({ message: "تعداد ردیف باید عدد صحیح باشد." })
  @Min(1, { message: "تعداد ردیف باید بزرگ‌تر از صفر باشد." })
  @Max(MAX_PAGE_SIZE, { message: "تعداد ردیف بیش از حد مجاز است." })
  @Type(() => Number)
  size: number = PAGE_SIZE;
}

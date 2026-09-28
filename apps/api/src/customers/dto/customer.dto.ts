// What the gateway accepts about a customer request.
//
// Inbound shapes are classes, because the global validation pipe validates the instance and reads
// the DTO to decide which keys are known. Outbound shapes are plain types — nothing validates a
// response, and a class would imply otherwise.

import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Length, Max, Min } from "class-validator";

/**
 * The page size the panel's table asks for, and the most this read will serve.
 *
 * A default and a ceiling rather than one number, because the panel stating its page size is a
 * rendering decision it is entitled to make and a caller choosing its own ceiling is not: the
 * largest page served here is the largest table the panel's pagination still renders as a list.
 */
const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * The customer's search and its paging.
 *
 * Every field is optional, because the list is useful with none of them — and `size` is bounded
 * rather than trusted, so a caller cannot ask the gateway to read every customer in the shop into
 * memory. The panel asks for 25 and says so in its own request; the ceiling is what the gateway is
 * willing to serve, not what the page would like.
 */
export class CustomerListQueryDto {
  /**
   * What the operator typed into the search box.
   *
   * Length-bounded and not pattern-bounded, because the predicate it feeds is an OR over a name, a
   * Persian phone number and an email address, and no one character class covers all three. An
   * empty value is allowed and means "no filter" — the same thing the panel's own trimmed `q` meant
   * when the box was cleared, and refusing it would turn an empty search box into an error page.
   */
  @IsOptional()
  @IsString({ message: "عبارت جست‌وجو باید متن باشد." })
  @Length(0, 200, { message: "عبارت جست‌وجو بیش از حد طولانی است." })
  q?: string;

  /** Which page, counting from one. */
  @IsOptional()
  @IsInt({ message: "شمارهٔ صفحه باید عدد صحیح باشد." })
  @Min(1, { message: "شمارهٔ صفحه باید از ۱ شروع شود." })
  @Max(100_000, { message: "شمارهٔ صفحه بیش از حد بزرگ است." })
  @Type(() => Number)
  page: number = 1;

  /** How many rows on it, and the most this read will serve. */
  @IsOptional()
  @IsInt({ message: "تعداد ردیف باید عدد صحیح باشد." })
  @Min(1, { message: "تعداد ردیف باید بزرگ‌تر از صفر باشد." })
  @Max(MAX_PAGE_SIZE, { message: "تعداد ردیف بیش از حد مجاز است." })
  @Type(() => Number)
  size: number = PAGE_SIZE;
}

// What the gateway accepts about a product list request.
//
// A class, because the global validation pipe validates the instance and reads the DTO to decide
// which query keys are known. The panel's page used to build a Prisma `where` out of its own
// `searchParams` — including a regular expression deciding whether a `category` was an id at all —
// which meant the only thing standing between a query string and a filter was a check in a file that
// did not own the rules. The same checks live here now, where the query is actually read.

import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

/** The page size the operator's table uses, and the one a caller asking for nothing gets. */
export const PRODUCT_PAGE_SIZE = 25;

/**
 * The largest page the gateway will read for one caller.
 *
 * A ceiling rather than a trust: the panel asks for its own size, and anything that can reach this
 * route can otherwise name `size=1000000` and have the gateway read the whole catalogue into memory
 * to answer with.
 */
export const MAX_PRODUCT_PAGE_SIZE = 100;

export class ProductListQueryDto {
  /**
   * A free-text term, matched against the four columns an operator types into one box.
   *
   * Bounded rather than shaped. The panel's box takes a name, a model, a brand or a slug, and the
   * meaning of a search is the columns it is matched against — not a character class. A caller may
   * send whatever is on its screen; the length bound is what keeps the match from becoming the scan
   * the operator triggers by accident.
   */
  @IsOptional()
  @IsString()
  @Length(1, 80, { message: "عبارت جست‌وجو معتبر نیست." })
  q?: string;

  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "ARCHIVED"], { message: "وضعیت محصول معتبر نیست." })
  status?: string;

  /**
   * One category's id.
   *
   * The panel's own regular expression, kept rather than loosened: a category filter is a foreign
   * key, and "ALL" is a value the page sends to mean *no* filter. Letting both through as a filter
   * would ask for a category literally named `ALL`.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64, { message: "شناسه دسته معتبر نیست." })
  @Matches(/^[a-z0-9_-]+$/i, { message: "شناسه دسته معتبر نیست." })
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "شماره صفحه باید عدد باشد." })
  @Min(1, { message: "شماره صفحه معتبر نیست." })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "اندازه صفحه باید عدد باشد." })
  @Min(1, { message: "اندازه صفحه معتبر نیست." })
  @Max(MAX_PRODUCT_PAGE_SIZE, { message: "اندازه صفحه معتبر نیست." })
  size: number = PRODUCT_PAGE_SIZE;
}

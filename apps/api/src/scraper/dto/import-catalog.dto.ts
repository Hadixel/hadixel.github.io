// What the gateway accepts about a scraper import.
//
// These shapes used to be a TypeScript interface in the panel, which is worth naming because it is why
// the import could hold rules nobody could reach: an interface is erased at runtime, so a scraper
// result arriving from a client was trusted field by field on the strength of a type the compiler had
// checked at a call site that may not be the one sending the bytes. The panel's own fast-fails sat in
// front of them and were skippable by anything posting to the route directly — the panel's form was
// not the only way in, it was just the usual one.
//
// The split follows the gateway's own: a DTO holds what a field *is*, and the service holds what a
// category *means*. The slug rule is here because it is a shape — a string that is not a slug — and the
// publish-requires-a-price rule is in the service because it is a sentence about two fields at once
// (`publish` and `price`) and a decorator cannot read its neighbour.
//
// `edits` is a list rather than a record keyed by slug, and that is the one departure from the panel's
// wire shape. A record's keys cannot be decorated, so `whitelist` would either strip every edit or
// refuse it, and the panel's "only these seven fields are editable" rule would have to stay a
// hand-written set inside the service — a rule a client owns. As a list each entry is a DTO, so the
// editable fields are the ones this file declares and anything else is refused by the pipe with a
// message naming it.

import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { SLUG_PATTERN } from "../vocabulary.js";

/**
 * A field with something in it.
 *
 * `@IsNotEmpty` rejects `''` and accepts `"   "`, and a product named three spaces is a row the
 * operator's list renders as a blank line and a shopper cannot find. A literal whitespace class does
 * not survive being written into a source file, so this is the escape rather than the character.
 */
const HAS_CONTENT = /\S/;

/** One scraped spec: a label and its value, as a manufacturer wrote them. */
export class ScraperSpecDto {
  @IsString({ message: "عنوان ویژگی باید متن باشد." })
  @IsNotEmpty({ message: "عنوان ویژگی الزامی است." })
  @Matches(HAS_CONTENT, { message: "عنوان ویژگی الزامی است." })
  @Length(1, 120, { message: "عنوان ویژگی بیش از حد طولانی است." })
  label!: string;

  @IsString({ message: "مقدار ویژگی باید متن باشد." })
  @IsNotEmpty({ message: "مقدار ویژگی الزامی است." })
  @Matches(HAS_CONTENT, { message: "مقدار ویژگی الزامی است." })
  @Length(1, 500, { message: "مقدار ویژگی بیش از حد طولانی است." })
  value!: string;
}

/** One scraped product, as the review screen selected it. */
export class ScraperCatalogItemDto {
  /**
   * The item's own address, which is the product's slug.
   *
   * This is the rule the panel used to apply as a fast-fail inside its own import, where a client could
   * skip it: `/^[a-z0-9][a-z0-9-]*$/`. It is here instead because it is a property of the string, and
   * the service checks the same constant so the two cannot drift apart.
   */
  @IsString({ message: "اسلاگ باید متن باشد." })
  @IsNotEmpty({ message: "اسلاگ الزامی است." })
  @Matches(SLUG_PATTERN, { message: "اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره می‌پذیرد." })
  @Length(1, 200, { message: "اسلاگ بیش از حد طولانی است." })
  slug!: string;

  @IsString({ message: "نام باید متن باشد." })
  @IsNotEmpty({ message: "نام محصول الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام محصول الزامی است." })
  @Length(1, 300, { message: "نام محصول بیش از حد طولانی است." })
  name!: string;

  @IsOptional()
  @IsString({ message: "برند باید متن باشد." })
  @Length(0, 100, { message: "برند بیش از حد طولانی است." })
  brand?: string;

  @IsString({ message: "دسته باید متن باشد." })
  @IsNotEmpty({ message: "دسته الزامی است." })
  @Length(1, 80, { message: "دسته بیش از حد طولانی است." })
  category!: string;

  @IsString({ message: "زیردسته باید متن باشد." })
  @IsNotEmpty({ message: "زیردسته الزامی است." })
  @Length(1, 80, { message: "زیردسته بیش از حد طولانی است." })
  subCategory!: string;

  @IsArray({ message: "رنگ‌ها باید فهرست باشند." })
  @ArrayMaxSize(50, { message: "تعداد رنگ‌ها بیش از حد مجاز است." })
  @IsString({ each: true, message: "هر رنگ باید متن باشد." })
  @Length(1, 40, { each: true, message: "نام رنگ بیش از حد طولانی است." })
  colors!: string[];

  /**
   * The scraped price, which is not necessarily a number a shop would take.
   *
   * Bounded below by nothing on purpose: a manufacturer page can say `-1` or `0`, and the panel has
   * always imported those as a zero price rather than refusing the whole catalogue over one row. What
   * it has never allowed is publishing one — that rule reads `publish` as well, so it is the service's.
   */
  @IsNumber({}, { message: "قیمت باید عدد باشد." })
  price!: number;

  /** Per-colour prices, when a manufacturer quotes them. The values are judged in the service. */
  @IsOptional()
  @IsObject({ message: "قیمت رنگ‌ها باید شیء باشد." })
  priceByColor?: Record<string, number>;

  @IsOptional()
  @IsString({ message: "واحد قیمت باید متن باشد." })
  @IsIn(["TOMAN"], { message: "واحد قیمت پشتیبانی نمی‌شود." })
  priceCurrency?: "TOMAN";

  @IsOptional()
  @IsNumber({}, { message: "زمان دریافت قیمت باید عدد باشد." })
  priceFetchedAt?: number;

  @IsOptional()
  @IsBoolean({ message: "موجودی قیمت باید درست یا نادرست باشد." })
  priceInStock?: boolean;

  @IsOptional()
  @IsString({ message: "شناسه منبع قیمت باید متن باشد." })
  @Length(0, 500, { message: "شناسه منبع قیمت بیش از حد طولانی است." })
  priceSourceId?: string;

  @IsOptional()
  @IsString({ message: "نشانی منبع قیمت باید متن باشد." })
  @Length(0, 2000, { message: "نشانی منبع قیمت بیش از حد طولانی است." })
  priceSourceUrl?: string;

  /** The manufacturer's own model id, which becomes the product's model when there is one. */
  @IsOptional()
  @IsString({ message: "شناسه مدل باید متن باشد." })
  @Length(0, 200, { message: "شناسه مدل بیش از حد طولانی است." })
  _id?: string;

  @IsOptional()
  @IsString({ message: "توضیحات باید متن باشد." })
  @Length(0, 5000, { message: "توضیحات بیش از حد طولانی است." })
  description?: string;

  @IsArray({ message: "ویژگی‌ها باید فهرست باشند." })
  @ArrayMaxSize(50, { message: "تعداد ویژگی‌ها بیش از حد مجاز است." })
  @IsString({ each: true, message: "هر ویژگی باید متن باشد." })
  features!: string[];

  @IsArray({ message: "ویژگی‌های فنی باید فهرست باشند." })
  @ArrayMaxSize(100, { message: "تعداد ویژگی‌های فنی بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => ScraperSpecDto)
  specs!: ScraperSpecDto[];
}

/**
 * One operator's correction to a scraped item, keyed by the item it corrects.
 *
 * The seven editable fields are the whole of what a review may change. Anything else is refused by the
 * pipe as an unknown field, which is the rule the panel enforced with a hand-written `allowed` set —
 * a set that said which fields were editable but not what a *value* in one of them had to be.
 */
export class ScraperCatalogEditDto {
  @IsString({ message: "اسلاگ ویرایش باید متن باشد." })
  @IsNotEmpty({ message: "اسلاگ ویرایش الزامی است." })
  @Matches(SLUG_PATTERN, { message: "اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره می‌پذیرد." })
  @Length(1, 200, { message: "اسلاگ ویرایش بیش از حد طولانی است." })
  slug!: string;

  @IsOptional()
  @IsString({ message: "نام باید متن باشد." })
  @IsNotEmpty({ message: "نام نمی‌تواند خالی باشد." })
  @Matches(HAS_CONTENT, { message: "نام نمی‌تواند خالی باشد." })
  @Length(1, 300, { message: "نام بیش از حد طولانی است." })
  name?: string;

  @IsOptional()
  @IsNumber({}, { message: "قیمت باید عدد باشد." })
  @Min(0, { message: "قیمت نمی‌تواند منفی باشد." })
  @Max(1_000_000_000_000, { message: "قیمت بیش از حد بزرگ است." })
  price?: number;

  @IsOptional()
  @IsString({ message: "توضیحات باید متن باشد." })
  @Length(0, 5000, { message: "توضیحات بیش از حد طولانی است." })
  description?: string;

  @IsOptional()
  @IsArray({ message: "ویژگی‌ها باید فهرست باشند." })
  @ArrayMaxSize(50, { message: "تعداد ویژگی‌ها بیش از حد مجاز است." })
  @IsString({ each: true, message: "هر ویژگی باید متن باشد." })
  @Matches(HAS_CONTENT, { each: true, message: "ویژگی نمی‌تواند خالی باشد." })
  @Length(1, 300, { each: true, message: "ویژگی بیش از حد طولانی است." })
  features?: string[];

  @IsOptional()
  @IsArray({ message: "ویژگی‌های فنی باید فهرست باشند." })
  @ArrayMaxSize(100, { message: "تعداد ویژگی‌های فنی بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => ScraperSpecDto)
  specs?: ScraperSpecDto[];

  @IsOptional()
  @IsString({ message: "دسته باید متن باشد." })
  @IsNotEmpty({ message: "دسته نمی‌تواند خالی باشد." })
  @Length(1, 80, { message: "دسته بیش از حد طولانی است." })
  category?: string;

  @IsOptional()
  @IsString({ message: "زیردسته باید متن باشد." })
  @IsNotEmpty({ message: "زیردسته نمی‌تواند خالی باشد." })
  @Length(1, 80, { message: "زیردسته بیش از حد طولانی است." })
  subCategory?: string;
}

/**
 * The images the panel materialised for one variant of one item.
 *
 * The gateway stores image URLs; it does not fetch, hash or write files. That work happens in the
 * panel, which is the process that owns the media store and the scraper's download directory, and it
 * has to happen before the import so a variant row is never written with a URL to a file that does
 * not exist. So the caller prepares the images and sends where they ended up — the one part of the
 * operation the gateway cannot do for itself.
 */
export class PreparedVariantImagesDto {
  @IsString({ message: "اسلاگ تصویر باید متن باشد." })
  @IsNotEmpty({ message: "اسلاگ تصویر الزامی است." })
  @Matches(SLUG_PATTERN, { message: "اسلاگ فقط حروف کوچک انگلیسی، عدد و خط تیره می‌پذیرد." })
  @Length(1, 200, { message: "اسلاگ تصویر بیش از حد طولانی است." })
  slug!: string;

  @IsString({ message: "رنگ تصویر باید متن باشد." })
  @IsNotEmpty({ message: "رنگ تصویر الزامی است." })
  @Length(1, 40, { message: "نام رنگ بیش از حد طولانی است." })
  color!: string;

  @IsArray({ message: "تصاویر باید فهرست باشند." })
  @ArrayMaxSize(30, { message: "تعداد تصاویر بیش از حد مجاز است." })
  @IsString({ each: true, message: "هر نشانی تصویر باید متن باشد." })
  @Length(1, 2000, { each: true, message: "نشانی تصویر بیش از حد طولانی است." })
  images!: string[];
}

/**
 * How the image preparation went.
 *
 * Sent rather than derived because the counts are not a function of what arrived: a materialised image
 * whose download failed still contributes a fallback URL, so a count of URLs would report a success
 * that did not happen. The operator is told "two images failed and kept their original address", and
 * that sentence is only true if the panel's own tally is what travels.
 */
export class PreparedImageStatsDto {
  @IsInt({ message: "تعداد تصاویر آماده‌شده باید عدد صحیح باشد." })
  @Min(0)
  ready!: number;

  @IsInt({ message: "تعداد خطاهای تصویر باید عدد صحیح باشد." })
  @Min(0)
  errors!: number;
}

export class ImportCatalogDto {
  @IsArray({ message: "فهرست محصولات باید آرایه باشد." })
  @ArrayMinSize(1, { message: "حداقل یک محصول برای وارد کردن لازم است." })
  @ArrayMaxSize(500, { message: "تعداد محصولات بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => ScraperCatalogItemDto)
  items!: ScraperCatalogItemDto[];

  @IsOptional()
  @IsArray({ message: "ویرایش‌ها باید آرایه باشد." })
  @ArrayMaxSize(500, { message: "تعداد ویرایش‌ها بیش از حد مجاز است." })
  @ArrayUnique((edit: ScraperCatalogEditDto) => edit?.slug, {
    message: "برای یک محصول بیش از یک ویرایش ارسال شده است",
  })
  @ValidateNested({ each: true })
  @Type(() => ScraperCatalogEditDto)
  edits?: ScraperCatalogEditDto[];

  @IsOptional()
  @IsArray({ message: "تصاویر آماده‌شده باید آرایه باشد." })
  @ArrayMaxSize(2000, { message: "تعداد تصاویر آماده‌شده بیش از حد مجاز است." })
  @ValidateNested({ each: true })
  @Type(() => PreparedVariantImagesDto)
  preparedImages?: PreparedVariantImagesDto[];

  @IsDefined()
  @IsObject({ message: "آمار تصاویر الزامی است." })
  @ValidateNested()
  @Type(() => PreparedImageStatsDto)
  preparedImageStats!: PreparedImageStatsDto;

  /**
   * Whether the imported products are published or left as drafts.
   *
   * Required rather than optional-and-defaulted, because the two values are the difference between a
   * product a shopper can buy and one an operator can still edit, and a missing field must not be
   * read as a decision.
   */
  @IsBoolean({ message: "انتشار باید درست یا نادرست باشد." })
  publish!: boolean;
}

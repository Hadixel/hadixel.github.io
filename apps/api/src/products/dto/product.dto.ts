// What the gateway accepts about a product and its variants.
//
// The largest body in the gateway, and the one where the shape/meaning split earns its keep. A variant
// is a class rather than a bare type because the whole list arrives as one JSON string in a form
// field: without `@ValidateNested` the pipe sees an array of plain objects and checks nothing inside
// them, so a variant with no SKU — which the schema's `sku @unique` then rejects — would be stored,
// and the operator would get a driver error naming a column rather than a field.
//
// The rules that are *shape* are here. The ones that need to read a second field are in
// `products.service.ts`, because a decorator list cannot see its neighbours: "a variant must belong
// to this product" and "stock may not fall below what is reserved" both need the row.

import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * A name with something in it.
 *
 * The `/\S/` the other names in the gateway carry, for the reason `@IsNotEmpty` is not enough: it
 * rejects `''` and accepts three spaces, and a product named `"   "` is a row the catalogue's list
 * renders as a blank line. A literal rather than a class holding an invisible code point, because such
 * a class does not survive being written to a file.
 */
const HAS_CONTENT = /\S/;

/**
 * How many variants one product may carry.
 *
 * 100, carried over from the panel's own `variants.length > 100`. The list is diffed row by row in one
 * transaction, so an unbounded count is a request that holds a transaction open for as long as a client
 * takes to send it.
 */
const MAX_VARIANTS = 100;

/** How many free-text features one product may list. */
const MAX_FEATURES = 50;

export enum ProductStatusDto {
  DRAFT = "DRAFT",
  PUBLISHED = "PUBLISHED",
  ARCHIVED = "ARCHIVED",
}

/** One variant of a product, as the form's editor sends it. */
export class VariantInputDto {
  /**
   * The variant's id, when the form is editing one that already exists.
   *
   * Optional because the form also *creates*: a row with no id is a new variant and one with an id is
   * an edit. That is the form's semantics, and the gateway reads it rather than being told separately
   * — a second "is this a create" flag would be a second thing to get out of step with the editor.
   */
  @IsOptional()
  @IsString({ message: "شناسه تنوع باید متن باشد." })
  @Length(1, 64, { message: "شناسه تنوع نامعتبر است." })
  id?: string;

  @IsString({ message: "نام رنگ باید متن باشد." })
  @IsNotEmpty({ message: "نام رنگ الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام رنگ الزامی است." })
  @Length(1, 100, { message: "نام رنگ بیش از حد طولانی است." })
  colorName!: string;

  @IsOptional()
  @IsString({ message: "کد رنگ باید متن باشد." })
  @Length(0, 32, { message: "کد رنگ بیش از حد طولانی است." })
  colorCode?: string;

  /**
   * The stock-keeping unit.
   *
   * Trimmed but *not* lowercased, and the difference is deliberate: a SKU is an operator-facing label
   * that a warehouse scans off the shelf, so folding its case would change the string printed on the
   * label. The padding is the part that has to go — `"ABC-1 "` and `"ABC-1"` are the same unit, and
   * the column is `@unique`, so leaving the space would store two SKUs for one variant.
   *
   * The `IsNotEmpty`/`Matches` pair sits *above* the transform on purpose, matching the order the pipe
   * runs: the value is trimmed first and then judged, so a SKU of three spaces is refused rather than
   * becoming an empty string.
   */
  @IsString({ message: "SKU باید متن باشد." })
  @IsNotEmpty({ message: "SKU الزامی است." })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @Matches(HAS_CONTENT, { message: "SKU الزامی است." })
  @Length(1, 64, { message: "SKU بیش از حد طولانی است." })
  sku!: string;

  /**
   * The price, in TOMAN.
   *
   * Non-negative and bounded here; the column is a bare `Float` with no constraint, so without this it
   * is a row a later calculation multiplies against without limit.
   */
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { message: "قیمت باید عدد باشد." },
  )
  @Min(0, { message: "قیمت نمی‌تواند منفی باشد." })
  price!: number;

  /**
   * How many are on the shelf.
   *
   * A whole number, because the column is `Int` and a float reaching it is a driver error rather than
   * a rounding. The floor — that it may not fall below what is already reserved — is the service's,
   * because that is a rule about a hold rather than about the number, and it lives with
   * `setVariantStock` so the manual adjustment and this form cannot drift apart.
   */
  @IsInt({ message: "موجودی باید عدد صحیح باشد." })
  @Min(0, { message: "موجودی نمی‌تواند منفی باشد." })
  stock!: number;

  @IsBoolean({ message: "پیش‌فروش باید درست یا نادرست باشد." })
  allowBackorder!: boolean;

  /**
   * The variant's images, in order.
   *
   * Capped because the column is a `String[]` the storefront renders one by one, and an unbounded
   * list is a request whose cost a client chooses.
   */
  @IsArray({ message: "تصاویر باید فهرست باشند." })
  @ArrayMaxSize(20, { message: "تعداد تصاویر بیش از حد مجاز است." })
  @IsString({ each: true, message: "آدرس تصویر باید متن باشد." })
  images!: string[];
}

export class SaveProductDto {
  @IsString({ message: "نام محصول باید متن باشد." })
  @IsNotEmpty({ message: "نام محصول الزامی است." })
  @Matches(HAS_CONTENT, { message: "نام محصول الزامی است." })
  @Length(1, 300, { message: "نام محصول بیش از حد طولانی است." })
  name!: string;

  @IsString({ message: "برند باید متن باشد." })
  @IsNotEmpty({ message: "برند الزامی است." })
  @Matches(HAS_CONTENT, { message: "برند الزامی است." })
  @Length(1, 300, { message: "برند بیش از حد طولانی است." })
  brand!: string;

  /**
   * The model, as a plain searchable field — "203", not a marketing name.
   *
   * Required, because `Product.model` is a non-null column. The panel's form checked for it *after*
   * building the whole payload rather than before, so the check happened later than the rest.
   */
  @IsString({ message: "مدل باید متن باشد." })
  @IsNotEmpty({ message: "مدل الزامی است." })
  @Matches(HAS_CONTENT, { message: "مدل الزامی است." })
  @Length(1, 300, { message: "مدل بیش از حد طولانی است." })
  model!: string;

  /**
   * The address this product is published at.
   *
   * Optional, and canonicalised on the way in like every other slug in the gateway: the panel had no
   * slug function at all, so a product's address was whatever the operator typed, and `"موبایل"` and
   * `"mobile"` were two products. Blank falls back to a slug derived from the name.
   */
  @IsOptional()
  @IsString({ message: "اسلاگ باید متن باشد." })
  @Length(0, 300, { message: "اسلاگ بیش از حد طولانی است." })
  slug?: string;

  @IsString({ message: "شناسه دسته باید متن باشد." })
  @IsNotEmpty({ message: "دسته‌بندی الزامی است." })
  @Length(1, 64, { message: "شناسه دسته نامعتبر است." })
  categoryId!: string;

  @IsOptional()
  @IsString({ message: "توضیحات باید متن باشد." })
  @Length(0, 20_000, { message: "توضیحات بیش از حد طولانی است." })
  description?: string;

  @IsOptional()
  @IsArray({ message: "ویژگی‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_FEATURES, { message: "تعداد ویژگی‌ها بیش از حد مجاز است." })
  @IsString({ each: true, message: "ویژگی باید متن باشد." })
  features?: string[];

  @IsOptional()
  @IsBoolean({ message: "پیش‌فروش باید درست یا نادرست باشد." })
  allowBackorder?: boolean;

  @IsEnum(ProductStatusDto, { message: "وضعیت محصول نامعتبر است." })
  status!: ProductStatusDto;

  /**
   * The variants, as a set to replace rather than a set to patch.
   *
   * Replace, because that is what the form's editor means: it sends every variant the product has,
   * and a variant it no longer sends is one the operator removed. A patch-style API would need a
   * separate "delete these ids" list, and the form cannot tell "I deleted this row" from "this row
   * never loaded".
   *
   * An empty list is refused by the service rather than here, and the reason is worth stating: a
   * product with no variant is unsellable and the storefront's product page has nothing to render.
   */
  @IsArray({ message: "تنوع‌ها باید فهرست باشند." })
  @ArrayMaxSize(MAX_VARIANTS, { message: "تعداد تنوع‌های محصول بیش از حد مجاز است." })
  // The panel checked this in a loop and reported it generically. Here the message names the list, and
  // the extractor is the field the DTO actually validates on.
  @ArrayUnique((variant: VariantInputDto) => variant?.sku, { message: "SKU تکراری است" })
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  variants!: VariantInputDto[];

  /**
   * The category's specification values, keyed by spec-field id.
   *
   * A record rather than a class, so `forbidNonWhitelisted` cannot police it — what polices it is the
   * service, which accepts only ids belonging to a spec field of *this* product's category. A value
   * for a field of another category is not a free-form extra: `ProductSpecValue` is a real foreign-key
   * pair, and the panel wrote whatever the form carried.
   */
  @IsOptional()
  @IsObject({ message: "مقادیر مشخصات نامعتبر است." })
  specValues!: Record<string, string>;

  /**
   * The product's own extra label/value pairs, free of any spec field.
   *
   * Kept distinct from `specValues` on purpose. The two arrived as one field in the panel's form and
   * are two different things in the schema: one is `ProductSpecValue` rows joined against the
   * category's declared fields, the other an opaque `Json` blob. Merging them is how a spec value
   * gets saved as an extra and then never appears in the category's filter.
   */
  @IsOptional()
  @IsObject({ message: "مشخصات اضافی نامعتبر است." })
  extraSpecs!: Record<string, string>;

  /**
   * SEO defaults for this product, judged by the shared contract rather than by a copy of it.
   *
   * Optional and untyped here on purpose: `seoSchema` is a zod contract the schema package owns, and
   * the service runs it. A class-validator copy of a zod schema would be the second definition of the
   * SEO rules, which is the defect this whole move exists to end.
   */
  @IsOptional()
  @IsObject({ message: "فرم SEO نامعتبر است." })
  seo?: Record<string, unknown>;
}
